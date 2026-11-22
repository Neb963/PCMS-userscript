import {operationLabel} from './labels.js';
import {el,button} from './dom.js';

export function utilityRenderer(){
  let selected=null;
  return ({doc,body,snapshot,navigate,params})=>{
    let model=snapshot;selected=params?.jobId||selected;
    const list=el(doc,'div',{className:'scroll',role:'list','aria-label':'Utility jobs'}),worker=el(doc,'span',{className:'statusline'}),steps=el(doc,'div',{className:'panelbody scroll'});
    const jobsPanel=el(doc,'section',{className:'panel','aria-label':'Utility jobs'},el(doc,'header',{},el(doc,'h2',{},'Utility'),worker),list);
    const detailPanel=el(doc,'section',{className:'panel','aria-label':'Job steps'},el(doc,'header',{},el(doc,'h2',{},'Selected job')),steps);
    body.append(el(doc,'div',{className:'columns utility-layout'},jobsPanel,detailPanel));
    function draw(){
      worker.textContent=model.coordinator==='Verified'?'Worker '+(model.utilityWorker||'Unknown'):'Worker Unknown';
      const jobs=model.utility||[];if(!jobs.some(j=>j.id===selected))selected=jobs[0]?.id||null;
      const scroll=list.scrollTop,focus=list.contains(list.getRootNode().activeElement)?list.getRootNode().activeElement.dataset.job:null;
      list.replaceChildren();
      if(!jobs.length)list.append(el(doc,'p',{className:'empty'},model.restored?'No Utility jobs':'Checking saved jobs…'));
      for(const job of jobs){const row=button(doc,'',()=>{selected=job.id;detail();for(const n of list.children)n.setAttribute('aria-pressed',String(n.dataset.job===selected));},{className:'journal-row','data-job':job.id,'aria-pressed':job.id===selected,role:'listitem'});row.append(el(doc,'div',{},el(doc,'strong',{},job.slug),el(doc,'p',{},job.action==='develop'?'Reservation':job.action==='rename'?'Rename':job.action==='rollback'?'Rollback':'Publish from GitHub')),el(doc,'span',{className:'tag'},operationLabel(job.phase)));list.append(row);}
      list.scrollTop=scroll;if(focus)list.querySelector('[data-job="'+focus+'"]')?.focus({preventScroll:true});detail();
    }
    function detail(){
      const job=(model.utility||[]).find(j=>j.id===selected);steps.replaceChildren();
      if(!job){steps.append(el(doc,'p',{},'Select a job to inspect its verified steps.'));return;}
      steps.append(el(doc,'strong',{},job.slug),el(doc,'p',{className:'statusline'},operationLabel(job.phase)));
      if(job.reason)steps.append(el(doc,'p',{className:'notice'},job.reason==='live-verification-required'?'Native writes await disposable Firefox/Violentmonkey verification.':job.reason.replaceAll('-',' ')));
      if(job.steps.length){const ordered=el(doc,'ol',{});for(const step of job.steps)ordered.append(el(doc,'li',{},step+' · Verified'));steps.append(ordered);}
      if(job.generatorId&&['unknown','blocked'].includes(job.phase))steps.append(button(doc,'Manage',()=>navigate('generators',{manageId:job.generatorId})));
      if(job.phase==='sync-pending')steps.append(button(doc,'Open GitHub sync',()=>navigate('sync')));
    }
    draw();return {update:next=>{model=next;draw();}};
  };
}
