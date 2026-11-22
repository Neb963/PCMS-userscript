import {el,button,dialog} from './dom.js';

const LABELS=Object.freeze({'local-done':'Sync pending',prepared:'Prepared',pending:'Sync pending',synced:'Synced',offline:'Offline',unknown:'Write Unknown','source-conflict':'Source conflict','request-conflict':'Request conflict','account-conflict':'Account conflict','snapshot-unverified':'Awaiting native verification','original-access-unavailable':'Original access unavailable','live-verification-required':'Live verification required','publication-pending':'Preparing publication','publication-unknown':'Publication request Unknown','publication-queued':'Publication queued',reassigned:'Reassigned',superseded:'Superseded',stopped:'Stopped'});
const EXPLANATIONS=Object.freeze({offline:'The complete local snapshot is retained. Synchronization resumes when GitHub returns.',unknown:'The remote write may have finished. Recheck its result before another write.','source-conflict':'GitHub source differs from the verified approved local version. Compare before choosing.','request-conflict':'The workflow request or instructions changed. Resolve that work in its existing workflow.','account-conflict':'The GitHub assignment belongs to another account. Correct it there or stop managing locally.','snapshot-unverified':'Native source verification is still required. This snapshot cannot authorize synchronization.','original-access-unavailable':'The original repository cannot be read. Restore its access, reassign explicitly, or stop managing.','live-verification-required':'Real writes await disposable Firefox/Violentmonkey qualification.','publication-queued':'The previous approved source remains protected until the selected GitHub version is verified on Perchance.',stopped:'Local management stopped. Stored source and remote-outcome evidence are retained.',reassigned:'One explicit successor owns synchronization. The original snapshot remains stored.',superseded:'The chosen replacement was verified. The previous approved snapshot is retained.'});

export function syncRenderer({store,service,project}){
  const view={selected:null,section:'jobs',comparisons:new Map(),evidence:new Map()};
  return ({doc,root,body,snapshot,params,navigate})=>{
    let model=snapshot;
    view.selected=params?.pendingId||view.selected;
    const tabs=el(doc,'div',{className:'sync-tabs toolbar'}),jobsTab=button(doc,'Jobs',()=>section('jobs'),{'aria-pressed':true}),detailsTab=button(doc,'Details',()=>section('details'),{'aria-pressed':false});tabs.append(jobsTab,detailsTab);
    const list=el(doc,'div',{className:'scroll','aria-label':'Synchronization jobs',role:'list'}),counts=el(doc,'span',{className:'statusline'}),details=el(doc,'div',{className:'panelbody sync-details'}),footer=el(doc,'footer',{className:'footer toolbar sync-footer'}),notice=el(doc,'p',{role:'status',className:'statusline'});
    const layout=el(doc,'div',{className:'columns sync-layout','data-section':view.section},el(doc,'section',{className:'panel','data-pane':'jobs','aria-label':'Synchronization jobs'},el(doc,'header',{},el(doc,'h2',{},'Jobs'),counts),list),el(doc,'section',{className:'panel','data-pane':'details','aria-label':'Source and decision'},el(doc,'header',{},el(doc,'h2',{},'Source & decision')),details,footer));
    body.append(tabs,layout,notice);
    function section(value){view.section=value;layout.dataset.section=value;jobsTab.setAttribute('aria-pressed',String(value==='jobs'));detailsTab.setAttribute('aria-pressed',String(value==='details'));}
    function active(){return (model.syncJobs||[]).find(j=>j.id===view.selected);}
    function failure(error){notice.textContent=({'comparison-changed':'Versions changed. Compare again.','github-result-unknown':'Recheck the uncertain GitHub result first.','recheck-original-write-first':'Recheck the original repository write before reassignment.','resolve-development-before-stop':'Resolve or abandon the Development run in Reviews first.','reassignment-target-request-conflict':'The target repository has an incompatible request.','reassignment-target-source-conflict':'The target repository has different source.','native-capability-not-live-verified':'Native writes await live verification.','github-write-not-live-verified':'GitHub writes await live verification.'})[error.message]||'The action is unconfirmed. Protected source remains stored.';}
    async function refresh(){const state=await store.read();update(project(state));}
    async function perform(control,operation){control.disabled=true;try{const result=await operation();if(result?.queued)notice.textContent='Action queued. Results appear on this job.';await refresh();}catch(error){failure(error);if(control.isConnected)control.disabled=false;}}
    function confirm(title,text,operation,key){const content=el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},text));const modal=dialog(doc,root,title,content,{returnFocus:()=>footer.querySelector('[data-action="'+key+'"]')||root.querySelector('.pagehead button')});const yes=button(doc,'Confirm',()=>perform(yes,async()=>{const result=await operation();modal.close();return result;}),{className:'primary'});content.append(el(doc,'div',{className:'toolbar'},button(doc,'Cancel',()=>modal.close()),yes));}
    function draw(){
      const jobs=model.syncJobs||[];if(!jobs.some(j=>j.id===view.selected))view.selected=jobs[0]?.id||null;
      counts.textContent=`${jobs.filter(j=>!j.terminal).length} pending · ${jobs.length} total`;
      const top=list.scrollTop,focused=list.contains(root.activeElement)?root.activeElement?.dataset.id:null;list.replaceChildren();
      if(!jobs.length)list.append(el(doc,'p',{className:'empty'},model.restored?'No synchronization records':'Checking saved synchronization…'));
      for(const job of jobs){const row=button(doc,'',()=>{view.selected=job.id;section('details');detail();for(const node of list.children)node.setAttribute('aria-pressed',String(node.dataset.id===view.selected));},{className:'journal-row','data-id':job.id,role:'listitem','aria-pressed':view.selected===job.id});row.append(el(doc,'div',{},el(doc,'strong',{},job.slug),el(doc,'p',{},job.generatorId?'Native ID '+job.generatorId:'Request scope')),el(doc,'span',{className:'tag'},LABELS[job.phase]||'Unverified'));list.append(row);}
      list.scrollTop=top;if(focused)[...list.children].find(n=>n.dataset.id===focused)?.focus({preventScroll:true});detail();section(view.section);
    }
    function detail(){
      const job=active(),top=details.scrollTop,restoreEvidence=details.contains(root.activeElement)&&root.activeElement?.tagName==='SUMMARY',focused=footer.contains(root.activeElement)?root.activeElement?.dataset.action:null;
      details.replaceChildren();footer.replaceChildren();
      if(!job){details.append(el(doc,'p',{},'Select a job to inspect its saved synchronization state.'));return;}
      details.append(el(doc,'strong',{},job.slug),el(doc,'p',{className:'statusline'},'Original repository · '+job.repositoryLabel),el(doc,'p',{className:'statusline'},job.generatorId?'Native ID · '+job.generatorId:'Request scope'),el(doc,'div',{className:'sync-states'},[['Local',job.local],['Refresher',job.refresher],['GitHub',LABELS[job.phase]||'Unverified']].map(([label,value])=>el(doc,'div',{},el(doc,'strong',{},label),el(doc,'span',{className:'tag'},value)))));
      if(job.actionStatus)details.append(el(doc,'p',{className:'statusline'},'Last action · '+job.actionStatus+(job.actionReason==='comparison-changed'?' · Compare again':job.actionReason?' · Unconfirmed; source retained':'')));
      details.append(el(doc,'p',{className:'notice'},EXPLANATIONS[job.phase]||'The saved update remains tied to its original repository.'));
      const comparison=view.comparisons.get(job.id);
      if(job.canCompare){details.append(el(doc,'p',{className:'statusline'},'Local approval · '+job.approvalLabel),el(doc,'p',{className:'statusline'},'GitHub · '+(comparison?.commit||'Read by Compare versions')));}
      const evidence=el(doc,'details',{className:'sync-evidence',open:view.evidence.get(job.id)||false,ontoggle:event=>view.evidence.set(job.id,event.target.open)},el(doc,'summary',{},'Verification evidence'),el(doc,'p',{},'Complete source retained · '+(job.hasSource?'Yes':'Status only')),el(doc,'p',{},'Native source confirmed · '+(job.nativeVerified?'Yes':'Unverified')),el(doc,'p',{},'Original revision · '+job.baseCommit));details.append(evidence);
      const add=(text,action,key,disabled=false)=>{const control=button(doc,text,()=>action(control),{'data-action':key,disabled});footer.append(control);return control;};
      if(!job.terminal)add('Recheck result',control=>perform(control,()=>service().syncOne(job.id)),'recheck');
      if(job.canCompare){
        add('Compare versions',control=>perform(control,async()=>{const result=await service().compare(job.id);view.comparisons.set(job.id,{token:result.token,commit:result.commit});const content=el(doc,'div',{className:'panelbody stack'});for(const [label,source] of [['Approved local',result.local],['GitHub',result.remote]]){const block=el(doc,'details',{},el(doc,'summary',{},label),el(doc,'pre',{},source.pjs),el(doc,'pre',{},source.html),el(doc,'p',{},Object.entries(source.files).map(([path,value])=>path+' · '+value.length+' bytes').join('\n')||'Empty src/'));content.append(block);}dialog(doc,root,'Compare source versions',content,{returnFocus:()=>footer.querySelector('[data-action=compare]')});detail();}),'compare');
        add('Keep approved local',()=>confirm('Keep approved local','Commit the compared approved local source and done status to the original repository?',()=>service().decide(comparison.token,'local',true),'local'),'local',!comparison);
        add('Publish GitHub version',()=>confirm('Publish GitHub version','Queue the compared GitHub version through normal publication? The approved local source stays protected until the new Save and Listing are verified.',()=>service().decide(comparison.token,'github',true),'github'),'github',!comparison);
      }
      if(job.requestConflict)add('Open '+job.destination[0].toUpperCase()+job.destination.slice(1),()=>navigate(job.destination),'workflow');
      if(job.oldRepository&&!job.terminal)add('Reassign',()=>confirm('Reassign synchronization','Reassign this pending update to '+model.repositoryLabel+'? The original source snapshot is kept.',()=>service().reassign(job.id,true),'reassign'),'reassign',job.writeUnknown);
      if(!job.terminal)add('Stop managing',()=>confirm('Stop managing','Stop local management and keep the native generator and stored source?'+(job.writeUnknown?' An already-sent request may still finish.':''),()=>service().stop(job.id,true),'stop'),'stop');
      details.scrollTop=top;if(restoreEvidence)evidence.querySelector('summary').focus({preventScroll:true});
      if(job.actionBusy)for(const control of footer.querySelectorAll('button'))if(control.dataset.action!=='stop')control.disabled=true;
      if(focused)footer.querySelector('[data-action="'+focused+'"]')?.focus({preventScroll:true});
    }
    function update(next){model=next;draw();}
    draw();return {update};
  };
}
