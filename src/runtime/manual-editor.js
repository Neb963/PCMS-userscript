import {enqueueEditAction} from '../workflows/manual-edit.js';

// The retained editor stays readable after Publish/End. Another mutation starts
// a new protected Edit; it never silently reuses an ended session's authority.
export function manualEditorGuard({store,doc,page,workerId,generatorId}){
 let active=false,renewing=false,disposed=false;
 const banner=doc.createElement('div'),again=doc.createElement('button'),message=doc.createElement('span');
 banner.style.cssText='position:fixed;bottom:12px;left:12px;z-index:2147483645;background:#172130;color:#eef2fa;border:1px solid #8292aa;border-radius:7px;padding:8px;display:flex;gap:10px;align-items:center;font:12px system-ui;max-width:calc(100vw - 24px)';
 message.textContent='This Edit session has ended. Start a new session before editing.';again.textContent='Edit again';banner.append(message,again);doc.body.append(banner);
 const renew=async()=>{if(renewing||disposed)return;renewing=true;again.disabled=true;try{await enqueueEditAction(store,generatorId,'start',true,undefined,null,{activate:false});}catch{message.textContent='Protected storage or session unavailable. The draft is retained.';}finally{renewing=false;again.disabled=false;}};
 again.addEventListener('click',renew);
 const editorTarget=target=>page.modelTextEditor?.contentDOM?.contains(target)||page.outputTemplateEditor?.contentDOM?.contains(target)||target?.closest?.('#aiAgentInputEl');
 const block=event=>{if(active||banner.contains(event.target))return;const mutation=event.type==='drop'||['beforeinput','paste'].includes(event.type)&&editorTarget(event.target)||event.type==='keydown'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'||event.type==='click'&&event.target?.closest?.('[data-ref="saveButton"],#aiAgentSendBtn,#aiAgentQueueBtn');if(mutation){event.preventDefault();event.stopImmediatePropagation();banner.hidden=false;banner.style.display='flex';}};
 for(const type of ['beforeinput','paste','drop','keydown','click'])doc.addEventListener(type,block,true);
 const refresh=async()=>{if(disposed)return;try{const s=await store.read(),record=Object.values(s.edits||{}).filter(r=>r.workerId===workerId).at(-1);active=!!record&&['opening','editing'].includes(record.phase)&&s.generators[generatorId]?.holds.some(h=>h.id===record.id&&h.kind==='edit');banner.hidden=active;banner.style.display=active?'none':'flex';again.hidden=!record||!['done','ended'].includes(record.phase);message.textContent=record?.phase==='publishing'?'Publishing the approved draft. Editing remains protected.':record?.phase==='publication-unknown'?'Publication needs verification. Recheck the retained draft in PCMS.':'This Edit session has ended. Start a new session before editing.';
   if(record&&['done','ended'].includes(record.phase)&&(page.perchanceSaveState==='unsaved'||page.srcState?.isDirty?.()===true))await renew();
 }catch{active=false;banner.hidden=false;banner.style.display='flex';message.textContent='Protected storage unavailable. The draft is retained.';}};
 return {refresh,dispose:()=>{disposed=true;for(const type of ['beforeinput','paste','drop','keydown','click'])doc.removeEventListener(type,block,true);banner.remove();}};
}
