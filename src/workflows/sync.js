import {requireThat,sourceEqual,parseStatus,addHold,releaseHold,completeSource} from '../shared/domain.js';
import {sourceChanges,statusChanges} from '../adapters/github/writer.js';
import {appendEvent} from '../state/journal.js';

const TERMINAL=['synced','stopped','reassigned'];
function signature(snapshot,targetSlug,predicate){return JSON.stringify(Object.values(snapshot.entries).filter(e=>e.type!=='tree'&&e.path.startsWith(targetSlug+'/')&&predicate(e.path.slice(targetSlug.length+1))).map(e=>[e.path,e.sha,e.mode,e.type]).sort((a,b)=>a[0].localeCompare(b[0])));}
function sourceSignature(snapshot,targetSlug){return signature(snapshot,targetSlug,p=>p==='main.pjs'||p==='main.html'||p.startsWith('src/'));}
function instructionSignature(snapshot,targetSlug){return signature(snapshot,targetSlug,p=>p==='prompt.md'||p.startsWith('scratch/'));}
function hasFolder(snapshot,targetSlug){return Object.keys(snapshot.entries).some(p=>p===targetSlug||p.startsWith(targetSlug+'/'));}
function sameStatus(a,b){return a.account===b.account&&a.action===b.action&&a.state===b.state;}
export function approvedLocal(p,g){return p.kind==='source'&&['review','edit'].includes(p.approval?.kind)&&p.nativeVerified===true&&g?.localDone===true&&g.localApproved===true&&g.savedVerified===true;}

export function syncRecords(state){
  const rows=Object.values(state.pending).map(p=>({...p,scope:'pending'}));
  for(const r of Object.values(state.utility||{}))if(r.pendingStatus&&!rows.some(p=>p.requestId===r.id&&!TERMINAL.includes(p.phase)))rows.push({...r.pendingStatus,id:'utility-status-'+r.id,requestId:r.id,generatorId:r.generatorId,slug:r.request.slug,repository:r.request.repository,kind:'status',scope:'utility',phase:r.pendingStatus.phase||'prepared'});
  return rows;
}

export class Synchronizer {
  constructor({store,services,guard=async()=>{},assertCurrent=()=>{},uuid=()=>crypto.randomUUID(),now=()=>Date.now(),publishGitHub=null,importWorkflow=null}){Object.assign(this,{store,services,guard,assertCurrent,uuid,now,publishGitHub,importWorkflow});this.busy=false;this.nextAt=0;this.comparisons=new Map();}
  async record(id){const row=syncRecords(await this.store.read()).find(p=>p.id===id);requireThat(row,'sync-record-unavailable');return row;}
  async update(id,change){await this.guard();return this.store.transact(s=>{this.assertCurrent(s);const row=syncRecords(s).find(p=>p.id===id);requireThat(row,'sync-record-unavailable');const result=change(row,s);if(row.scope==='pending')s.pending[id]=row;else if(s.utility[row.requestId].pendingStatus){const {scope:_,...value}=row;s.utility[row.requestId].pendingStatus=value;}return result;});}
  async describe(p,client){
    const baseline=await client.github.snapshot(p.baseCommit),current=await client.github.snapshot();
    const statusPath=p.slug+'/status.md',entry=current.entries[statusPath];let status=null;
    if(entry)status=parseStatus(await client.github.text(current,statusPath));
    if(status&&status.account!==p.status.account)return {kind:'account-conflict',baseline,current,status};
    if(instructionSignature(baseline,p.slug)!==instructionSignature(current,p.slug))return {kind:'request-conflict',baseline,current,status};
    const state=await this.store.read(),g=state.generators[p.generatorId],approved=approvedLocal(p,g),mode=p.syncKind||(p.approval?.kind==='github'||p.requestId&&state.utility?.[p.requestId]?.request.status.action==='publish_from_github'?'status':p.kind);
    if(!status){return {kind:!hasFolder(current,p.slug)&&!hasFolder(baseline,p.slug)&&p.kind==='source'&&mode==='source'?'write':'request-conflict',baseline,current,status,mode,approved};}
    let remote=null;
    if(current.entries[p.slug+'/main.pjs']&&current.entries[p.slug+'/main.html'])remote=await client.github.source(current,p.slug);
    const desiredSource=p.kind==='source'?p.source:null;
    if(sameStatus(status,p.status)&&(desiredSource&&remote&&sourceEqual(desiredSource,remote)||!desiredSource&&sourceSignature(baseline,p.slug)===sourceSignature(current,p.slug)))return {kind:'same',baseline,current,status,remote,mode,approved};
    let baseStatus=null;
    if(baseline.entries[statusPath])baseStatus=parseStatus(await client.github.text(baseline,statusPath));
    if(!baseStatus||!sameStatus(status,baseStatus))return {kind:'request-conflict',baseline,current,status,remote,mode,approved};
    const history=await client.github.api('/commits?path='+encodeURIComponent(statusPath)+'&sha='+current.commit+'&per_page=1');
    const originalHistory=await client.github.api('/commits?path='+encodeURIComponent(statusPath)+'&sha='+baseline.commit+'&per_page=1');
    if(!Array.isArray(history)||!Array.isArray(originalHistory)||!history[0]?.sha||history[0].sha!==originalHistory[0]?.sha)return {kind:'request-conflict',baseline,current,status,remote,mode,approved};
    const changed=sourceSignature(baseline,p.slug)!==sourceSignature(current,p.slug);
    if(changed&&!(desiredSource&&remote&&sourceEqual(desiredSource,remote)))return {kind:approved?'source-conflict':'request-conflict',baseline,current,status,remote,mode,approved};
    return {kind:'write',baseline,current,status,remote,mode,approved};
  }
  async annotate(id,kind){
    const p=await this.record(id);if(p.reason===kind&&p.phase===kind)return;
    await this.update(id,(p,s)=>{
      if(TERMINAL.includes(p.phase))return;p.phase=kind;p.reason=kind;
      const g=s.generators[p.generatorId];
      if(g&&['source-conflict','request-conflict','account-conflict'].includes(kind))s.generators[p.generatorId]=addHold(g,{id:'sync-'+id,kind});
    });
  }
  async complete(id,commit){
    await this.update(id,(p,s)=>{
      requireThat(!['stopped','reassigned'].includes(p.phase),'sync-record-stopped');p.phase='synced';p.reason=null;p.commit=commit;
      const g=s.generators[p.generatorId];
      if(g){s.generators[p.generatorId]=releaseHold({...g,status:p.status,githubCommit:commit},'sync-'+id);if(!s.generators[p.generatorId].holds.length&&p.kind==='source'){p.kind='status';delete p.source;delete p.previousSource;delete p.approval;}}
      const r=p.requestId&&s.utility?.[p.requestId];if(r&&r.pendingStatus&&sameStatus(r.pendingStatus.status,p.status)){if(p.scope==='pending')r.pendingStatus=null;r.statusCommit=commit;if(r.localDone)r.phase='done';}
      if(p.writeId&&s.jobs[p.writeId]?.phase==='unknown'){s.jobs[p.writeId].phase='cancelled';s.jobs[p.writeId].resolution='desired-state-present';s.jobs[p.writeId].remoteOutcome='unknown';}
      appendEvent(s,{component:'github',outcome:'verified',nativeId:p.generatorId||null});
    });
  }
  async syncOne(id){
    await this.guard();let p=await this.record(id);if(TERMINAL.includes(p.phase))return p;
    const state=await this.store.read(),g=state.generators[p.generatorId];
    if(state.settings.account.accountId!==p.status.account){await this.annotate(id,'account-conflict');return this.record(id);}
    const importCommand=g?.importCommand&&state.commands[g.importCommand];
    if(importCommand&&p.phase!=='local-done'&&this.importWorkflow){
      const workflow=await this.importWorkflow(importCommand);await workflow.run(importCommand);return this.record(id);
    }
    // Unverified snapshots can be inspected, but cannot authorize GitHub source replacement.
    if(p.kind==='source'&&(p.nativeVerified!==true||!g?.localDone||!g.savedVerified)){await this.annotate(id,'snapshot-unverified');return this.record(id);}
    let client;
    try{client=await this.services(p.repository);}catch{await this.annotate(id,'original-access-unavailable');return this.record(id);}
    try{
      const related=p.writeId||(p.requestId&&state.jobs[p.requestId+'-status-'+p.status.state]?p.requestId+'-status-'+p.status.state:null);
      if(related&&!p.writeId){await this.update(id,row=>{row.writeId=related;});p=await this.record(id);}
      const prior=p.writeId&&(await this.store.read()).jobs[p.writeId];
      if(prior&&['dispatched','unknown'].includes(prior.phase)){
        const receipt=await client.writer.reconcile(p.writeId,{fresh:true});
        if(!receipt.verified){await this.annotate(id,'unknown');return this.record(id);}
      }
      const result=await this.describe(p,client);
      if(result.kind==='same'){await this.complete(id,result.current.commit);return this.record(id);}
      if(result.kind!=='write'){await this.annotate(id,result.kind);return this.record(id);}
      if(p.writeId){
        const job=(await this.store.read()).jobs[p.writeId];
        if(job&&!['rejected','cancelled','prepared'].includes(job.phase)){
          const receipt=await client.writer.reconcile(p.writeId,{fresh:true});
          if(!receipt.verified){await this.annotate(id,'unknown');return this.record(id);}
          const latest=await this.describe(await this.record(id),client);
          if(latest.kind==='same'){await this.complete(id,latest.current.commit);return this.record(id);}
          await this.annotate(id,latest.kind==='write'?(latest.approved?'source-conflict':'request-conflict'):latest.kind);return this.record(id);
        }
        if(job?.phase==='cancelled'&&job.resolution!=='known-not-dispatched'){await this.annotate(id,'unknown');return this.record(id);}
      }
      // Known ref rejection may be retried only after this fresh request/source check.
      if(p.writeId&&(await this.store.read()).jobs[p.writeId]?.phase==='prepared')await this.store.transact(s=>{this.assertCurrent(s);s.jobs[p.writeId].phase='cancelled';s.jobs[p.writeId].resolution='known-not-dispatched';});
      const writeId='sync-'+this.uuid();await this.update(id,(row)=>{requireThat(!TERMINAL.includes(row.phase),'sync-record-stopped');row.writeId=writeId;row.phase='pending';row.reason=null;});
      p=await this.record(id);requireThat(!['stopped','reassigned'].includes(p.phase),'sync-record-stopped');
      if(client.writer.guard){const originalGuard=client.writer.guard;client.writer.guard=async()=>{await originalGuard();requireThat(!TERMINAL.includes((await this.record(id)).phase),'sync-record-stopped');};}
      const changes=result.mode==='status'?statusChanges(p.slug,p.status):sourceChanges(result.current,p.slug,p.source,p.status);
      const receipt=await client.writer.write({id:writeId,targetSlug:p.slug,baseline:result.current,changes,operation:result.mode==='status'?'status':'source'});
      if(!receipt.verified){await this.annotate(id,'unknown');return this.record(id);}
      const latest=await this.describe(p,client);
      if(latest.kind==='same')await this.complete(id,latest.current.commit);else await this.annotate(id,latest.kind==='write'?'unknown':latest.kind);
    }catch(error){
      const current=await this.record(id),job=current.writeId&&(await this.store.read()).jobs[current.writeId];
      if(!TERMINAL.includes(current.phase))await this.annotate(id,job?.phase==='unknown'?'unknown':error.message==='github-write-not-live-verified'?'live-verification-required':error.message==='github-generator-conflict'?'request-conflict':'offline');
    }
    return this.record(id);
  }
  async tick(){
    if(this.busy||this.now()<this.nextAt)return;this.busy=true;this.nextAt=this.now()+30000;
    try{for(const p of syncRecords(await this.store.read()))if(!TERMINAL.includes(p.phase)&&!['source-conflict','request-conflict','account-conflict','snapshot-unverified'].includes(p.phase)){await this.guard();await this.syncOne(p.id);}}
    finally{this.busy=false;}
  }
  async compare(id){
    const p=await this.record(id),client=await this.services(p.repository),result=await this.describe(p,client);
    requireThat(result.kind==='source-conflict'&&result.approved&&result.remote,'approved-source-conflict-required');
    requireThat(!p.writeId||!['dispatched','unknown'].includes((await this.store.read()).jobs[p.writeId]?.phase),'github-result-unknown');
    const token=this.uuid();this.comparisons.set(token,{id,commit:result.current.commit,source:structuredClone(p.source),remote:structuredClone(result.remote),repository:p.repository,status:result.status});
    // Text is returned only to the focused comparison; never to journal/diagnostics.
    return {token,local:structuredClone(p.source),remote:result.remote,commit:result.current.commit};
  }
  async decide(token,choice,confirmed){
    requireThat(confirmed===true&&['local','github'].includes(choice),'source-confirmation-required');
    const compared=this.comparisons.get(token);requireThat(compared,'comparison-required');
    const p=await this.record(compared.id),client=await this.services(p.repository),result=await this.describe(p,client);
    requireThat(result.kind==='source-conflict'&&result.approved&&result.current.commit===compared.commit&&sourceEqual(p.source,compared.source)&&sourceEqual(result.remote,compared.remote),'comparison-changed');
    requireThat(!p.writeId||!['dispatched','unknown'].includes((await this.store.read()).jobs[p.writeId]?.phase),'github-result-unknown');
    requireThat(JSON.stringify(p.repository)===JSON.stringify(compared.repository),'comparison-repository-changed');
    if(choice==='github'){
      requireThat(this.publishGitHub,'publication-unavailable');await this.publishGitHub({pending:p,snapshot:result.current,source:completeSource(result.remote)});this.comparisons.delete(token);return;
    }
    // The explicit decision rebases only synchronization. The approved live copy
    // and original snapshot stay protected; the normal atomic writer preserves history.
    await this.update(p.id,(row,s)=>{row.baseCommit=result.current.commit;row.phase='local-done';row.reason=null;row.writeId=null;row.comparedCommit=result.current.commit;const g=s.generators[row.generatorId];if(g)s.generators[row.generatorId]=releaseHold(g,'sync-'+row.id);});
    this.comparisons.delete(token);return this.syncOne(p.id);
  }
}
