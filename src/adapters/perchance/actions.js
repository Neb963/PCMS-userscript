import { requireThat, slug } from '../../shared/domain.js';
import { requireLiveCapability } from './session.js';

// Observe only the specific native endpoint while its own UI action is running.
// No direct owner mutation HTTP client, Save-state heuristics or receipt-by-click.
export async function nativeReceipt(page,{path,invoke,matches=()=>true,exporter,timeout=30000}) {
  requireThat(typeof exporter==='function'&&typeof page.fetch==='function','native-receipt-bridge-unavailable');
  const original=page.fetch;let wrapped,timer,resolveReply,rejectReply;
  const reply=new Promise((resolve,reject)=>{resolveReply=resolve;rejectReply=reject;});reply.catch(()=>{});
  wrapped=exporter(function(...args){
    const result=original.apply(this,args);
    try {
      const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,'https://perchance.org');
      if(url.origin==='https://perchance.org'&&url.pathname===path){
        const body=typeof args[1]?.body==='string'?JSON.parse(args[1].body):null;
        if(matches(body))Promise.resolve(result).then(async response=>{
          requireThat(response.ok,'native-http-unconfirmed');const value=await response.clone().json();
          // No session, request envelope, raw error, source or arbitrary object escapes.
          const safe={};for(const key of ['status','name','time','saveCount','sourceRevision','editorPayloadRevision'])if(['string','number','boolean'].includes(typeof value?.[key]))safe[key]=value[key];
          resolveReply(safe);
        }).catch(()=>rejectReply(Error('native-receipt-unconfirmed')));
      }
    }catch{rejectReply(Error('native-receipt-unconfirmed'));}
    return result;
  },page);
  page.fetch=wrapped;
  timer=setTimeout(()=>rejectReply(Error('native-receipt-timeout')),timeout);timer.unref?.();
  try{await invoke();return await reply;}finally{clearTimeout(timer);if(page.fetch===wrapped)page.fetch=original;reply.catch(()=>{});}
}

export class NativeActions {
  constructor({page,native,gate,reader,doc,exporter,capability=requireLiveCapability}) {Object.assign(this,{page,native,gate,reader,doc,exporter,capability});}
  receipt(path,invoke,matches){return nativeReceipt(this.page,{path,invoke,matches,exporter:this.exporter});}
  selected(){requireThat(this.doc.visibilityState!=='visible','operator-selected-tab');}
  async create(){
    this.capability('create');this.selected();const state=await this.gate.store.read();await this.gate.requireSession(state.settings.account.accountId);
    requireThat(this.page.location.pathname==='/minimal'&&['#edit:new','#edit'].includes(this.page.location.hash),'creation-template-unconfirmed');
    requireThat(this.page.currentInterfaceMode==='edit'&&this.page.perchanceSaveState!=='saving'&&this.page.__draftChoiceSettled!==false,'editor-not-settled');
    await this.native.ready(this.native.identity());
    requireThat(this.page.modelTextEditor.isClean?.()===true&&this.page.outputTemplateEditor.isClean?.()===true&&this.page.srcState.isDirty?.()===false,'dirty-template');
    requireThat(!await this.native.ownership('minimal'),'creation-template-owned');
    const receipt=await this.receipt('/api/save',()=>this.page.app.saveGenerator(),body=>body?.generator?.name==='minimal');
    requireThat(receipt.status==='created'&&typeof receipt.name==='string','creation-receipt-unconfirmed');
    slug(receipt.name);const saved=await this.reader.metadata(receipt.name);await this.gate.requireOwner(saved);return saved;
  }
  async listing(target,intent){
    this.capability('listing');this.selected();requireThat(['listed','unlisted'].includes(intent),'invalid-listing');
    await this.gate.requireOwner(target);await this.native.ready(target);
    this.page.app.openListingMenu();
    const control=this.page.document.querySelector('#listingMenuEl button[data-value="'+intent+'"]');
    requireThat(control&&!control.disabled&&control.getClientRects().length,'listing-control-unavailable');
    const receipt=await this.receipt('/api/changeGeneratorPrivacy',()=>control.click(),body=>body?.generatorName===target.slug&&body.isPrivate===(intent==='unlisted'));
    requireThat(receipt.status==='success','listing-receipt-unconfirmed');return receipt;
  }
  async rename(target,targetSlug){
    this.capability('rename');this.selected();slug(targetSlug);await this.gate.requireOwner(target);await this.native.ready(target);
    this.page.app.openSettingsModal();const modal=this.page.settingsModal;
    requireThat(modal?.refs?.newGeneratorName&&typeof modal.changeGeneratorName==='function','rename-control-unavailable');
    modal.refs.newGeneratorName.value=targetSlug;
    modal.refs.newGeneratorName.dispatchEvent(new this.page.Event('input',{bubbles:true}));
    const receipt=await this.receipt('/api/changeGeneratorName',()=>modal.changeGeneratorName(),body=>body?.currentName===target.slug&&body.newName===targetSlug);
    requireThat(receipt.status==='success','rename-receipt-unconfirmed');return receipt;
  }
}
