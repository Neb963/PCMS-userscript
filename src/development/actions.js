import {requireThat,addHold,releaseHold} from '../shared/domain.js';
import {developmentStatus,abandonDevelopment} from './completion.js';
import {appendEvent} from '../state/journal.js';
import {functionalFingerprint} from '../refresher/markers.js';

export async function enqueueDevelopmentAction(store,id,action,confirmed,uuid=()=>crypto.randomUUID()){
  requireThat(confirmed===true&&['cancel','abandon','resume','discard'].includes(action),'confirmation-required');
  return store.transact(s=>{
    const r=s.development?.[id],q=s.requestQueue?.[id];requireThat(r||q?.request.status.action==='develop','development-unavailable');
    const account=r?.request.status.account||q.request.status.account;requireThat(account===s.settings.account.accountId,'account-assignment-mismatch');
    s.commands||={};const duplicate=Object.values(s.commands).find(c=>c.kind==='development-action'&&c.developmentId===id&&c.action===action&&['queued','running'].includes(c.phase));if(duplicate)return duplicate.id;
    if(action==='cancel'){if(r)r.stopRequested=true;if(q)q.stopRequested=true;}
    const commandId=uuid();s.commands[commandId]={id:commandId,kind:'development-action',developmentId:id,action,account,phase:'queued'};return commandId;
  });
}
function supersedeStatus(s,r){
  for(const p of Object.values(s.pending))if(p.developmentId===r.id&&!['synced','superseded'].includes(p.phase)){
    p.stopRequested=true;const job=p.writeId&&s.jobs[p.writeId];if(!job||['prepared','cancelled','rejected'].includes(job.phase))p.phase='superseded';
  }
}
export class DevelopmentActions {
  constructor({store,nativeFactory,guard=async()=>{},assertCurrent=()=>{}}){Object.assign(this,{store,nativeFactory,guard,assertCurrent});this.busy=false;}
  async cancelled(id){return this.store.transact(s=>{
    this.assertCurrent(s);const r=s.development?.[id],q=s.requestQueue?.[id];
    if(r){supersedeStatus(s,r);r.phase='cancelled';const worker=s.workers[r.workerId];if(worker){worker.phase='retained';worker.slotReleased=true;}const g=s.generators[r.generatorId];s.generators[g.id]=addHold({...releaseHold(g,id),retainedTab:r.workerId},{id,kind:'cancelled-draft'});developmentStatus(s,r,'blocked');}
    else{requireThat(q,'development-unavailable');s.utility||={};s.utility[id]||={id,request:q.request,phase:'blocked',steps:[],generatorId:null};s.utility[id].pendingStatus={status:{...q.request.status,state:'blocked'},repository:q.request.repository,baseCommit:q.request.commit};s.utility[id].closed=true;}
    if(q){q.closed=true;q.phase='cancelled';}appendEvent(s,{component:'helper',outcome:'cancelled',nativeId:r?.generatorId||null});
  });}
  async cancel(id){
    const s=await this.store.read(),r=s.development?.[id];if(!r||['queued','review','cancelled'].includes(r.phase))return this.cancelled(id);
    if(!r.workerId)throw Error('helper-worker-unavailable');
    try{const native=await this.nativeFactory(r),result=await native.stopDevelopment({id:r.generatorId,slug:r.slug,account:r.request.status.account},id);requireThat(result.kind==='stopped','helper-stop-unconfirmed');await this.cancelled(id);}
    catch{await this.store.transact(state=>{this.assertCurrent(state);const own=state.development[id];own.phase='unknown';state.generators[own.generatorId]=addHold(state.generators[own.generatorId],{id,kind:'helper-unknown'});});throw Error('helper-stop-unconfirmed');}
  }
  async resolve(id,action){
    const s=await this.store.read(),r=s.development?.[id];requireThat(r?.phase==='cancelled'&&r.workerId,'cancelled-draft-unavailable');
    requireThat(action==='resume'?r.originalListing==='listed'&&!r.created:r.created&&r.originalListing==='unlisted','invalid-draft-resolution');
    const native=await this.nativeFactory(r),result=await native.resolveDevelopment({id:r.generatorId,slug:r.slug,account:r.request.status.account},id);
    requireThat(result.kind==='resolved'&&result.listing===r.originalListing,'draft-resolution-unconfirmed');const fingerprint=await functionalFingerprint(result.source);
    return this.store.transact(state=>{
      this.assertCurrent(state);const own=state.development[id];requireThat(own.phase==='cancelled'&&own.draftId===result.draftId,'draft-resolution-changed');supersedeStatus(state,own);own.phase='resolved';
      let g=state.generators[own.generatorId];for(const hold of [id,id+'-helper-start',id+'-helper-stop'])g=releaseHold(g,hold);state.generators[g.id]={...g,savedVerified:true,ownerVerified:true,localDone:action==='resume',verifiedFingerprint:fingerprint,status:{...own.request.status,state:action==='resume'?'done':'blocked'}};
      developmentStatus(state,own,action==='resume'?'done':'blocked');for(const job of Object.values(state.jobs))if(job.workerId===own.workerId&&['unknown','dispatched'].includes(job.phase)){job.locallyStopped=true;job.phase='cancelled';job.resolution='draft-resolved';}
      if(state.requestQueue?.[id]){state.requestQueue[id].closed=true;state.requestQueue[id].phase='resolved';}appendEvent(state,{component:'recovery',outcome:'verified',nativeId:g.id});
    });
  }
  async tick(){
    if(this.busy)return;this.busy=true;try{await this.guard();const s=await this.store.read(),c=Object.values(s.commands||{}).find(c=>c.kind==='development-action'&&c.phase==='queued');if(!c)return;
      await this.store.transact(state=>{this.assertCurrent(state);requireThat(state.settings.account.accountId===c.account,'account-assignment-mismatch');state.commands[c.id].phase='running';});
      try{if(c.action==='cancel')await this.cancel(c.developmentId);else if(c.action==='abandon')await abandonDevelopment(this.store,c.developmentId,true,this.assertCurrent);else await this.resolve(c.developmentId,c.action);await this.store.transact(state=>{this.assertCurrent(state);state.commands[c.id].phase='done';});}
      catch{await this.store.transact(state=>{this.assertCurrent(state);state.commands[c.id].phase='held';state.commands[c.id].reason=c.action==='cancel'?'Stop unconfirmed. Open retained draft or explicitly abandon the local run.':'Resolve the draft in its retained native tab, then recheck. Uncertain results remain held.';});}
    }finally{this.busy=false;}
  }
}
