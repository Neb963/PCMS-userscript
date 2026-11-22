import {el,button,dialog} from './dom.js';
import {enqueueEditAction} from '../workflows/manual-edit.js';
import {reviewPublicationDialog} from './approval.js';
export function manualEditActions({store,activate}){
 const publish=reviewPublicationDialog(store,{enqueue:enqueueEditAction,label:'Publish manual edit'});
 return {
  edit:async(g,{doc,root,modal})=>{try{await enqueueEditAction(store,g.id,'start',true);modal.close();}catch{dialog(doc,root,'Edit unavailable',el(doc,'div',{className:'panelbody'},'Confirm the session and resolve current work before editing. The saved source is unchanged.'));}},
  openEdit:async(g,{doc,root})=>{try{const result=await activate(g.edit.retainedTab);if(!result.activated)dialog(doc,root,'Open editor',el(doc,'div',{className:'panelbody'},'Switch to '+result.label+'.'));}catch{dialog(doc,root,'Editor unavailable',el(doc,'div',{className:'panelbody'},'The original retained editor is unavailable. Reconcile it before creating another tab.'));}},
  publishEdit:(g,context)=>publish({id:g.edit.id,slug:g.slug},context),
  recheckEdit:g=>enqueueEditAction(store,g.edit.id,'recheck-publication',true),
  endEdit:(g,{doc,root,trigger})=>{const content=el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},'End this Edit session after resolving or discarding its unpublished draft in the native editor? PCMS rechecks that the saved source and Listing are unchanged. Closing this confirmation keeps the Edit hold.')),modal=dialog(doc,root,'End edit',content,{trigger});const yes=button(doc,'End edit',async()=>{yes.disabled=true;try{await enqueueEditAction(store,g.edit.id,'end',true);modal.close();}catch{content.append(el(doc,'p',{className:'error'},'End Edit unconfirmed. The draft and Edit hold are retained.'));yes.disabled=false;}});content.append(el(doc,'div',{className:'toolbar'},button(doc,'Cancel',()=>modal.close()),yes));},
 };
}
