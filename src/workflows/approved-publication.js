import {ApprovedSource,beforeApprovedSave} from '../state/approved-source.js';
import {requireThat,sourceEqual,releaseHold,addHold} from '../shared/domain.js';
import {functionalFingerprint} from '../refresher/markers.js';
import {appendEvent} from '../state/journal.js';
import {requireLiveCapability} from '../adapters/perchance/session.js';

export class ApprovedPublication {
  constructor({store,nativeFactory,reader,gate,guard=async()=>{},assertCurrent=()=>{},allowed=()=>requireLiveCapability('save'),uuid=()=>crypto.randomUUID()}){Object.assign(this,{store,nativeFactory,reader,gate,guard,assertCurrent,allowed,uuid});this.busy=false;this.nextCheck=0;this.inFlight=new Map();}
  async record(id){const s=await this.store.read(),r=s.development?.[id];requireThat(r&&r.workerId&&s.workers[r.workerId]?.documentId===r.documentId,'retained-draft-unavailable');requireThat(s.settings.account.accountId===r.request.status.account,'account-assignment-mismatch');const incoming=s.requestQueue?.[id]?.incoming;requireThat(!incoming||incoming.status.account===r.request.status.account,'account-assignment-mismatch');return r;}
  target(r){return {id:r.generatorId,slug:r.slug,account:r.request.status.account};}
  async capture(id){const r=await this.record(id),native=await this.nativeFactory(r);return native.captureApproved(this.target(r),id,'capture-'+this.uuid());}
  approvals(id){return new ApprovedSource({store:this.store,capture:()=>this.capture(id),guard:this.guard,assertCurrent:this.assertCurrent});}
  async prepare(id){
    await this.guard();this.allowed();const r=await this.record(id);requireThat(r.phase==='review'&&!r.stopRequested,'review-unavailable');await this.gate.requireOwner(this.target(r));
    const live=await this.reader.saved(r.slug,r.generatorId);requireThat(sourceEqual(live.source,r.baselineSource)&&live.listing===r.originalListing,'saved-source-drift');
    const candidate=await this.approvals(id).prepare({id:'approved-'+this.uuid(),generatorId:r.generatorId,slug:r.slug,repository:r.request.repository,baseCommit:r.statusCommit||r.request.commit,kind:'source',previousSource:live.source,listingIntent:r.created?'listed':r.originalListing,status:{...r.request.status,state:'done'}},{id:'approval-'+this.uuid(),kind:'review'});
    await this.store.transact(s=>{this.assertCurrent(s);const own=s.development[id];requireThat(own.phase==='review'&&!own.stopRequested,'review-unavailable');own.approvalCandidate=candidate;});return candidate;
  }
  async confirm(id,token){
    await this.guard();this.allowed();const r=await this.record(id),candidate=r.approvalCandidate;requireThat(r.phase==='review'&&!r.stopRequested&&candidate?.approval.id===token,'approval-changed');
    const confirmed=await this.approvals(id).confirm(candidate,true);
    await this.store.transact(s=>{this.assertCurrent(s);const own=s.development[id];requireThat(own.phase==='review'&&!own.stopRequested&&own.approvalCandidate?.approval.id===token,'approval-changed');own.approvedPending=confirmed.id;own.phase='publishing';own.statusPending=confirmed.id;const p=s.pending[confirmed.id];p.requestId=id;p.developmentId=id;p.syncKind='source';p.baseCommit=own.statusCommit||p.baseCommit;
      for(const older of Object.values(s.pending))if(older.id!==p.id&&older.developmentId===id&&!['synced','superseded'].includes(older.phase)){older.stopRequested=true;const job=older.writeId&&s.jobs[older.writeId];if(!job||['prepared','cancelled','rejected'].includes(job.phase))older.phase='superseded';}
      if(s.utility?.[id]?.pendingStatus){s.utility[id].pendingStatus.stopRequested=true;s.utility[id].pendingStatus.phase='superseded';}
    });return this.publish(id);
  }
  async reconcileJob(jobId,proof){
    return this.store.transact(s=>{this.assertCurrent(s);const job=s.jobs[jobId];if(job&&['unknown','dispatched'].includes(job.phase)){job.phase='verified';job.data={kind:'verified-by-readback'};job.resolution=proof;const g=s.generators[job.generatorId];if(g)s.generators[g.id]=releaseHold(g,jobId);}});
  }
  publish(id){if(this.inFlight.has(id))return this.inFlight.get(id);const work=this.performPublish(id).catch(async()=>{await this.guard();const saved=await this.store.transact(s=>{this.assertCurrent(s);const r=s.development?.[id];if(r&&['publishing','publication-unknown'].includes(r.phase)){r.phase='publication-unknown';r.publishReason='retained-tab-or-session-unavailable';}return r?.approvedPending||null;});return {kind:'unknown',pendingId:saved.result};});this.inFlight.set(id,work);work.finally(()=>{if(this.inFlight.get(id)===work)this.inFlight.delete(id);}).catch(()=>{});return work;}
  async performPublish(id){
    await this.guard();this.allowed();const r=await this.record(id),p=(await this.store.read()).pending[r.approvedPending];requireThat(p?.approval&&p.retainedTab===r.workerId&&['publishing','publication-unknown'].includes(r.phase),'approved-snapshot-unavailable');
    const target=this.target(r),native=await this.nativeFactory(r),saveId=p.id+'-save',listId=p.id+'-list';
    try{
      requireThat(!r.stopRequested,'publication-stopped');await this.gate.requireOwner(target);let live=await this.reader.saved(r.slug,r.generatorId);
      if(!sourceEqual(live.source,p.source)){
        const job=(await this.store.read()).jobs[saveId];requireThat(!job,'publication-outcome-unknown');requireThat(sourceEqual(live.source,p.previousSource),'saved-source-drift');
        await beforeApprovedSave(this.store,p.id,await this.capture(id),p.approval.id,p);await native.saveApproved(target,id,p.id,p.approval.id);
      }
      live=await this.reader.saved(r.slug,r.generatorId);requireThat(sourceEqual(live.source,p.source),'saved-source-mismatch');await this.reconcileJob(saveId,'independent-source-readback');
      if(r.created&&live.listing!=='listed'){
        requireThat(live.listing==='unlisted','intended-listing-unconfirmed');const job=(await this.store.read()).jobs[listId];requireThat(!job,'listing-outcome-unknown');await native.listApproved(target,id,p.id);
      }
      live=await this.reader.saved(r.slug,r.generatorId);requireThat(sourceEqual(live.source,p.source)&&live.listing===p.listingIntent,'intended-listing-unconfirmed');await this.reconcileJob(listId,'independent-listing-readback');
      const current=await this.capture(id);requireThat(current.clean===true&&sourceEqual(current.source,p.source),'approved-draft-not-clean');await beforeApprovedSave(this.store,p.id,current,p.approval.id,p);await this.gate.requireOwner(target);
      const fingerprint=await functionalFingerprint(live.source);
      await this.store.transact(s=>{this.assertCurrent(s);const own=s.development[id];requireThat(!own.stopRequested&&own.approvedPending===p.id,'publication-stopped');const pending=s.pending[p.id];pending.nativeVerified=true;pending.phase='local-done';let g=s.generators[r.generatorId];for(const hold of [id,saveId,listId])g=releaseHold(g,hold);s.generators[g.id]={...g,listing:live.listing,localDone:true,localApproved:true,savedVerified:true,ownerVerified:true,verifiedFingerprint:fingerprint,status:pending.status};own.phase='done';delete own.approvalCandidate;if(s.requestQueue?.[id]){s.requestQueue[id].closed=true;s.requestQueue[id].phase='done';}appendEvent(s,{component:'helper',outcome:'confirmed',nativeId:g.id});});
      return {kind:'verified',pendingId:p.id};
    }catch(error){
      await this.store.transact(s=>{this.assertCurrent(s);const own=s.development[id];if(!['publishing','publication-unknown'].includes(own.phase))return;own.phase='publication-unknown';own.publishReason=['saved-source-drift','saved-source-mismatch','intended-listing-unconfirmed','approved-draft-not-clean'].includes(error.message)?error.message:'publication-result-unconfirmed';s.generators[r.generatorId]=addHold({...s.generators[r.generatorId],retainedTab:r.workerId},{id,kind:'review'});appendEvent(s,{component:'helper',outcome:'unknown',nativeId:r.generatorId});});return {kind:'unknown',pendingId:p.id};
    }
  }
  async tick(){if(this.busy||Date.now()<this.nextCheck)return;this.busy=true;this.nextCheck=Date.now()+15000;try{await this.guard();for(const r of Object.values((await this.store.read()).development||{}))if(['publishing','publication-unknown'].includes(r.phase))await this.publish(r.id).catch(()=>{});}finally{this.busy=false;}}
}
