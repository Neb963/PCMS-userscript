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
    const search=el(doc,'input',{type:'search','aria-label':'Search activity',placeholder:'Search activity',value:view.query,oninput:e=>{view.query=e.target.value;view.limit=100;renderEvents(true);}});
    const tools=el(doc,'div',{className:'activity-tools',hidden:!view.expanded},search,picker(doc,root,'Activity filter',[['all','All'],['warnings','Warnings']],view.filter,value=>{view.filter=value;view.limit=100;renderEvents(true);}),button(doc,'Export journal',()=>downloadJSON(doc,'pcms-journal.json',exportJournal(model.journal||[])),{className:'link'}));
    activityPanel.insertBefore(tools,events);
    body.append(el(doc,'div',{className:'columns overview'},actionPanel,operationPanel,activityPanel));
    async function openCase(row){
      if(row.action==='Review'&&row.retainedTab){const result=await activateRetained(row.retainedTab);if(result.activated)return;dialog(doc,root,'Retained draft',el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},result.reason==='retained-tab-lost'?'The retained tab is unavailable. Keep the draft held and inspect Reviews.':'Switch to the existing tab: '+result.label),button(doc,'Open Reviews',()=>navigate('reviews'))));return;}
      navigate(row.destination,{manageId:row.nativeId});
    }
    function renderCases(){
      const cached=new Map([...cases.children].filter(n=>n.dataset.key).map(n=>[n.dataset.key,n]));const next=[];
      if(!model.restored){cases.replaceChildren();count.textContent='—';cases.append(el(doc,'p',{className:'empty'},'Checking saved state…'));expandReviews.hidden=true;return;}
      const all=model.cases||(model.storageAvailable===false?[{key:'storage',priority:0,title:'Storage unavailable',destination:'settings',action:'Settings'}]:[]);count.textContent=model.casesKnown?String(all.length):'—';
      const reviews=all.filter(c=>c.priority===5);expandReviews.hidden=reviews.length<2;expandReviews.textContent=view.expandedReviews?'Collapse reviews':'Expand reviews';
      const rows=all.filter(c=>view.expandedReviews||reviews.length<2||c.priority!==5);
      if(reviews.length>=2&&!view.expandedReviews)rows.push({key:'reviews',priority:5,title:`${reviews.length} awaiting review`,destination:'reviews',action:'Open Reviews'});
      if(!rows.length)next.push(el(doc,'p',{className:'empty'},model.casesKnown?'No action required':'Checking saved state…'));
      for(const row of rows){let node=cached.get(row.key);if(!node){node=el(doc,'div',{className:'row','data-key':row.key},el(doc,'div',{},el(doc,'strong'),el(doc,'p')),button(doc,'',()=>{const current=node.case;openCase(current).catch(()=>navigate(current.destination));}));}node.case=row;node.querySelector('strong').textContent=row.title;node.querySelector('p').textContent=row.slug||'This profile';node.querySelector('button').textContent=row.action;next.push(node);}for(const node of [...cases.children])if(!next.includes(node))node.remove();for(const [index,node] of next.entries())if(cases.children[index]!==node)cases.insertBefore(node,cases.children[index]||null);
    }
    function renderOps(){coordinator.textContent='Coordinator '+(model.coordinator||'Checking');const rows=model.operations||[['Refresher','refresher'],['AI Helper','reviews'],['Publication','utility'],['GitHub sync','sync']].map(([title,route])=>({title,route,status:'Unknown',detail:'State unavailable'}));for(const [i,row] of rows.entries()){let node=ops.children[i];if(!node){node=el(doc,'div',{className:'row'},el(doc,'div',{},el(doc,'strong'),el(doc,'p')),button(doc,'Open',()=>navigate(node.destination),{className:'link'}));ops.append(node);}node.destination=row.route;node.querySelector('strong').textContent=row.title;node.querySelector('p').textContent=row.status+' · '+row.detail;node.querySelector('button').setAttribute('aria-label','Open '+row.title);}}
    function details(event){dialog(doc,root,'Event details',el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},eventLabel(event)),...Object.entries(exportJournal([event])[0]||{}).map(([key,value])=>el(doc,'p',{},`${key}: ${value??'—'}`))));}
    function renderEvents(reset=false){
      const top=events.scrollTop,cached=new Map([...events.children].filter(n=>n.dataset.event).map(n=>[n.dataset.event,n]));
      if(!model.restored||!model.journal){events.replaceChildren();events.append(el(doc,'p',{className:'empty'},model.storageAvailable===false?'Journal unavailable':'Checking saved events…'));return;}
      let rows=view.expanded?[...model.journal].reverse():recentEvents(model.journal);
      rows=rows.filter(e=>(view.filter!=='warnings'||['failed','unknown','offline','held'].includes(e.outcome))&&`${eventLabel(e)} ${e.nativeId||''}`.toLowerCase().includes(view.query.toLowerCase()));
      const total=rows.length;rows=rows.slice(0,view.expanded?view.limit:3);
      const next=[];if(!rows.length)next.push(el(doc,'p',{className:'empty'},model.journal.length?'No matching events':'No activity recorded'));
      for(const event of rows){let row=cached.get(event.id);if(!row)row=button(doc,'',()=>details(row.event),{className:'journal-row','data-event':event.id});row.event=event;row.setAttribute('aria-label',eventLabel(event));let identity=row.firstElementChild;if(!identity){identity=el(doc,'div',{},el(doc,'strong'),el(doc,'p'));row.append(identity,el(doc,'time'));}identity.querySelector('strong').textContent=eventLabel(event);identity.querySelector('p').textContent=event.nativeId?'Native ID '+event.nativeId:event.component;row.querySelector('time').textContent=new Date(event.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});next.push(row);}
      if(view.expanded&&total>view.limit)next.push(button(doc,'Load older',()=>{view.limit+=100;renderEvents();},{className:'link'}));
      for(const node of [...events.children])if(!next.includes(node))node.remove();for(const [i,node] of next.entries())if(events.children[i]!==node)events.insertBefore(node,events.children[i]||null);
      events.scrollTop=reset?0:top;
    }
    function update(next){model=next;renderCases();renderOps();renderEvents();}
    update(model);return {update};
  };
}
