import {functionalFingerprint} from '../refresher/markers.js';
import { requireThat, generatorRecord, sourceEqual, parseStatus, releaseHold, addHold } from '../shared/domain.js';
import { sourceChanges } from '../adapters/github/writer.js';
import { appendEvent } from '../state/journal.js';

export function folderExists(snapshot,slug){return !!snapshot.entries[slug]||Object.keys(snapshot.entries).some(p=>p.startsWith(slug+'/'));}

export class BulkImport {
  constructor({store,reader,github,writer,gate,guard=async()=>{},assertCurrent=()=>{},writeAllowed=()=>{}}){Object.assign(this,{store,reader,github,writer,gate,guard,assertCurrent,writeAllowed});}

  async preview({cancelled=()=>false}={}){
    const rows=await this.reader.inventory({cancelled}),snapshot=await this.github.snapshot(),state=await this.store.read(),candidates=[];
    await this.store.transact(s=>{s.inventory=rows;s.inventoryAt=Date.now();});
    for(const row of rows){
      requireThat(!cancelled(),'import-preview-cancelled');
      let reason=!row.verified||!row.id?'unverified':state.generators[row.id]?'already-managed':folderExists(snapshot,row.slug)?'folder-exists':null;
      if(!reason)try{await this.reader.saved(row.slug,row.id,{cancelled});}catch{reason='saved-source-unavailable';}
      candidates.push({...row,eligible:reason===null,reason});
    }
    return candidates;
  }

  async record(command,id,value){
    await this.store.transact(state=>{this.assertCurrent(state);state.commands[command.id].results[id]=value;});
    return value;
  }

  async finish(command,id,pendingId,receipt){
    const state=await this.store.read(),p=state.pending[pendingId];let live=null,reason=null;
    try{live=await this.reader.saved(p.slug,p.generatorId);if(!sourceEqual(live.source,p.source))reason='source-drift';}catch{reason='snapshot-failure';}
    if(receipt.superseded)reason='source-conflict';
    const fingerprint=live?await functionalFingerprint(live.source):null;
    await this.guard();
    await this.store.transact(s=>{
      this.assertCurrent(s);
      const g=s.generators[id],pending=s.pending[pendingId];
      requireThat(g&&g.importCommand===command.id,'import-identity-changed');
      g.status=structuredClone(p.status);g.githubCommit=receipt.commit;g.savedVerified=!reason;if(!reason)g.verifiedFingerprint=fingerprint;g.holds=releaseHold(g,pendingId).holds;
      if(live)g.listing=live.listing;
      if(reason)s.generators[id]=addHold(g,{id:pendingId+'-recheck',kind:reason});
      pending.phase='synced';pending.commit=receipt.commit;pending.sourceCommitted=true;
      if(!s.generators[id].holds.length){pending.kind='status';delete pending.source;}
      appendEvent(s,{component:'utility',outcome:reason?'held':'committed',nativeId:id});
    });
    return this.record(command,id,{id,slug:p.slug,outcome:reason?'held':'imported',reason,commit:receipt.commit});
  }

  async run(command){
    await this.guard();const outcomes=[];
    for(const id of command.ids){
      await this.guard();
      const state=await this.store.read(),prior=state.commands[command.id].results[id];
      if(prior&&['imported','skipped','held','failed'].includes(prior.outcome)){outcomes.push(prior);continue;}
      const pendingId=command.id+'-'+id,writeId='import-'+command.id+'-'+command.ids.indexOf(id);
      try{
        requireThat(state.settings.account.accountId===command.account,'account-assignment-mismatch');
        const pending=state.pending[pendingId];
        if(pending?.phase==='synced'){const g=state.generators[id];outcomes.push(await this.record(command,id,{id,slug:pending.slug,outcome:g?.savedVerified?'imported':'held',reason:g?.savedVerified?null:g?.holds?.[0]?.kind||'saved-source-unavailable',commit:pending.commit}));continue;}
        if(pending&&state.jobs[writeId]&&state.jobs[writeId].phase!=='prepared'){
          const receipt=await this.writer.reconcile(writeId,{fresh:true});
          if(!receipt.verified){outcomes.push(await this.record(command,id,{id,slug:pending.slug,outcome:'unknown',reason:'github-result'}));continue;}
          outcomes.push(await this.finish(command,id,pendingId,receipt));continue;
        }
        if(pending){
          requireThat(state.generators[id]?.importCommand===command.id&&JSON.stringify(pending.repository)===JSON.stringify(command.repository),'import-identity-changed');
          await this.gate.requireOwner({id,slug:pending.slug,account:command.account});
          const live=await this.reader.saved(pending.slug,id);
          if(!sourceEqual(live.source,pending.source)){
            await this.store.transact(s=>{this.assertCurrent(s);s.generators[id]=addHold(s.generators[id],{id:pendingId+'-recheck',kind:'source-drift'});});
            outcomes.push(await this.record(command,id,{id,slug:pending.slug,outcome:'held',reason:'source-drift'}));continue;
          }
          const current=await this.github.snapshot();
          if(folderExists(current,pending.slug)){
            const remote=await this.github.source(current,pending.slug),status=await this.github.text(current,pending.slug+'/status.md');
            requireThat(sourceEqual(remote,pending.source)&&JSON.stringify(parseStatus(status))===JSON.stringify(pending.status),'import-folder-conflict');
            if(state.jobs[writeId]?.phase==='prepared')await this.store.transact(s=>{this.assertCurrent(s);s.jobs[writeId].phase='cancelled';s.jobs[writeId].resolution='known-not-dispatched';});
            outcomes.push(await this.finish(command,id,pendingId,{verified:true,commit:current.commit}));continue;
          }
          this.writeAllowed();
          const baseline=await this.github.snapshot(pending.baseCommit);
          const receipt=await this.writer.write({id:writeId,targetSlug:pending.slug,baseline,changes:sourceChanges(baseline,pending.slug,pending.source,pending.status),operation:'import'});
          if(!receipt.verified){outcomes.push(await this.record(command,id,{id,slug:pending.slug,outcome:'unknown',reason:'github-result'}));continue;}
          outcomes.push(await this.finish(command,id,pendingId,receipt));continue;
        }
        this.writeAllowed();
        const candidate=(state.inventory||[]).find(row=>row.id===id&&row.verified);
        requireThat(candidate,'native-candidate-unavailable');
        if(state.generators[id]){outcomes.push(await this.record(command,id,{id,slug:candidate.slug,outcome:'skipped',reason:'already-managed'}));continue;}
        await this.gate.requireOwner({id,slug:candidate.slug,account:command.account});
        const saved=await this.reader.saved(candidate.slug,id),snapshot=await this.github.snapshot();
        if(folderExists(snapshot,candidate.slug)){outcomes.push(await this.record(command,id,{id,slug:candidate.slug,outcome:'skipped',reason:'folder-exists'}));continue;}
        const status={account:command.account,action:'publish_from_github',state:'done'};
        await this.store.retainSource({id:pendingId,generatorId:id,slug:saved.slug,repository:command.repository,baseCommit:snapshot.commit,kind:'source',status,source:saved.source,listingIntent:saved.listing,draftId:null,retainedTab:null},s=>{
          this.assertCurrent(s);
          requireThat(s.settings.account.accountId===command.account&&!s.generators[id],'import-target-changed');
          s.settings.account.locked=true;if(s.stoppedGenerators)delete s.stoppedGenerators[id];
          s.generators[id]={...generatorRecord({id,slug:saved.slug,listing:saved.listing,status:null,holds:[{id:pendingId,kind:'publication'}]}),repository:command.repository,ownerVerified:true,importCommand:command.id};
        });
        const receipt=await this.writer.write({id:writeId,targetSlug:saved.slug,baseline:snapshot,changes:sourceChanges(snapshot,saved.slug,saved.source,status),operation:'import'});
        if(!receipt.verified){outcomes.push(await this.record(command,id,{id,slug:saved.slug,outcome:'unknown',reason:'github-result'}));continue;}
        outcomes.push(await this.finish(command,id,pendingId,receipt));
      }catch(error){
        const latest=await this.store.read(),p=latest.pending[pendingId];
        outcomes.push(await this.record(command,id,{id,slug:p?.slug||state.inventory?.find(r=>r.id===id)?.slug||'',outcome:p?'unknown':'failed',reason:p?'github-result':['account-assignment-mismatch','owner-mismatch','sign-in-required','confirm-session-required','native-candidate-unavailable','github-write-not-live-verified'].includes(error.message)?error.message:'source-or-session-unavailable'}));
      }
    }
    return outcomes;
  }
}
