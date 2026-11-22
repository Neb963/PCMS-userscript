import {requireThat,sourceEqual,parseStatus,addHold,releaseHold,completeSource} from '../shared/domain.js';
import {sourceChanges,statusChanges} from '../adapters/github/writer.js';
import {pendingWork,repositoryKey} from '../state/settings.js';
import {appendEvent} from '../state/journal.js';

const TERMINAL=['synced','stopped','reassigned','superseded'];
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

export async function sourceFingerprint(source){const bytes=new TextEncoder().encode(JSON.stringify(completeSource(source))),hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
export async function enqueueSyncAction(store,action,id,{confirmed=false,comparison=null}={},uuid=()=>crypto.randomUUID()){
  requireThat(['recheck','local','github','reassign','stop'].includes(action),'unsupported-sync-action');
  if(action!=='recheck')requireThat(confirmed===true,'sync-confirmation-required');const commandId=uuid();
  const saved=await store.transact(s=>{
    const p=syncRecords(s).find(p=>p.id===id);requireThat(p,'sync-record-unavailable');requireThat(s.settings.account.accountId===p.status.account,'account-assignment-mismatch');
    s.commands||={};const duplicate=Object.values(s.commands).find(c=>c.kind==='sync-action'&&c.pendingId===id&&c.action===action&&['queued','running'].includes(c.phase)&&JSON.stringify(c.comparison)===JSON.stringify(comparison));if(duplicate)return duplicate.id;
    if(action==='stop'){
      requireThat(!Object.values(s.workers).some(w=>p.generatorId&&w.generatorId===p.generatorId&&w.role==='development'&&['opening','busy','lost'].includes(w.phase)),'resolve-development-before-stop');
      for(const row of syncRecords(s))if(row.id===id||p.generatorId&&row.generatorId===p.generatorId){if(row.scope==='pending')s.pending[row.id].stopRequested=true;else s.utility[row.requestId].pendingStatus.stopRequested=true;}
      if(p.generatorId&&s.generators[p.generatorId])s.generators[p.generatorId].stopRequested=true;
      for(const r of Object.values(s.utility||{}))if(r.id===p.requestId||p.generatorId&&r.generatorId===p.generatorId)r.stopRequested=true;
    }
    s.commands[commandId]={id:commandId,kind:'sync-action',action,pendingId:id,account:p.status.account,repository:p.repository,targetRepository:action==='reassign'?s.settings.github?.repository||null:null,comparison,phase:'queued'};return commandId;
  });return {queued:true,id:saved.result};
}

export class Synchronizer {
  constructor({store,services,guard=async()=>{},assertCurrent=()=>{},uuid=()=>crypto.randomUUID(),now=()=>Date.now(),publishGitHub=null,importWorkflow=null}){Object.assign(this,{store,services,guard,assertCurrent,uuid,now,publishGitHub,importWorkflow});this.busy=false;this.nextAt=0;this.comparisons=new Map();this.inFlight=new Map();this.commandsBusy=false;}
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
      requireThat(!['stopped','reassigned'].includes(p.phase)&&!p.stopRequested,'sync-record-stopped');p.phase='synced';p.reason=null;p.commit=commit;
      const g=s.generators[p.generatorId];
      if(g){s.generators[p.generatorId]=releaseHold({...g,status:p.status,githubCommit:commit},'sync-'+id);if(!s.generators[p.generatorId].holds.length&&p.kind==='source'){p.kind='status';delete p.source;delete p.previousSource;delete p.approval;}}
      const r=p.requestId&&s.utility?.[p.requestId];if(r&&r.pendingStatus&&sameStatus(r.pendingStatus.status,p.status)){if(p.scope==='pending')r.pendingStatus=null;r.statusCommit=commit;if(r.localDone)r.phase='done';}
      if(p.writeId&&s.jobs[p.writeId]?.phase==='unknown'){s.jobs[p.writeId].phase='cancelled';s.jobs[p.writeId].resolution='desired-state-present';s.jobs[p.writeId].remoteOutcome='unknown';}
      appendEvent(s,{component:'github',outcome:'verified',nativeId:p.generatorId||null});
    });
  }
  syncOne(id){
    if(this.inFlight.has(id))return this.inFlight.get(id);const running=this.synchronize(id);this.inFlight.set(id,running);running.finally(()=>{if(this.inFlight.get(id)===running)this.inFlight.delete(id);}).catch(()=>{});return running;
  }
  async synchronize(id){
    await this.guard();let p=await this.record(id);if(TERMINAL.includes(p.phase)||p.stopRequested)return p;
    if(p.decision?.choice==='github')return this.queuePublication({pending:p});
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
      p=await this.record(id);requireThat(!['stopped','reassigned'].includes(p.phase)&&!p.stopRequested,'sync-record-stopped');
      if(client.writer.guard){const originalGuard=client.writer.guard;client.writer.guard=async()=>{await originalGuard();const pending=await this.record(id);requireThat(!TERMINAL.includes(pending.phase)&&!pending.stopRequested,'sync-record-stopped');};}
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
    try{for(const p of syncRecords(await this.store.read()))if(!TERMINAL.includes(p.phase)&&!['publication-queued','source-conflict','request-conflict','account-conflict','snapshot-unverified'].includes(p.phase)){await this.guard();await this.syncOne(p.id);}}
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
  async queuePublication({pending:p,snapshot=null,source=null}){
    await this.guard();const client=await this.services(p.repository);
    if(p.phase==='publication-queued')return p;
    let decision=p.decision;
    if(!decision){
      requireThat(snapshot&&source,'comparison-required');
      decision={choice:'github',writeId:'choose-'+this.uuid(),comparedCommit:snapshot.commit,source:completeSource(source),phase:'prepared'};
      await this.update(p.id,row=>{requireThat(row.phase==='source-conflict'&&!row.stopRequested,'source-conflict-required');row.decision=decision;row.phase='publication-pending';});
    }
    try{
      const baseline=await client.github.snapshot(decision.comparedCommit),current=await client.github.snapshot();
      requireThat(instructionSignature(baseline,p.slug)===instructionSignature(current,p.slug)&&sourceEqual(await client.github.source(current,p.slug),decision.source),'comparison-changed');
      const status=parseStatus(await client.github.text(current,p.slug+'/status.md'));
      requireThat(status.account===p.status.account,'account-assignment-mismatch');
      const ready={account:p.status.account,action:'publish_from_github',state:'ready'};
      const prior=(await this.store.read()).jobs[decision.writeId];
      let receipt;
      if(prior&&prior.phase!=='prepared')receipt=await client.writer.reconcile(decision.writeId,{fresh:true});
      else{
        requireThat(current.commit===decision.comparedCommit,'comparison-changed');
        receipt=await client.writer.write({id:decision.writeId,targetSlug:p.slug,baseline,changes:statusChanges(p.slug,ready),operation:'status'});
      }
      if(!receipt.verified){await this.update(p.id,row=>{row.phase='publication-unknown';row.decision.phase='unknown';});return this.record(p.id);}
      const latest=await client.github.snapshot(),latestStatus=parseStatus(await client.github.text(latest,p.slug+'/status.md'));
      const history=await client.github.api('/commits?path='+encodeURIComponent(p.slug+'/status.md')+'&sha='+latest.commit+'&per_page=1');
      requireThat(sameStatus(latestStatus,ready)&&history[0]?.sha===receipt.commit&&sourceEqual(await client.github.source(latest,p.slug),decision.source)&&instructionSignature(baseline,p.slug)===instructionSignature(latest,p.slug),'publication-request-changed');
      const id='publication-'+this.uuid(),instructions=Object.values(latest.entries).filter(e=>e.path===p.slug+'/prompt.md'||e.path.startsWith(p.slug+'/scratch/')).map(e=>[e.path,e.sha]);
      const request={valid:true,slug:p.slug,repository:p.repository,commit:latest.commit,requestCommit:receipt.commit,readyTransition:false,status:ready,instructions,replacesPendingId:p.id};
      await this.update(p.id,(row,s)=>{
        if(row.phase==='publication-queued')return;
        requireThat(row.decision.writeId===decision.writeId&&!TERMINAL.includes(row.phase)&&!row.stopRequested,'source-decision-changed');
        row.phase='publication-queued';row.decision.phase='queued';row.decision.commit=receipt.commit;row.decision.successorRequest=id;
        s.requestQueue||={};s.requestQueue[id]={id,request,phase:'queued',closed:false};
      });return this.record(p.id);
    }catch(error){
      const job=(await this.store.read()).jobs[decision.writeId];
      await this.update(p.id,row=>{if(!TERMINAL.includes(row.phase)&&!row.stopRequested){row.phase=job?.phase==='unknown'?'publication-unknown':error.message==='github-write-not-live-verified'?'live-verification-required':'request-conflict';row.reason=error.message==='account-assignment-mismatch'?'account-conflict':row.phase;row.decision.phase=job?.phase==='unknown'?'unknown':'held';}});return this.record(p.id);
    }
  }
  async enqueueDecision(token,choice,confirmed){
    requireThat(confirmed===true&&['local','github'].includes(choice),'source-confirmation-required');const compared=this.comparisons.get(token);requireThat(compared,'comparison-required');
    const comparison={commit:compared.commit,local:await sourceFingerprint(compared.source),remote:await sourceFingerprint(compared.remote)};
    return enqueueSyncAction(this.store,choice,compared.id,{confirmed:true,comparison});
  }
  async tickCommands(){
    if(this.commandsBusy)return;this.commandsBusy=true;
    try{
      await this.guard();const command=Object.values((await this.store.read()).commands||{}).find(c=>c.kind==='sync-action'&&c.phase==='queued');if(!command)return;
      await this.store.transact(s=>{this.assertCurrent(s);requireThat(s.commands[command.id].phase==='queued','sync-command-claimed');s.commands[command.id].phase='running';});
      try{
        const p=await this.record(command.pendingId),state=await this.store.read();
        requireThat(state.settings.account.accountId===command.account&&p.status.account===command.account&&JSON.stringify(p.repository)===JSON.stringify(command.repository),'sync-intent-changed');
        if(command.action==='recheck')await this.syncOne(p.id);
        else if(command.action==='stop')await this.stop(p.id,true);
        else if(command.action==='reassign'){requireThat(JSON.stringify(state.settings.github?.repository)===JSON.stringify(command.targetRepository),'sync-intent-changed');await this.reassign(p.id,true);}
        else{
          const compared=await this.compare(p.id);requireThat(compared.commit===command.comparison?.commit&&await sourceFingerprint(compared.local)===command.comparison.local&&await sourceFingerprint(compared.remote)===command.comparison.remote,'comparison-changed');await this.decide(compared.token,command.action,true);
        }
        await this.store.transact(s=>{this.assertCurrent(s);s.commands[command.id].phase='done';});
      }catch(error){await this.store.transact(s=>{this.assertCurrent(s);s.commands[command.id].phase='blocked';s.commands[command.id].reason=['comparison-changed','sync-intent-changed','resolve-development-before-stop','recheck-original-write-first','reassignment-target-request-conflict','reassignment-target-source-conflict'].includes(error.message)?error.message:'sync-action-unconfirmed';});}
    }finally{this.commandsBusy=false;}
  }
  cleanupCredentials(state){
    const needed=new Set(pendingWork(state).filter(w=>w.repository).map(w=>repositoryKey(w.repository)));
    for(const key of Object.keys(state.settings.repositoryCredentials||{}))if(!needed.has(key))delete state.settings.repositoryCredentials[key];
  }
  unresolvedWrites(state,p){
    return Object.values(state.jobs).some(j=>j.kind==='github'&&JSON.stringify(j.repository)===JSON.stringify(p.repository)&&j.slug===p.slug&&(['dispatched','unknown'].includes(j.phase)||j.remoteOutcome==='unknown'));
  }
  async reassign(id,confirmed){
    requireThat(confirmed===true,'reassignment-confirmation-required');await this.guard();const state=await this.store.read(),p=await this.record(id),target=state.settings.github?.repository;
    requireThat(target&&JSON.stringify(target)!==JSON.stringify(p.repository),'different-tested-repository-required');
    requireThat(!TERMINAL.includes(p.phase)&&!p.decision&&!this.unresolvedWrites(state,p),'recheck-original-write-first');
    if(p.kind==='source')requireThat(p.nativeVerified===true&&state.generators[p.generatorId]?.localDone&&state.generators[p.generatorId]?.savedVerified,'verified-local-source-required');
    const client=await this.services(target),snapshot=await client.github.snapshot();
    if(hasFolder(snapshot,p.slug)){
      const status=parseStatus(await client.github.text(snapshot,p.slug+'/status.md'));
      requireThat(sameStatus(status,p.status),'reassignment-target-request-conflict');
      if(p.kind==='source')requireThat(sourceEqual(await client.github.source(snapshot,p.slug),p.source),'reassignment-target-source-conflict');
    }else requireThat(p.kind==='source','reassignment-target-source-required');
    const nextId='reassigned-'+this.uuid();
    await this.update(id,(row,s)=>{
      requireThat(JSON.stringify(s.settings.github?.repository)===JSON.stringify(target)&&!this.unresolvedWrites(s,row)&&!TERMINAL.includes(row.phase),'reassignment-state-changed');
      const {scope:_,...copy}=structuredClone(row);
      if(row.scope==='utility'){
        const old=s.utility[row.requestId];s.utility[nextId]={id:nextId,request:{...old.request,repository:target,commit:snapshot.commit},generatorId:row.generatorId,phase:'blocked',closed:true,steps:[],pendingStatus:{...copy,id:'utility-status-'+nextId,requestId:nextId,repository:target,baseCommit:snapshot.commit,phase:'prepared',writeId:null,reason:null,predecessorId:row.id}};
        row.successorId='utility-status-'+nextId;
      }else{
        s.pending[nextId]={...copy,id:nextId,repository:target,baseCommit:snapshot.commit,originRepository:row.repository,predecessorId:row.id,phase:row.kind==='source'?'local-done':'prepared',writeId:null,reason:null,syncKind:row.kind};row.successorId=nextId;
      }
      row.phase='reassigned';row.reason='operator-reassigned';
      const oldUtility=row.requestId&&s.utility?.[row.requestId];if(row.scope==='pending'&&oldUtility?.pendingStatus){oldUtility.pendingStatus.phase='reassigned';oldUtility.pendingStatus.successorId=nextId;}
      if(row.requestId&&s.requestQueue?.[row.requestId]){s.requestQueue[row.requestId].closed=true;s.requestQueue[row.requestId].phase='reassigned';}
      const g=s.generators[row.generatorId];if(g)s.generators[row.generatorId]=releaseHold(g,'sync-'+row.id);
      // Persisted source remains in the original record; only the explicit successor can write.
    });
    await this.store.transact(s=>{this.assertCurrent(s);this.cleanupCredentials(s);});return nextId;
  }
  async stop(id,confirmed){
    requireThat(confirmed===true,'stop-management-confirmation-required');await this.guard();const p=await this.record(id);
    await this.store.transact(s=>{
      this.assertCurrent(s);
      requireThat(!Object.values(s.workers).some(w=>w.generatorId===p.generatorId&&p.generatorId&&w.role==='development'&&['opening','busy','lost'].includes(w.phase)),'resolve-development-before-stop');
      const affected=syncRecords(s).filter(row=>row.id===id||(p.generatorId&&row.generatorId===p.generatorId));
      const requestIds=new Set(affected.map(row=>row.requestId).filter(Boolean));
      for(const row of affected){
        if(row.scope==='pending'){s.pending[row.id].phase='stopped';s.pending[row.id].reason='operator-stopped';}
        else {s.utility[row.requestId].pendingStatus.phase='stopped';s.utility[row.requestId].pendingStatus.reason='operator-stopped';}
      }
      for(const r of Object.values(s.utility||{}))if(requestIds.has(r.id)||p.generatorId&&r.generatorId===p.generatorId){r.stopped=true;r.closed=true;r.phase='stopped';if(r.pendingStatus)r.pendingStatus.phase='stopped';requestIds.add(r.id);}
      for(const q of Object.values(s.requestQueue||{}))if(requestIds.has(q.id)){q.closed=true;q.phase='stopped';}
      if(p.generatorId){const g=s.generators[p.generatorId];if(g?.importCommand&&s.commands[g.importCommand])s.commands[g.importCommand].phase='stopped';delete s.generators[p.generatorId];}
      for(const job of Object.values(s.jobs))if(p.generatorId&&job.generatorId===p.generatorId||requestIds.has(job.requestId)||job.id===p.writeId||job.kind==='github'&&job.slug===p.slug&&JSON.stringify(job.repository)===JSON.stringify(p.repository)){
        job.locallyStopped=true;if(['dispatched','unknown'].includes(job.phase)){job.phase='unknown';job.remoteOutcome='unknown';}else if(job.phase==='prepared'){job.phase='cancelled';job.resolution='known-not-dispatched';}
      }
      for(const w of Object.values(s.workers))if(p.generatorId&&w.generatorId===p.generatorId)w.phase='retained';
      appendEvent(s,{component:'recovery',outcome:'cancelled',nativeId:p.generatorId||null});this.cleanupCredentials(s);
    });return this.record(id);
  }
  async decide(token,choice,confirmed){
    requireThat(confirmed===true&&['local','github'].includes(choice),'source-confirmation-required');
    const compared=this.comparisons.get(token);requireThat(compared,'comparison-required');
    const p=await this.record(compared.id),client=await this.services(p.repository),result=await this.describe(p,client);
    requireThat(result.kind==='source-conflict'&&result.approved&&result.current.commit===compared.commit&&sourceEqual(p.source,compared.source)&&sourceEqual(result.remote,compared.remote),'comparison-changed');
    requireThat(!p.writeId||!['dispatched','unknown'].includes((await this.store.read()).jobs[p.writeId]?.phase),'github-result-unknown');
    requireThat(JSON.stringify(p.repository)===JSON.stringify(compared.repository),'comparison-repository-changed');
    if(choice==='github'){
      await (this.publishGitHub?this.publishGitHub({pending:p,snapshot:result.current,source:completeSource(result.remote)}):this.queuePublication({pending:p,snapshot:result.current,source:completeSource(result.remote)}));this.comparisons.delete(token);return;
    }
    // The explicit decision rebases only synchronization. The approved live copy
    // and original snapshot stay protected; the normal atomic writer preserves history.
    await this.update(p.id,(row,s)=>{requireThat(row.phase==='source-conflict'&&!row.stopRequested&&sourceEqual(row.source,compared.source)&&approvedLocal(row,s.generators[row.generatorId]),'source-decision-changed');row.baseCommit=result.current.commit;row.phase='local-done';row.reason=null;row.writeId=null;row.comparedCommit=result.current.commit;const g=s.generators[row.generatorId];if(g)s.generators[row.generatorId]=releaseHold(g,'sync-'+row.id);});
    this.comparisons.delete(token);return this.syncOne(p.id);
  }
}
