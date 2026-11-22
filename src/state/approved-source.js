import {requireThat,pendingUpdate,completeSource,sourceEqual} from '../shared/domain.js';

function opaque(value){requireThat(typeof value==='string'&&value.length>0&&value.length<=512&&!/[\x00-\x1f\x7f]/.test(value),'invalid-approval-identity');return value;}
export function approvalIdentity(value){
  requireThat(value&&['github','review','edit'].includes(value.kind)&&Number.isSafeInteger(value.confirmedAt)&&value.confirmedAt>=0,'invalid-source-approval');
  return {id:opaque(value.id),kind:value.kind,draftId:opaque(value.draftId),workerId:opaque(value.workerId),documentId:opaque(value.documentId),confirmedAt:value.confirmedAt};
}
export function approvedRecord(value){
  const canonical=pendingUpdate(value);requireThat(canonical.kind==='source','approved-source-required');
  requireThat(['listed','unlisted'].includes(value.listingIntent),'approved-listing-required');
  const approval=approvalIdentity(value.approval);
  requireThat(value.draftId===approval.draftId&&value.retainedTab===approval.workerId,'approval-context-mismatch');
  return {...canonical,listingIntent:value.listingIntent,draftId:value.draftId,retainedTab:value.retainedTab,approval,previousSource:completeSource(value.previousSource)};
}
export async function confirmStoredSource(store,id,expected){
  const actual=approvedRecord((await store.read()).pending[id]);
  requireThat(JSON.stringify(actual)===JSON.stringify(approvedRecord(expected)),'approved-snapshot-readback-mismatch');return actual;
}
export async function bindApprovedDraft(store,id,approval,current,guard=()=>{}){
  const identity=approvalIdentity(approval);
  const retained=await store.transact(s=>{
    guard(s);const pending=s.pending[id];requireThat(pending?.kind==='source','approved-source-required');
    requireThat(current.id===pending.generatorId&&current.slug===pending.slug&&sourceEqual(current.source,pending.source),'approved-source-changed');
    requireThat(current.draftId===identity.draftId&&current.workerId===identity.workerId&&current.documentId===identity.documentId,'approval-context-mismatch');
    if(identity.kind!=='github')requireThat(current.settled===true,'helper-not-settled');
    requireThat(!pending.approval||JSON.stringify(pending.approval)===JSON.stringify(identity),'approval-already-bound');
    pending.approval=identity;pending.draftId=identity.draftId;pending.retainedTab=identity.workerId;
  });
  const expected=retained.state.pending[id];
  return confirmStoredSource(store,id,expected);
}
export async function beforeApprovedSave(store,id,current,approvalId,expected=null){
  const pending=approvedRecord((await store.read()).pending[id]),a=pending.approval;
  if(expected)requireThat(JSON.stringify(pending)===JSON.stringify(approvedRecord(expected)),'approved-snapshot-readback-mismatch');
  requireThat(a.id===approvalId,'approval-identity-changed');
  requireThat(current.id===pending.generatorId&&current.slug===pending.slug&&current.draftId===a.draftId&&current.workerId===a.workerId&&current.documentId===a.documentId,'approved-context-changed');
  requireThat(sourceEqual(current.source,pending.source),'approved-source-changed');
  if(a.kind!=='github')requireThat(current.settled===true,'helper-not-settled');
  return pending;
}

// Capture before showing confirmation; confirm never replaces its source with a
// newer draft. Callers keep this object in the privileged context, not UI state.
export class ApprovedSource {
  constructor({store,capture,guard=async()=>{},assertCurrent=()=>{},now=()=>Date.now()}){Object.assign(this,{store,capture,guard,assertCurrent,now});}
  async prepare(update,approval){
    requireThat(['review','edit'].includes(approval.kind),'operator-approval-kind-required');
    await this.guard();const current=await this.capture();requireThat(current.settled===true,'helper-not-settled');
    const identity=approvalIdentity({...approval,draftId:current.draftId,workerId:current.workerId,documentId:current.documentId,confirmedAt:this.now()});
    requireThat(current.id===update.generatorId&&current.slug===update.slug,'approval-target-mismatch');
    return approvedRecord({...update,source:current.source,draftId:current.draftId,retainedTab:current.workerId,approval:identity});
  }
  async confirm(candidate,explicit){
    requireThat(explicit===true,'approval-confirmation-required');await this.guard();const expected=approvedRecord(candidate),current=await this.capture();
    requireThat(current.id===expected.generatorId&&current.slug===expected.slug&&current.draftId===expected.approval.draftId&&current.workerId===expected.approval.workerId&&current.documentId===expected.approval.documentId,'approved-context-changed');
    requireThat(current.settled===true&&sourceEqual(current.source,expected.source),'approved-source-changed');
    const existing=(await this.store.read()).pending[expected.id];
    if(existing)await confirmStoredSource(this.store,expected.id,expected);
    else await this.store.retainSource(expected,this.assertCurrent);
    await confirmStoredSource(this.store,expected.id,expected);
    return beforeApprovedSave(this.store,expected.id,await this.capture(),expected.approval.id,expected);
  }
}
