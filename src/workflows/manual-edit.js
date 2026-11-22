import {functionalFingerprint} from '../refresher/markers.js';
import {requireThat,addHold,releaseHold,sourceEqual,repository,statusRecord} from '../shared/domain.js';
import {appendEvent} from '../state/journal.js';

export async function enqueueEditAction(store,id,action,confirmed,uuid=()=>crypto.randomUUID(),token=null,{activate=true}={}){
  requireThat(confirmed===true&&['start','end','prepare','approve','recheck-publication'].includes(action),'confirmation-required');
  return store.transact(s=>{
    s.edits||={};s.commands||={};let editId=id;
    if(action==='start'){
      const g=s.generators[id];requireThat(g&&g.ownerVerified===true&&s.settings.account.confirmed,'confirm-session-required');statusRecord(g.status);requireThat(g.status.account===s.settings.account.accountId,'account-assignment-mismatch');
      const active=Object.values(s.edits).find(r=>r.generatorId===id&&!['done','ended'].includes(r.phase));if(active)return active.startCommandId||active.id;
      requireThat(!g.holds.length&&!Object.values(s.jobs).some(j=>j.generatorId===id&&!['read-saved','inspect-target','native-capture','approved-capture','edit-capture'].includes(j.kind)&&['prepared','dispatched','unknown'].includes(j.phase)),'generator-held');
      const pending=Object.values(s.pending).filter(p=>p.generatorId===id&&p.kind==='source'&&!['synced','stopped','reassigned','superseded'].includes(p.phase)).at(-1),repo=repository(pending?.repository||g.repository||s.settings.github?.repository),baseCommit=g.githubCommit||pending?.baseCommit;requireThat(/^[a-f0-9]{40}$/.test(baseCommit),'github-baseline-unavailable');
      const previous=Object.values(s.edits).filter(r=>r.generatorId===id&&['done','ended'].includes(r.phase)).at(-1);editId='edit-'+uuid();s.edits[editId]={id:editId,generatorId:id,slug:g.slug,request:{repository:repo,commit:baseCommit,status:g.status},originalListing:g.listing,created:false,phase:'opening',activate,workerId:previous?.workerId||null,documentId:previous?.documentId||null,draftId:null};s.generators[id]=addHold(g,{id:editId,kind:'edit'});appendEvent(s,{component:'manual',outcome:'queued',nativeId:id});
    }else requireThat(s.edits[id],'edit-unavailable');
    const duplicate=Object.values(s.commands).find(c=>c.kind==='edit-action'&&c.editId===editId&&c.action===action&&c.token===token&&['queued','running'].includes(c.phase));if(duplicate)return duplicate.id;
    const commandId=uuid();if(action==='start')s.edits[editId].startCommandId=commandId;s.commands[commandId]={id:commandId,kind:'edit-action',editId,action,token,account:s.settings.account.accountId,phase:'queued'};return commandId;
  });
}
export class ManualEdits {
  constructor({store,pool,nativeFactory,reader,gate,publisher,guard=async()=>{},assertCurrent=()=>{}}){Object.assign(this,{store,pool,nativeFactory,reader,gate,publisher,guard,assertCurrent});this.busy=false;}
  async start(id){
    const state=await this.store.read(),r=state.edits[id];requireThat(r.phase==='opening','edit-already-started');await this.gate.requireOwner({id:r.generatorId,slug:r.slug,account:r.request.status.account});const live=await this.reader.saved(r.slug,r.generatorId);requireThat(live.listing===r.originalListing,'listing-changed');const expected=state.generators[r.generatorId].verifiedFingerprint;if(expected)requireThat(await functionalFingerprint(live.source)===expected,'saved-source-drift');
    await this.store.transact(s=>{this.assertCurrent(s);s.edits[id].baselineSource=live.source;});
    const previous=Object.values(state.edits).filter(p=>p.id!==id&&p.generatorId===r.generatorId&&['done','ended'].includes(p.phase)).at(-1),old=previous&&state.workers[previous.workerId];let worker;
    if(previous?.workerId)requireThat(old,'retained-tab-unavailable');
    if(old){requireThat(old.documentId&&old.documentId===previous.documentId&&old.phase!=='lost','retained-tab-unavailable');worker=old;await this.store.transact(s=>{this.assertCurrent(s);s.workers[worker.id].phase='idle';s.workers[worker.id].slotReleased=false;});if(r.activate!==false)await this.pool.activate(worker.id,true);}
    else worker=await this.pool.open('manual',r.slug,r.generatorId,false,{active:true,editId:id});
    await this.store.transact(s=>{this.assertCurrent(s);const own=s.edits[id];own.workerId=worker.id;own.documentId=s.workers[worker.id]?.documentId||null;own.phase='editing';s.generators[r.generatorId].retainedTab=worker.id;});
    try{const native=await this.nativeFactory({...r,workerId:worker.id}),current=await native.captureApproved({id:r.generatorId,slug:r.slug,account:r.request.status.account},id,'edit-capture-'+crypto.randomUUID());await this.store.transact(s=>{this.assertCurrent(s);Object.assign(s.edits[id],{documentId:current.documentId,draftId:current.draftId});});}
    catch{await this.store.transact(s=>{this.assertCurrent(s);const own=s.edits[id];own.documentId=s.workers[own.workerId]?.documentId||null;own.reason='Choose or resolve the draft in its retained native editor before publishing.';});}
    return {editId:id,workerId:worker.id};
  }
  async end(id){
    const r=(await this.store.read()).edits?.[id];requireThat(r?.phase==='editing'&&r.workerId,'edit-not-endable');const native=await this.nativeFactory(r),current=await native.captureApproved({id:r.generatorId,slug:r.slug,account:r.request.status.account},id,'edit-end-'+crypto.randomUUID()),saved=await this.reader.saved(r.slug,r.generatorId);
    requireThat(current.clean&&sourceEqual(current.source,saved.source)&&sourceEqual(saved.source,r.baselineSource)&&saved.listing===r.originalListing,'resolve-dirty-draft-first');
    return this.store.transact(s=>{this.assertCurrent(s);const own=s.edits[id];requireThat(own.phase==='editing'&&(!own.draftId||own.draftId===current.draftId),'edit-changed');own.phase='ended';s.generators[r.generatorId]=releaseHold(s.generators[r.generatorId],id);const w=s.workers[r.workerId];w.phase='retained';w.slotReleased=true;appendEvent(s,{component:'manual',outcome:'verified',nativeId:r.generatorId});});
  }
  async tick(){if(this.busy)return;this.busy=true;try{await this.guard();const c=Object.values((await this.store.read()).commands||{}).find(c=>c.kind==='edit-action'&&c.phase==='queued');if(!c)return;await this.store.transact(s=>{this.assertCurrent(s);requireThat(s.settings.account.accountId===c.account,'account-assignment-mismatch');s.commands[c.id].phase='running';});try{
    let result=null;if(c.action==='start')result=await this.start(c.editId);else if(c.action==='end')await this.end(c.editId);else if(c.action==='prepare'){const candidate=await this.publisher.prepare(c.editId);result={token:candidate.approval.id,pjsChars:candidate.source.pjs.length,htmlChars:candidate.source.html.length,fileCount:Object.keys(candidate.source.files).length};}else if(c.action==='approve')result=await this.publisher.confirm(c.editId,c.token);else result=await this.publisher.publish(c.editId);
    await this.store.transact(s=>{this.assertCurrent(s);s.commands[c.id].phase='done';s.commands[c.id].result=result;});
  }catch{await this.store.transact(s=>{this.assertCurrent(s);const edit=s.edits[c.editId];if(c.action==='start'&&edit?.phase==='opening'&&!edit.workerId){edit.phase='ended';s.generators[edit.generatorId]=releaseHold(s.generators[edit.generatorId],edit.id);}
    s.commands[c.id].phase='held';s.commands[c.id].reason='Edit is held. Resolve its retained draft, session, saved source or Listing, then recheck.';});}}finally{this.busy=false;}}
}
