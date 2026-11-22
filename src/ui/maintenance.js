import {el,button,dialog,picker} from './dom.js';
import {enqueueMaintenance} from '../workflows/maintenance.js';
export function maintenanceActions({store,history}){
 const enqueue=async(g,action,options={})=>enqueueMaintenance(store,g.id,action,{...options,confirmed:true});
 return {
  rename:(g,{doc,root})=>{
   const input=el(doc,'input',{'aria-label':'Exact target slug',autocomplete:'off',value:''}),message=el(doc,'p',{role:'status'}),content=el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},'Rename the native generator and move its complete GitHub folder. Existing Listing and source stay unchanged.'),el(doc,'label',{},'Exact target slug',input),message),modal=dialog(doc,root,'Rename generator',content);
   const confirm=button(doc,'Rename',async()=>{confirm.disabled=true;try{await enqueue(g,'rename',{targetSlug:input.value});modal.close();}catch{message.textContent='Rename unavailable. Check the exact slug, session and conflicting work.';confirm.disabled=false;}},{className:'primary'});content.append(el(doc,'div',{className:'toolbar'},button(doc,'Cancel',()=>modal.close()),confirm));
  },
  rollback:async(g,{doc,root})=>{
   const content=el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},'Select an earlier GitHub revision by date. Its complete source becomes a new publication request; current prompt and scratch instructions are preserved.')),message=el(doc,'p',{role:'status'},'Loading revisions…'),modal=dialog(doc,root,'Rollback source',content);content.append(message);
   try{const rows=await history(g.id);if(!modal.isConnected)return;if(!rows.length){message.textContent='No earlier revisions available.';return;}let revision=rows[0].commit;const select=picker(doc,root,'Earlier source revision',rows.map(r=>[r.commit,new Date(r.date).toISOString()+' · '+r.commit.slice(0,8)]),revision,value=>{revision=value;});message.textContent='Publication preserves this generator’s existing Listing.';const confirm=button(doc,'Queue rollback',async()=>{confirm.disabled=true;try{await enqueue(g,'rollback',{revision});modal.close();}catch{message.textContent='Rollback unavailable. Resolve current work and verify the revision.';confirm.disabled=false;}},{className:'primary'});content.append(select,el(doc,'div',{className:'toolbar'},button(doc,'Cancel',()=>modal.close()),confirm));}catch{message.textContent='GitHub history unavailable. Current source is unchanged.';}
  },
  recheckMaintenance:async(g,{doc,root})=>{try{await enqueueMaintenance(store,g.maintenance.id,'recheck',{confirmed:true});}catch{dialog(doc,root,'Recheck unavailable',el(doc,'div',{className:'panelbody'},'Keep the generator held until the original result can be inspected.'));}},
 };
}
