import { bindApprovedDraft, beforeApprovedSave } from '../../state/approved-source.js';
import { EditorSource } from './editor.js';
import { requireThat, slug, sourceEqual, generatorRecord } from '../../shared/domain.js';
import { requireLiveCapability } from './session.js';

// Observe only the specific native endpoint while its own UI action is running.
// No direct owner mutation HTTP client, Save-state heuristics or receipt-by-click.
export async function nativeReceipt(page,{path,invoke,matches=()=>true,allow=async()=>{},observe=async()=>{},exporter,timeout=30000}) {
  requireThat(typeof exporter==='function'&&typeof page.fetch==='function'&&typeof page.Promise==='function','native-receipt-bridge-unavailable');
  const original=page.fetch,PagePromise=page.Promise;let wrapped,timer,resolveReply,rejectReply,active=true,dispatched=false;
  const reply=new Promise((resolve,reject)=>{resolveReply=resolve;rejectReply=reject;});reply.catch(()=>{});
  wrapped=exporter(function(...args){
    let matched=false,body=null;
    try{
      const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,'https://perchance.org');
      if(url.origin==='https://perchance.org'&&url.pathname===path){body=typeof args[1]?.body==='string'?JSON.parse(args[1].body):null;matched=matches(body);}
    }catch{rejectReply(Error('native-request-unconfirmed'));}
    if(!matched)return original.apply(this,args);
    const receiver=this;
    // A page-realm Promise returns the existing page Response, not a privileged
    // Promise/object. The allow check runs before the native transport is called.
    return new PagePromise((resolve,reject)=>{
      Promise.resolve().then(()=>{requireThat(active,'native-observer-expired');return allow(body);}).then(()=>{requireThat(active,'native-observer-expired');requireThat(!dispatched,'duplicate-native-dispatch');dispatched=true;return original.apply(receiver,args);}).then(response=>{
        resolve(response);
        Promise.resolve().then(async()=>{requireThat(response.ok,'native-http-unconfirmed');const value=await response.clone().json(),safe={};for(const key of ['status','name','time','saveCount','sourceRevision','editorPayloadRevision'])if(['string','number','boolean'].includes(typeof value?.[key]))safe[key]=value[key];await observe(safe);resolveReply(safe);}).catch(()=>rejectReply(Error('native-receipt-unconfirmed')));
      }).catch(()=>{reject('PCMS native operation unavailable');rejectReply(Error('native-dispatch-unconfirmed'));});
    });
  },page);
  page.fetch=wrapped;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{active=false;reject(Error('native-receipt-timeout'));},timeout);timer.unref?.();});
  const invoked=Promise.resolve().then(invoke).catch(()=>{if(!dispatched)rejectReply(Error('native-invocation-unconfirmed'));});
  try{return await Promise.race([Promise.all([invoked,reply]).then(([,value])=>value),deadline]);}finally{active=false;clearTimeout(timer);if(page.fetch===wrapped)page.fetch=original;reply.catch(()=>{});}
}

export class NativeActions {
  constructor({page,native,gate,reader,doc,exporter,store=null,workerId=null,documentId=null,actionId=null,guard=async()=>{},capability=requireLiveCapability}) {Object.assign(this,{page,native,gate,reader,doc,exporter,store,workerId,documentId,actionId,guard,capability});}
  async receipt(path,invoke,matches){
    return nativeReceipt(this.page,{path,invoke,matches,allow:async()=>{this.selected();await this.guard();},exporter:this.exporter,observe:async observed=>{
      if(this.store&&this.actionId)await this.store.transact(s=>{const job=s.jobs[this.actionId];requireThat(job?.workerId===this.workerId&&job.documentId===this.documentId,'receipt-job-changed');job.observedReceipt=observed;const parent=job.parentId&&s.jobs[job.parentId];if(parent)parent.observedReceipt=observed;});
    }});
  }
  selected(){requireThat(this.doc.visibilityState!=='visible','operator-selected-tab');}
  async create(actionId){
    this.capability('create');this.selected();await this.guard();const state=await this.gate.store.read();await this.gate.requireSession(state.settings.account.accountId);
    requireThat(this.page.location.pathname==='/minimal'&&['#edit:new','#edit'].includes(this.page.location.hash),'creation-template-unconfirmed');
    requireThat(this.page.currentInterfaceMode==='edit'&&this.page.perchanceSaveState!=='saving'&&this.page.__draftChoiceSettled!==false,'editor-not-settled');
    await this.native.ready(this.native.identity());
    requireThat(this.page.modelTextEditor.isClean?.()===true&&this.page.outputTemplateEditor.isClean?.()===true&&this.page.srcState.isDirty?.()===false,'dirty-template');
    requireThat(!await this.native.ownership('minimal'),'creation-template-owned');
    await this.guard();this.selected();const receipt=await this.receipt('/api/save',()=>this.page.app.saveGenerator(),body=>body?.generator?.name==='minimal');
    requireThat(receipt.status==='created'&&typeof receipt.name==='string','creation-receipt-unconfirmed');
    slug(receipt.name);
    if(this.store&&actionId)await this.store.transact(s=>{requireThat(s.jobs[actionId]?.kind==='native-create','creation-action-unavailable');s.jobs[actionId].creationReceipt=receipt;});
    const saved=await this.reader.metadata(receipt.name);
    if(this.store&&actionId){await this.store.transact(s=>{
      const parent=s.jobs[actionId],r=s.utility?.[parent.requestId];parent.createdIdentity={id:saved.id,slug:saved.slug,listing:saved.listing};
      const child=this.actionId&&s.jobs[this.actionId],currentDocument=!child||(child.term===s.coordinator.term&&child.owner===s.coordinator.owner&&child.documentId===this.documentId);
      if(r&&!r.stopped&&!r.stopRequested&&currentDocument){requireThat(!s.generators[saved.id],'creation-identity-already-managed');r.generatorId=saved.id;r.nativeSlug=saved.slug;r.created=true;r.originalListing=saved.listing;s.generators[saved.id]={...generatorRecord({id:saved.id,slug:saved.slug,listing:saved.listing,status:r.request.status,holds:[{id:r.id,kind:'native-unknown'}]}),repository:r.request.repository,reservationId:r.id,ownerVerified:false};}
    });}
    await this.gate.requireOwner(saved);return saved;
  }
  async listing(target,intent){
    this.capability('listing');this.selected();await this.guard();requireThat(['listed','unlisted'].includes(intent),'invalid-listing');
    await this.gate.requireOwner(target);await this.native.ready(target);
    this.page.app.openListingMenu();
    const control=this.page.document.querySelector('#listingMenuEl button[data-value="'+intent+'"]');
    requireThat(control&&!control.disabled&&control.getClientRects().length,'listing-control-unavailable');
    await this.guard();this.selected();const receipt=await this.receipt('/api/changeGeneratorPrivacy',()=>control.click(),body=>body?.generatorName===target.slug&&body.isPrivate===(intent==='unlisted'));
    requireThat(receipt.status==='success','listing-receipt-unconfirmed');return receipt;
  }
  async deploy(target,pendingId){
    this.capability('save');this.selected();await this.guard();await this.gate.requireOwner(target);
    const pending=(await this.store.read()).pending[pendingId];
    requireThat(pending?.kind==='source'&&pending.generatorId===target.id&&pending.slug===target.slug&&pending.previousSource,'publication-snapshot-unavailable');
    const editor=new EditorSource({page:this.page,native:this.native,guard:async()=>{this.selected();await this.guard();}});
    const staged=await editor.stage(target,pending.source,pending.previousSource);
    await this.store.transact(s=>{requireThat(sourceEqual(s.pending[pendingId].source,staged.source),'snapshot-changed');s.pending[pendingId].draftId=staged.draftId;s.pending[pendingId].phase='staged';const r=s.utility?.[s.pending[pendingId].requestId];if(r&&!r.steps.includes('complete source staged'))r.steps.push('complete source staged');});
    const proof={id:this.actionId,kind:'github',draftId:staged.draftId,workerId:this.workerId,documentId:this.documentId,confirmedAt:Date.now()};
    const confirmed=await bindApprovedDraft(this.store,pendingId,proof,{...staged,workerId:this.workerId,documentId:this.documentId});
    await this.guard();this.selected();await this.gate.requireOwner(target);
    await beforeApprovedSave(this.store,pendingId,{...await editor.capture(target),workerId:this.workerId,documentId:this.documentId},proof.id,confirmed);
    const receipt=await this.receipt('/api/save',()=>this.page.app.saveGenerator(),body=>body?.generator?.name===target.slug);
    requireThat(receipt.status==='saved'&&receipt.name===target.slug,'save-receipt-unconfirmed');
    await this.guard();await this.store.transact(s=>{const r=s.utility?.[pending.requestId];if(r&&!r.steps.includes('native Save'))r.steps.push('native Save');});return receipt;
  }
  async rename(target,targetSlug){
    this.capability('rename');this.selected();await this.guard();slug(targetSlug);await this.gate.requireOwner(target);await this.native.ready(target);
    this.page.app.openSettingsModal();const modal=this.page.settingsModal;
    requireThat(modal?.refs?.newGeneratorName&&typeof modal.changeGeneratorName==='function','rename-control-unavailable');
    modal.refs.newGeneratorName.value=targetSlug;
    modal.refs.newGeneratorName.dispatchEvent(new this.page.Event('input',{bubbles:true}));
    await this.guard();this.selected();const receipt=await this.receipt('/api/changeGeneratorName',()=>modal.changeGeneratorName(),body=>body?.currentName===target.slug&&body.newName===targetSlug);
    requireThat(receipt.status==='success','rename-receipt-unconfirmed');return receipt;
  }
}
