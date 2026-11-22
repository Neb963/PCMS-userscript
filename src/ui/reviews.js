import {listingLabel,operationLabel} from './labels.js';
import {el,button,dialog} from './dom.js';
export function reviewsRenderer({action,activate,publish=null}){
  return ({doc,root,body,snapshot})=>{
    let model=snapshot;
    const notice=el(doc,'p',{className:'statusline',role:'status'}),reviews=el(doc,'div',{className:'scroll',role:'list','aria-label':'Awaiting review jobs',tabindex:0}),running=el(doc,'div',{className:'running-jobs',role:'list','aria-label':'Running Development jobs'}),queued=el(doc,'div',{className:'scroll',role:'list','aria-label':'Queued Development jobs',tabindex:0}),counts=el(doc,'span',{className:'statusline'});
    body.append(el(doc,'div',{className:'columns reviews-layout'},el(doc,'section',{className:'panel review-panel'},el(doc,'header',{},el(doc,'h2',{},'Awaiting review')),reviews),el(doc,'section',{className:'panel development-panel'},el(doc,'header',{},el(doc,'h2',{},'Development'),counts),running,el(doc,'h3',{className:'queue-heading'},'Queued'),queued)),notice);
    async function open(job){try{const result=await activate(job.retainedTab);notice.textContent=result.activated?'Retained tab opened.':'Switch to '+result.label+'.';}catch{notice.textContent='Retained tab unavailable. Recheck the result before opening another editor.';}}
    function confirm(job,kind,trigger){
      const title=kind==='abandon'?'Abandon local run':kind==='resume'?'Resume saved version':kind==='discard'?'Discard draft & keep Unlisted':'Cancel '+job.slug;
      const text=kind==='abandon'?'Release this local slot and retain the generator hold until its remote result is reconciled?':kind==='resume'?'Recheck the original retained editor after resolving or discarding its draft. Only the unchanged verified Listed saved version can resume.':kind==='discard'?'Resolve or discard the draft in its retained native tab, then confirm it is clean. The new generator remains Unlisted.':'Stop automatic work and retain the existing draft? Queued work sends no prompt; a running job requires verified native Stop or explicit abandonment.';
      const content=el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},text)),modal=dialog(doc,root,title,content,{trigger,returnFocus:()=>{const row=[...root.querySelectorAll('.development-row')].find(n=>n.dataset.id===job.id);return row?.querySelector('button:not(:disabled)')||row;}});
      const yes=button(doc,'Confirm',async()=>{yes.disabled=true;try{await action(job.id,kind,true);notice.textContent='Request recorded. Its verified outcome will appear here.';modal.close();}catch{content.append(el(doc,'p',{className:'error'},'Action unconfirmed. Saved work is retained.'));yes.disabled=false;}},{className:'primary'});
      content.append(el(doc,'div',{className:'toolbar'},button(doc,'Cancel',()=>modal.close()),yes));
    }
    function drawList(list,jobs,empty){
      const top=list.scrollTop,wanted=new Set(jobs.map(j=>j.id));for(const child of [...list.children])if(!wanted.has(child.dataset.id))child.remove();
      if(!jobs.length)list.append(el(doc,'p',{className:'empty'},empty));
      for(const [index,job] of jobs.entries()){
        let row=[...list.children].find(n=>n.dataset.id===job.id);const signature=JSON.stringify([job.phase,job.listing,job.slug,job.canResume,job.canDiscard,job.actionBusy,job.canPublish,job.retainedTab]);
        if(!row||row.dataset.signature!==signature){
          const hadFocus=row?.contains(root.activeElement),focus=hadFocus?root.activeElement?.getAttribute('aria-label'):null;
          const next=el(doc,'div',{role:'listitem',className:'development-row','data-id':job.id,tabindex:-1,'data-signature':signature},el(doc,'div',{className:'development-identity'},el(doc,'strong',{},job.slug),el(doc,'span',{className:'tag'},listingLabel(job.listing)),el(doc,'span',{className:'tag'},operationLabel(job.phase))),el(doc,'p',{className:'statusline','data-message':''},job.message||'')),tools=el(doc,'div',{className:'toolbar development-tools'});
          const add=(label,run,attrs={})=>{const b=button(doc,label,()=>run(b),{'aria-label':label+' '+job.slug,disabled:job.actionBusy,...attrs});tools.append(b);};
          if(job.retainedTab)add(job.phase==='review'?'Review':'Open retained draft',()=>open(job));
          if(job.phase==='review')add('Approve & Publish',b=>publish?.(job,{doc,root,trigger:b}),{disabled:!job.canPublish||!publish||job.actionBusy,title:job.canPublish?'Confirm this exact settled draft':'Native publication requires live qualification'});
          if(!['cancelled','resolved'].includes(job.phase))add('Cancel',b=>confirm(job,'cancel',b));
          if(job.phase==='publication-unknown')add('Recheck result',async()=>{try{await action(job.id,'recheck-publication',true);notice.textContent='Publication recheck recorded.';}catch{notice.textContent='Publication recheck unavailable. The approved source is retained.';}});
          if(job.phase==='unknown'&&!job.slotReleased)add('Abandon local run',b=>confirm(job,'abandon',b));
          if(job.canResume)add('Resume saved version',b=>confirm(job,'resume',b));if(job.canDiscard)add('Discard draft & keep Unlisted',b=>confirm(job,'discard',b));
          next.append(tools);if(row)row.replaceWith(next);row=next;if(hadFocus){const replacement=[...row.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')===focus&&!n.disabled)||row.querySelector('button:not(:disabled)')||row;replacement?.focus({preventScroll:true});}
        }
        row.querySelector('[data-message]').textContent=job.message||'';if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
      }list.scrollTop=top;
    }
    function draw(){const jobs=model.development||[],review=jobs.filter(j=>['review','publishing','publication-unknown'].includes(j.phase)||j.phase==='cancelled'||j.phase==='unknown'&&j.slotReleased),active=jobs.filter(j=>['starting','submitting','running','unknown'].includes(j.phase)&&!j.slotReleased),queue=jobs.filter(j=>j.phase==='queued');counts.textContent=model.coordinator==='Verified'?`${active.length} / 2 active · ${queue.length} queued`:'Unknown · saved queue snapshot';drawList(reviews,review,'No jobs awaiting review.');drawList(running,active,'No running Development jobs.');drawList(queued,queue,'No queued Development jobs.');}
    draw();return {update:next=>{if(Number.isFinite(next.revision)&&Number.isFinite(model.revision)&&next.revision<model.revision)return;model=next;draw();}};
  };
}
