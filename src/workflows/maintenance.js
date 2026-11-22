import {requireThat,slug,repository,statusRecord,parseStatus,sourceEqual,addHold,releaseHold} from '../shared/domain.js';
import {folderVersion,folderMoveChanges,sourceChanges} from '../adapters/github/writer.js';
import {folderExists} from './import.js';
import {functionalFingerprint} from '../refresher/markers.js';
import {appendEvent} from '../state/journal.js';

export function maintenanceBlocked(s,id){
 const g=s.generators[id];return !g||g.holds.length>0||Object.values(s.edits||{}).some(r=>r.generatorId===id&&!['ended','done'].includes(r.phase))||Object.values(s.development||{}).some(r=>r.generatorId===id&&!['done','resolved'].includes(r.phase))||Object.values(s.pending).some(p=>p.generatorId===id&&!['synced','stopped','superseded','reassigned'].includes(p.phase))||Object.values(s.jobs).some(j=>j.generatorId===id&&['prepared','dispatched','unknown'].includes(j.phase));
}
export async function enqueueMaintenance(store,id,action,options={},uuid=()=>crypto.randomUUID()){
 requireThat(options.confirmed===true&&['rename','rollback','recheck'].includes(action),'confirmation-required');
 return store.transact(s=>{
  s.maintenance||={};s.commands||={};let operation=id;
  if(action!=='recheck'){
   const duplicate=Object.values(s.maintenance).find(r=>r.generatorId===id&&!['done','failed','stopped'].includes(r.phase));if(duplicate)return duplicate.id;
   const g=s.generators[id];requireThat(!maintenanceBlocked(s,id),'generator-held');requireThat(g.ownerVerified&&s.settings.account.confirmed,'confirm-session-required');statusRecord(g.status);requireThat(g.status.account===s.settings.account.accountId,'account-assignment-mismatch');
   const repo=repository(g.repository||s.settings.github?.repository);requireThat(JSON.stringify(repo)===JSON.stringify(s.settings.github?.repository),'original-repository-required');
   if(action==='rename')requireThat(slug(options.targetSlug)!==g.slug,'rename-target-unchanged');else requireThat(/^[a-f0-9]{40}$/.test(options.revision),'rollback-revision-required');
   operation='manage-'+uuid();s.maintenance[operation]={id:operation,generatorId:id,action,from:g.slug,to:action==='rename'?options.targetSlug:null,revision:options.revision||null,repository:repo,account:g.status.account,originalListing:g.listing,phase:'queued',steps:[]};s.generators[id]=addHold(g,{id:operation,kind:action==='rename'?'rename':'publication'});
  }else requireThat(s.maintenance[id]&&!['done','failed','stopped'].includes(s.maintenance[id].phase),'maintenance-unavailable');
  const prior=Object.values(s.commands).find(c=>c.kind==='maintenance-action'&&c.operationId===operation&&['queued','running'].includes(c.phase));if(prior)return prior.id;
  const commandId=uuid();s.commands[commandId]={id:commandId,kind:'maintenance-action',operationId:operation,phase:'queued'};return commandId;
 });
}
export class Maintenance {
 constructor({store,services,native,guard=async()=>{},assertCurrent=()=>{}}){Object.assign(this,{store,services,native,guard,assertCurrent});this.busy=false;}
 async update(id,change){await this.guard();return this.store.transact(s=>{this.assertCurrent(s);const r=s.maintenance[id];requireThat(r&&!['stopped','done','failed'].includes(r.phase),'maintenance-stopped');return change(r,s);});}
 async run(id){
  let s=await this.store.read(),r=s.maintenance[id];requireThat(r,'maintenance-unavailable');
  requireThat(s.settings.account.accountId===r.account&&JSON.stringify(s.settings.github?.repository)===JSON.stringify(r.repository),'original-repository-required');
  const svc=await this.services(r.repository),target={id:r.generatorId,slug:r.from,account:r.account};
  if(r.action==='rollback')return this.rollback(r,svc);
  if(!s.jobs[id]){svc.writeAllowed();svc.nativeAllowed?.('rename');}
  if(!r.baseline){
   await svc.gate.requireOwner(target);const saved=await svc.reader.saved(r.from,r.generatorId),base=await svc.github.snapshot();
   requireThat(saved.listing===r.originalListing&&['listed','unlisted'].includes(saved.listing),'listing-changed');requireThat(folderExists(base,r.from)&&!folderExists(base,r.to),'github-destination-conflict');
   const status=parseStatus(await svc.github.text(base,r.from+'/status.md'));requireThat(status.account===r.account&&['done','blocked'].includes(status.state),'workflow-not-closed');
   requireThat(await functionalFingerprint(saved.source)===await functionalFingerprint(await svc.github.source(base,r.from)),'saved-source-drift');requireThat((await svc.slugs.check(r.to)).classification==='Available','slug-unavailable');
   const capture=await this.native.command('maintenance-capture',target,{maintenanceId:id},id+'-capture');requireThat(capture.clean&&sourceEqual(capture.source,saved.source),'resolve-dirty-draft-first');
   await this.update(id,own=>{own.baseline=base.commit;own.source=saved.source;own.status=status;own.phase='checked';own.steps=['identity, source and clean draft checked','target available'];});
  }
  s=await this.store.read();r=s.maintenance[id];const baseline=await svc.github.snapshot(r.baseline),job=s.jobs[id];
  if(!job){
   svc.writeAllowed();requireThat(folderVersion(await svc.github.snapshot(),r.from)===folderVersion(baseline,r.from)&&!folderExists(await svc.github.snapshot(),r.to),'github-generator-conflict');requireThat((await svc.slugs.check(r.to)).classification==='Available','slug-unavailable');
   await this.store.prepareAction({id,kind:'native-rename',generatorId:r.generatorId,maintenanceId:id});await this.store.markDispatched(id);
   try{await this.native.rename(target,r.to,id);}catch{/* Reconcile the saved native identity below; never repeat Rename. */}
  }
  const renamed=await svc.reader.saved(r.to,r.generatorId);await svc.gate.requireOwner({...target,slug:r.to});requireThat(renamed.slug===r.to&&renamed.id===r.generatorId&&renamed.listing===r.originalListing&&sourceEqual(renamed.source,r.source),'rename-result-unknown');
  await this.update(id,(own,state)=>{own.phase='github-pending';own.steps=['native rename verified','GitHub folder move pending'];for(const key of [id,id+'-worker'])if(state.jobs[key])state.jobs[key].phase='verified';let g=state.generators[r.generatorId];for(const key of [id+'-worker'])g=releaseHold(g,key);state.generators[r.generatorId]=g;});
  const changes=await folderMoveChanges(svc.github,baseline,r.from,r.to),receipt=await svc.writer.write({id:id+'-github',targetSlug:r.from,destinationSlug:r.to,baseline,changes,operation:'rename'});requireThat(receipt.verified&&!receipt.superseded,'github-move-unconfirmed');
  const current=await svc.github.snapshot();requireThat(!folderExists(current,r.from)&&folderVersion(current,r.to)===JSON.stringify(Object.values(baseline.entries).filter(e=>e.path.startsWith(r.from+'/')&&e.type!=='tree').map(e=>[r.to+e.path.slice(r.from.length),e.sha,e.mode,e.type]).sort((a,b)=>a[0].localeCompare(b[0]))),'github-move-unconfirmed');
  const final=await svc.reader.saved(r.to,r.generatorId);await svc.gate.requireOwner({...target,slug:r.to});requireThat(final.id===r.generatorId&&final.listing===r.originalListing&&sourceEqual(final.source,r.source),'rename-result-unknown');
  await this.update(id,(own,state)=>{const g=state.generators[r.generatorId];requireThat(g.holds.every(h=>[id,id+'-worker'].includes(h.id)),'generator-held');state.generators[g.id]=releaseHold({...g,slug:r.to,githubCommit:receipt.commit,ownerVerified:true},id);own.phase='done';own.steps.push('GitHub complete folder move verified');appendEvent(state,{component:'utility',outcome:'verified',nativeId:g.id});});return {phase:'done'};
 }
 async rollback(r,svc){
  const id=r.id,target={id:r.generatorId,slug:r.from,account:r.account};await svc.gate.requireOwner(target);
  if(!r.baseline){
   const current=await svc.github.snapshot(),history=await svc.github.revisions(r.from);requireThat(history.some(h=>h.commit===r.revision)&&r.revision!==current.commit,'rollback-revision-unavailable');
   const old=await svc.github.snapshot(r.revision),source=await svc.github.source(old,r.from),status=parseStatus(await svc.github.text(current,r.from+'/status.md'));requireThat(status.account===r.account&&['done','blocked'].includes(status.state),'workflow-not-closed');
   const saved=await svc.reader.saved(r.from,r.generatorId);requireThat(saved.listing===r.originalListing,'listing-changed');const draft=await this.native.command('maintenance-capture',target,{maintenanceId:id},id+'-capture');requireThat(draft.clean&&sourceEqual(draft.source,saved.source),'resolve-dirty-draft-first');
   await this.update(id,own=>{own.baseline=current.commit;own.source=source;own.status={account:r.account,action:'publish_from_github',state:'ready'};own.phase='github-pending';own.steps=['earlier complete source checked','current instructions preserved'];});
  }
  r=(await this.store.read()).maintenance[id];const base=await svc.github.snapshot(r.baseline);svc.writeAllowed();const receipt=await svc.writer.write({id:id+'-github',targetSlug:r.from,baseline:base,changes:sourceChanges(base,r.from,r.source,r.status),operation:'rollback'});requireThat(receipt.verified&&!receipt.superseded,'rollback-commit-unconfirmed');
  const at=await svc.github.snapshot(),requests=await svc.github.requests(at,r.account),request=requests.find(q=>q.valid&&q.slug===r.from&&q.requestCommit===receipt.commit);requireThat(request&&sourceEqual(await svc.github.source(at,r.from),r.source),'rollback-request-unconfirmed');
  await this.update(id,(own,state)=>{requireThat(state.generators[r.generatorId].holds.every(h=>h.id===id),'generator-held');state.requestQueue||={};state.requestQueue[id]={id,request,phase:'queued',closed:false};own.phase='done';own.steps.push('new source revision queued for normal publication');appendEvent(state,{component:'utility',outcome:'queued',nativeId:r.generatorId});});return {phase:'done'};
 }
 async tick(){if(this.busy)return;this.busy=true;try{await this.guard();const c=Object.values((await this.store.read()).commands||{}).find(c=>c.kind==='maintenance-action'&&c.phase==='queued');if(!c)return;await this.store.transact(s=>{this.assertCurrent(s);s.commands[c.id].phase='running';});try{await this.run(c.operationId);await this.store.transact(s=>{this.assertCurrent(s);s.commands[c.id].phase='done';});}catch{await this.store.transact(s=>{this.assertCurrent(s);const r=s.maintenance[c.operationId],effect=s.jobs[r.id]||s.jobs[r.id+'-github'];r.phase=effect?'unknown':'failed';r.reason=effect?'Result unverified. Recheck without repeating the native operation.':'Preflight failed. Resolve the session, source, draft or exact target before trying again.';if(!effect)s.generators[r.generatorId]=releaseHold(s.generators[r.generatorId],r.id);s.commands[c.id].phase='held';});}}finally{this.busy=false;}}
}
