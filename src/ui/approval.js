import {el,button,dialog} from './dom.js';
import {enqueueDevelopmentAction} from '../development/actions.js';
async function result(store,id){
  for(let n=0;n<600;n++){const command=(await store.read()).commands?.[id];if(command?.phase==='done')return command.result;if(['held','unknown'].includes(command?.phase))throw Error('approval-unconfirmed');await new Promise(r=>setTimeout(r,100));}throw Error('approval-pending');
}
export function reviewPublicationDialog(store,{enqueue=enqueueDevelopmentAction,label='Approve & Publish'}={}){
  return async(job,{doc,root,trigger})=>{
    const content=el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},'Checking the current settled draft in its original tab…')),modal=dialog(doc,root,label+' '+job.slug,content,{trigger});
    try{
      const command=await enqueue(store,job.id,'prepare',true),candidate=await result(store,command.result);if(!modal.isConnected)return;
      content.replaceChildren(el(doc,'p',{},`Approve the captured draft for ${job.slug}? PJS ${candidate.pjsChars} characters · HTML ${candidate.htmlChars} characters · ${candidate.fileCount} src files. The source is rechecked before its Save.`));
      const confirm=button(doc,label,async()=>{confirm.disabled=true;try{await enqueue(store,job.id,'approve',true,undefined,candidate.token);modal.close();}catch{content.append(el(doc,'p',{className:'error'},'Approval unconfirmed. The draft and saved source are retained.'));confirm.disabled=false;}},{className:'primary'});
      content.append(el(doc,'div',{className:'toolbar'},button(doc,'Cancel',()=>modal.close()),confirm));
    }catch{if(modal.isConnected)content.replaceChildren(el(doc,'p',{className:'notice'},'The current draft could not be verified. Resolve active Helper work, changed source, or a missing retained tab before approving.'),button(doc,'Close',()=>modal.close()));}
  };
}
