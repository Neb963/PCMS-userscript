import { el, button } from './dom.js';
import { enqueueImport } from '../runtime/commands.js';
import { INTEGRATION_PROOF } from '../runtime/context.js';

export function importRenderer({store,workflow}){
  const view={query:'',filter:'ready',selected:new Set(),candidates:null,runId:null,repository:null};
  return ({doc,body,actions,navigate})=>{
    let disposed=false,loading=false;
    const heading=el(doc,'p',{className:'statusline'}),notice=el(doc,'p',{role:'status',className:'statusline'});
    const list=el(doc,'div',{className:'scroll import-list',tabindex:0,'aria-label':'Import candidates'});
    const count=el(doc,'span',{className:'statusline'});
    const search=el(doc,'input',{type:'search','aria-label':'Search import candidates',placeholder:'Search generators',value:view.query,oninput:event=>{view.query=event.target.value;if(view.runId)update().catch(()=>{});else draw(true);}});
    const filters=el(doc,'div',{className:'toolbar'});
    for(const [key,label]of [['ready','Ready'],['all','All']])filters.append(button(doc,label,()=>{view.filter=key;if(view.runId)update().catch(()=>{});else draw(true);},{'data-filter':key,'aria-pressed':view.filter===key}));
    const select=el(doc,'input',{type:'checkbox','aria-label':'Select visible import candidates',onchange:()=>{for(const row of visible())if(row.eligible)select.checked?view.selected.add(row.id):view.selected.delete(row.id);selection();}});
    const submit=button(doc,'Import selected',async()=>{
      submit.disabled=true;
      try{if(!view.repository)throw new Error('import-settings-changed');view.runId=await enqueueImport(store,[...view.selected],view.repository);await update();}
      catch{notice.textContent='Import could not be queued. Recheck the session and tested repository settings.';selection();}
    },{className:'primary'});
    const refresh=button(doc,'Recheck',()=>load());actions.append(refresh);
    const selectionLabel=el(doc,'label',{},select,'Select visible');
    const panel=el(doc,'section',{className:'panel import-panel','aria-label':'Bulk Import'},el(doc,'header',{},heading),el(doc,'div',{className:'import-tools'},search,filters,selectionLabel),list,el(doc,'footer',{className:'footer'},count,submit));
    body.append(panel,notice);
    function visible(){return (view.candidates||[]).filter(r=>(view.filter==='all'||r.eligible)&&(r.slug+' '+(r.id||'')).toLowerCase().includes(view.query.toLowerCase()));}
    function selection(){const eligible=visible().filter(r=>r.eligible),selected=eligible.filter(r=>view.selected.has(r.id)).length;select.checked=eligible.length>0&&selected===eligible.length;select.indeterminate=selected>0&&selected<eligible.length;select.disabled=loading||eligible.length===0;submit.disabled=loading||view.selected.size===0||!INTEGRATION_PROOF.githubWrite||!!view.runId;count.textContent=`${view.selected.size} selected`;for(const input of list.querySelectorAll('input[data-id]'))input.checked=view.selected.has(input.dataset.id);}
    function draw(reset=false){
      submit.hidden=false;selectionLabel.hidden=false;filters.querySelector('[data-filter=ready]').textContent='Ready';
      const top=list.scrollTop;list.replaceChildren();
      for(const b of filters.children)b.setAttribute('aria-pressed',String(b.dataset.filter===view.filter));
      if(!view.candidates){list.append(el(doc,'p',{className:'empty'},loading?'Checking native saved source and GitHub folders…':'Candidates unavailable'));selection();return;}
      const rows=visible();heading.textContent=`${view.candidates.filter(r=>r.eligible).length} Ready · ${view.candidates.length} discovered`;
      for(const row of rows){const input=el(doc,'input',{type:'checkbox','data-id':row.id||'',disabled:!row.eligible,'aria-label':'Import '+row.slug,onchange:()=>{input.checked?view.selected.add(row.id):view.selected.delete(row.id);selection();}});list.append(el(doc,'div',{className:'row'},el(doc,'div',{className:'toolbar'},input,el(doc,'div',{},el(doc,'strong',{},row.slug),el(doc,'p',{},row.id?'Native ID '+row.id:'Identity unverified'))),el(doc,'span',{className:'tag'},row.eligible?'Ready':{'folder-exists':'GitHub folder exists','already-managed':'Already managed','saved-source-unavailable':'Saved source unavailable',unverified:'Unverified'}[row.reason]||'Unavailable')));}
      if(!rows.length)list.append(el(doc,'p',{className:'empty'},'No matching candidates'));
      selection();list.scrollTop=reset?0:top;
    }
    async function load(){if(loading)return;loading=true;refresh.disabled=true;view.runId=null;notice.textContent='';draw();try{const operation=await workflow();const candidates=await operation.preview({cancelled:()=>disposed});if(disposed)return;view.candidates=candidates;view.repository=structuredClone(operation.github.repository);view.selected=new Set(candidates.filter(r=>r.eligible).map(r=>r.id));}catch{if(!disposed){view.candidates=null;notice.textContent='Confirm the Perchance session and test GitHub settings before importing.';}}finally{loading=false;if(!disposed){refresh.disabled=false;draw();if(!INTEGRATION_PROOF.githubWrite)notice.textContent+=' GitHub import writes await live integration verification.';}}}
    async function update(){
      if(!view.runId)return;const state=await store.read(),run=state.commands?.[view.runId];if(!run||disposed)return;
      heading.textContent=run.phase==='running'?'Import in progress':run.phase==='queued'?'Import queued':'Import results';
      submit.hidden=true;selectionLabel.hidden=true;filters.querySelector('[data-filter=ready]').textContent='Processed';
      const results=Object.values(run.results);list.replaceChildren();
      const processed=results.filter(r=>r.outcome!=='skipped'),shown=(view.filter==='all'?[...processed,...results.filter(r=>r.outcome==='skipped')]:processed).filter(r=>((r.slug||'')+' '+r.id).toLowerCase().includes(view.query.toLowerCase()));
      for(const row of shown)list.append(el(doc,'div',{className:'row'},el(doc,'div',{},el(doc,'strong',{},row.slug||row.id),el(doc,'p',{},({'folder-exists':'GitHub folder already exists','already-managed':'Already managed','github-result':'GitHub result unknown','source-drift':'Saved source changed','snapshot-failure':'Saved source unavailable','source-conflict':'GitHub source changed','source-or-session-unavailable':'Source or session unavailable','owner-mismatch':'Ownership mismatch','sign-in-required':'Sign in required','confirm-session-required':'Confirm session required','account-assignment-mismatch':'Account assignment changed','github-write-not-live-verified':'Live integration verification required'}[row.reason]||''))),el(doc,'span',{className:'tag'},row.outcome),...(row.outcome==='unknown'?[button(doc,'Open GitHub sync',()=>navigate('sync'))]:[])));
      if(!results.length)list.append(el(doc,'p',{className:'empty'},run.reason?'Import unavailable. Recheck the session and original repository.':'Waiting for the Coordinator.'));
      count.textContent=`${results.filter(r=>r.outcome==='imported').length} imported · ${results.filter(r=>r.outcome==='skipped').length} skipped · ${results.filter(r=>['held','unknown','failed'].includes(r.outcome)).length} need attention`;
      submit.disabled=true;
    }
    async function restore(){
      const state=await store.read();if(disposed)return;
      if(!view.runId){const unfinished=Object.values(state.commands||{}).filter(c=>c.kind==='bulk-import'&&['queued','running','unknown','blocked'].includes(c.phase)).at(-1);if(unfinished)view.runId=unfinished.id;}
      if(view.runId)await update();else if(!view.candidates)await load();else draw();
    }
    restore().catch(()=>{notice.textContent='Import state unavailable.';});
    return {update:()=>{if(view.runId)update().catch(()=>{notice.textContent='Results unavailable.';});},dispose:()=>{disposed=true;}};
  };
}
