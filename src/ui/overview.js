import { el, button, dialog, picker } from './dom.js';
import { recentEvents, eventLabel, exportJournal } from '../state/journal.js';
import { downloadJSON } from './settings.js';

export function overviewRenderer({ activateRetained }) {
  const view={expanded:false,expandedReviews:false,query:'',filter:'all',limit:100};
  return ({doc,root,body,navigate,snapshot})=>{
    let model=snapshot;
    const cases=el(doc,'div',{className:'scroll'}),ops=el(doc,'div',{className:'scroll'}),events=el(doc,'div',{className:'scroll',tabindex:0,'aria-label':'Activity history'});
    const coordinator=el(doc,'span',{className:'statusline'}),count=el(doc,'span',{className:'tag'});
    function panel(title,list,action){return el(doc,'section',{className:'panel','aria-label':title},el(doc,'header',{},el(doc,'h2',{},title),...(action?[action]:[])),list);}
    const expandReviews=button(doc,'Expand reviews',()=>{view.expandedReviews=!view.expandedReviews;renderCases();},{className:'link'});
    const actionPanel=panel('Requires action',cases,el(doc,'div',{className:'toolbar'},count,expandReviews));
    const operationPanel=panel('Operations',ops,coordinator);
    const expand=button(doc,view.expanded?'Show less':'Show all',()=>{view.expanded=!view.expanded;expand.textContent=view.expanded?'Show less':'Show all';tools.hidden=!view.expanded;renderEvents();},{className:'link'});
    const activityPanel=panel('Recent activity',events,expand);
    const search=el(doc,'input',{type:'search','aria-label':'Search activity',placeholder:'Search activity',value:view.query,oninput:e=>{view.query=e.target.value;view.limit=100;renderEvents();}});
    const tools=el(doc,'div',{className:'activity-tools',hidden:!view.expanded},search,picker(doc,root,'Activity filter',[['all','All'],['warnings','Warnings']],view.filter,value=>{view.filter=value;view.limit=100;renderEvents();}),button(doc,'Export journal',()=>downloadJSON(doc,'pcms-journal.json',exportJournal(model.journal||[])),{className:'link'}));
    activityPanel.insertBefore(tools,events);
    body.append(el(doc,'div',{className:'columns overview'},actionPanel,operationPanel,activityPanel));
    async function openCase(row){
      if(row.action==='Review'&&row.retainedTab){const result=await activateRetained(row.retainedTab);if(result.activated)return;dialog(doc,root,'Retained draft',el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},result.reason==='retained-tab-lost'?'The retained tab is unavailable. Keep the draft held and inspect Reviews.':'Switch to the existing tab: '+result.label),button(doc,'Open Reviews',()=>navigate('reviews'))));return;}
      navigate(row.destination,{manageId:row.nativeId});
    }
    function renderCases(){
      cases.replaceChildren();
      if(!model.restored){count.textContent='—';cases.append(el(doc,'p',{className:'empty'},'Checking saved state…'));expandReviews.hidden=true;return;}
      const all=model.cases||(model.storageAvailable===false?[{key:'storage',priority:0,title:'Storage unavailable',destination:'settings',action:'Settings'}]:[]);count.textContent=model.casesKnown?String(all.length):'—';
      const reviews=all.filter(c=>c.priority===5);expandReviews.hidden=reviews.length<2;expandReviews.textContent=view.expandedReviews?'Collapse reviews':'Expand reviews';
      const rows=all.filter(c=>view.expandedReviews||reviews.length<2||c.priority!==5);
      if(reviews.length>=2&&!view.expandedReviews)rows.push({key:'reviews',priority:5,title:`${reviews.length} awaiting review`,destination:'reviews',action:'Open Reviews'});
      if(!rows.length)cases.append(el(doc,'p',{className:'empty'},model.casesKnown?'No action required':'Checking saved state…'));
      for(const row of rows)cases.append(el(doc,'div',{className:'row'},el(doc,'div',{},el(doc,'strong',{},row.title),el(doc,'p',{},row.slug||'This profile')),button(doc,row.action,()=>{openCase(row).catch(()=>navigate(row.destination));})));
    }
    function renderOps(){coordinator.textContent='Coordinator '+(model.coordinator||'Checking');ops.replaceChildren();for(const row of model.operations||[['Refresher','refresher'],['AI Helper','reviews'],['Publication','utility'],['GitHub sync','sync']].map(([title,route])=>({title,route,status:'Unknown',detail:'State unavailable'})))ops.append(el(doc,'div',{className:'row'},el(doc,'div',{},el(doc,'strong',{},row.title),el(doc,'p',{},row.status+' · '+row.detail)),button(doc,'Open',()=>navigate(row.route),{className:'link','aria-label':'Open '+row.title})));}
    function details(event){dialog(doc,root,'Event details',el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},eventLabel(event)),...Object.entries(exportJournal([event])[0]||{}).map(([key,value])=>el(doc,'p',{},`${key}: ${value??'—'}`))));}
    function renderEvents(){
      const top=events.scrollTop;events.replaceChildren();
      if(!model.restored||!model.journal){events.append(el(doc,'p',{className:'empty'},model.storageAvailable===false?'Journal unavailable':'Checking saved events…'));return;}
      let rows=view.expanded?[...model.journal].reverse():recentEvents(model.journal);
      rows=rows.filter(e=>(view.filter!=='warnings'||['failed','unknown','offline','held'].includes(e.outcome))&&`${eventLabel(e)} ${e.nativeId||''}`.toLowerCase().includes(view.query.toLowerCase()));
      const total=rows.length;rows=rows.slice(0,view.expanded?view.limit:3);
      if(!rows.length)events.append(el(doc,'p',{className:'empty'},model.journal.length?'No matching events':'No activity recorded'));
      for(const event of rows)events.append(button(doc,'',()=>details(event),{className:'journal-row','aria-label':eventLabel(event)}));
      [...events.querySelectorAll('.journal-row')].forEach((row,i)=>{const event=rows[i];row.append(el(doc,'div',{},el(doc,'strong',{},eventLabel(event)),el(doc,'p',{},event.nativeId?'Native ID '+event.nativeId:event.component)),el(doc,'time',{},new Date(event.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})));});
      if(view.expanded&&total>view.limit)events.append(button(doc,'Load older',()=>{view.limit+=100;renderEvents();},{className:'link'}));
      events.scrollTop=top;
    }
    function update(next){model=next;renderCases();renderOps();renderEvents();}
    update(model);return {update};
  };
}
