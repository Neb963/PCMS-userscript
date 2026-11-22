import {requireThat,sourceEqual,completeSource} from '../shared/domain.js';
import {refresherReason} from '../state/inventory.js';
import {EditorSource} from '../adapters/perchance/editor.js';
import {functionalFingerprint,withRefreshMarkers,refreshMarkers} from './markers.js';

const NO_SAVE=new Set(['stale','session-token-error','invalid-edit-key','captcha-needed','too-many-requests','too-big','generator-does-not-exist']);
function reason(error){return ['dirty-or-stale-editor','operator-selected-tab','source-drift','listing-unconfirmed','refresh-baseline-unavailable','refresh-context-changed','refresh-request-source-changed','refresh-request-files-changed','refresh-snapshot-unavailable','refresh-receipt-unconfirmed','refresh-readback-unconfirmed','draft-changed-during-read','source-lock-lost','invalid-refresh-marker','duplicate-or-moved-refresh-marker'].includes(error.message)?error.message:'refresh-preflight-unconfirmed';}
export function checkRefreshRequest(body,source,manifest){
  requireThat(body?.generator?.modelText===source.pjs&&body.generator.outputTemplate===source.html,'refresh-request-source-changed');
  let files=body.srcManifest;if(typeof files==='string'){try{files=JSON.parse(files);}catch{throw Error('refresh-request-files-changed');}}
  requireThat(files&&typeof files==='object'&&!Array.isArray(files),'refresh-request-files-changed');
  requireThat(JSON.stringify(Object.keys(files).sort())===JSON.stringify(Object.keys(source.files).sort()),'refresh-request-files-changed');
  for(const [path,bytes] of Object.entries(source.files)){const item=files[path],key=typeof item==='string'?item:item?.key;requireThat(key===manifest[path]?.key&&(typeof item==='string'||item.size===undefined||item.size===bytes.length),'refresh-request-files-changed');}
}

export class NativeRefresher {
  constructor({actions,store,native,gate,reader}){Object.assign(this,{actions,store,native,gate,reader});this.editor=new EditorSource({page:actions.page,native,guard:async()=>{actions.selected();await actions.guard();}});}
  async snapshot(id){const record=(await this.store.read()).refreshDrafts?.[id];requireThat(record&&record.id===id,'refresh-snapshot-unavailable');completeSource(record.source);completeSource(record.previousSource);return record;}
  async context(target,record,ownSave=false){
    requireThat(record.generatorId===target.id&&record.slug===target.slug&&record.workerId===this.actions.workerId&&record.documentId===this.actions.documentId,'refresh-context-changed');
    const editor=ownSave?new EditorSource({page:this.actions.page,native:this.native,allowSaving:true,guard:async()=>{this.actions.selected();await this.actions.guard();}}):this.editor;const current=await editor.capture(target);requireThat(current.draftId===record.draftId&&sourceEqual(current.source,record.source),'dirty-or-stale-editor');return current;
  }
  async prepare(target,id){
    let touched=false;try{
    this.actions.capability('save');this.actions.selected();await this.actions.guard();if(this.native.waitUntilReady)await this.native.waitUntilReady(target,{guard:this.actions.guard});await this.gate.requireOwner(target);
    const state=await this.store.read(),generator=state.generators[target.id];requireThat(generator&&/^[a-f0-9]{64}$/.test(generator.verifiedFingerprint),'refresh-baseline-unavailable');requireThat(refresherReason({...generator,managed:true})===null,'generator-source-held');
    const saved=await this.reader.saved(target.slug,target.id);requireThat(saved.listing==='listed','listing-unconfirmed');
    requireThat(await functionalFingerprint(saved.source)===generator.verifiedFingerprint,'source-drift');
    const current=await this.editor.capture(target);requireThat(current.clean&&sourceEqual(current.source,saved.source),'dirty-or-stale-editor');
    const source=withRefreshMarkers(saved.source,id),record={id,generatorId:target.id,slug:target.slug,workerId:this.actions.workerId,documentId:this.actions.documentId,draftId:current.draftId,source,previousSource:saved.source,savedRevision:saved.revision,baselineFingerprint:generator.verifiedFingerprint,phase:'prepared'};
    await this.store.transact(s=>{requireThat(!s.refreshDrafts?.[id],'duplicate-refresh-draft');s.refreshDrafts||={};s.refreshDrafts[id]=record;});
    requireThat(JSON.stringify(await this.snapshot(id))===JSON.stringify(record),'refresh-snapshot-readback-mismatch');
    this.actions.selected();await this.actions.guard();
    touched=true;this.actions.page.modelTextEditor.setValue(source.pjs);this.actions.page.outputTemplateEditor.setValue(source.html);this.actions.page.recomputeSaveState?.();
    const staged=await this.context(target,record);requireThat(await functionalFingerprint(staged.source)===record.baselineFingerprint,'source-drift');
    await this.store.transact(s=>{requireThat(s.refreshDrafts[id].draftId===staged.draftId,'refresh-context-changed');s.refreshDrafts[id].phase='staged';});
    return {kind:'prepared',id,generatorId:target.id,workerId:record.workerId,documentId:record.documentId,draftId:record.draftId};
    }catch(error){const known=reason(error);return {kind:'skipped',notSent:true,reason:known,retain:touched||['dirty-or-stale-editor','operator-selected-tab','draft-changed-during-read'].includes(known),hold:known==='listing-unconfirmed'?'listing-mismatch':touched||['dirty-or-stale-editor','operator-selected-tab','draft-changed-during-read'].includes(known)?'edit':['source-drift','refresh-baseline-unavailable','invalid-refresh-marker','duplicate-or-moved-refresh-marker'].includes(known)?'source-drift':'snapshot-failure'};}
  }
  async restore(target,record){
    try{
      this.actions.selected();await this.actions.guard();await this.context(target,record);
      const live=await this.reader.saved(target.slug,target.id);requireThat(sourceEqual(live.source,record.previousSource),'source-drift');
      await this.context(target,record);this.actions.selected();await this.actions.guard();
      requireThat(this.actions.page.modelTextEditor.getValue()===record.source.pjs&&this.actions.page.outputTemplateEditor.getValue()===record.source.html,'dirty-or-stale-editor');
      this.actions.page.modelTextEditor.setValue(record.previousSource.pjs);this.actions.page.outputTemplateEditor.setValue(record.previousSource.html);this.actions.page.recomputeSaveState?.();
      const current=await this.editor.capture(target);return current.clean&&sourceEqual(current.source,record.previousSource);
    }catch{return false;}
  }
  async abort(target,id){
    this.actions.capability('save');const record=await this.snapshot(id);requireThat(record.phase==='staged','refresh-context-changed');const reusable=await this.restore(target,record);
    if(reusable)await this.store.transact(s=>{s.refreshDrafts[id].phase='resolved';s.refreshDrafts[id].outcome='not-sent';delete s.refreshDrafts[id].source;delete s.refreshDrafts[id].previousSource;});
    return {kind:reusable?'restored':'held',reusable};
  }
  async save(target,id){
    let sent=false,receipt=null,record;
    try{
      this.actions.capability('save');this.actions.selected();await this.actions.guard();record=await this.snapshot(id);requireThat(record.phase==='staged','refresh-context-changed');
      const state=await this.store.read(),attempt=state.attempts.find(a=>a.id===id);requireThat(attempt?.generatorId===target.id&&attempt.counted!==false&&attempt.outcome==='unknown','refresh-attempt-unavailable');
      await this.gate.requireOwner(target);await this.context(target,record);
      const saved=await this.reader.saved(target.slug,target.id);requireThat(saved.listing==='listed','listing-unconfirmed');requireThat(sourceEqual(saved.source,record.previousSource),'source-drift');
      const metadata=await this.reader.metadata(target.slug);requireThat(metadata.id===target.id&&metadata.listing==='listed'&&JSON.stringify(metadata.revision)===JSON.stringify(saved.revision),'source-drift');
      receipt=await this.actions.receipt('/api/save',()=>this.actions.page.app.saveGenerator(),body=>body?.generator?.name===target.slug,{onDispatch:()=>{sent=true;},allow:async body=>{
        checkRefreshRequest(body,record.source,metadata.manifest);await this.context(target,record,true);await this.gate.requireOwner(target);
      }});
      if(NO_SAVE.has(receipt.status)){
        if(receipt.status==='session-token-error')await this.store.transact(s=>{s.settings.account.confirmed=false;});
        const live=await this.reader.saved(target.slug,target.id),same=sourceEqual(live.source,record.previousSource),reusable=same&&await this.restore(target,record);
        return {kind:'failed',receipt,reason:same?'native-rejected':'source-drift',reusable,hold:same&&reusable?null:same?'edit':'source-drift'};
      }
      requireThat(receipt.status==='saved'&&receipt.name===target.slug,'refresh-receipt-unconfirmed');
      const live=await this.reader.saved(target.slug,target.id),markers=refreshMarkers(live.source);
      requireThat(live.listing==='listed'&&markers.pjs===id&&markers.html===id&&sourceEqual(live.source,record.source)&&await functionalFingerprint(live.source)===record.baselineFingerprint,'refresh-readback-unconfirmed');
      await this.gate.requireOwner(target);await this.actions.guard();
      await this.store.transact(s=>{s.refreshDrafts[id].phase='verified';s.refreshDrafts[id].receipt=receipt;});
      return {kind:'confirmed',receipt,revision:live.revision,reusable:(await this.editor.capture(target)).clean};
    }catch(error){
      return {kind:sent?'unknown':'skipped',reason:reason(error),notSent:!sent,receipt,reusable:false};
    }
  }
}
