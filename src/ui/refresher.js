import {el,button} from './dom.js';

function clockText(at){if(!Number.isFinite(at))return '—';try{return new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(at));}catch{return '—';}}
function waitText(at){if(!Number.isFinite(at))return '—';const seconds=Math.max(0,Math.ceil((at-Date.now())/1000));return seconds===0?'Now':seconds<60?seconds+' sec':Math.ceil(seconds/60)+' min';}

export function refresherRenderer({controller,project}){
  const view={membership:'eligible',pane:'queue',capDraft:null,dirty:false};
  return ({doc,body,actions,snapshot,navigate})=>{
    let model=snapshot.refresher||{},revision=snapshot.revision;
    const notice=el(doc,'p',{role:'status',className:'statusline'}),status=el(doc,'div',{className:'refresh-status','aria-label':'Refresher operating state'}),mobile=el(doc,'div',{className:'refresh-mobile toolbar','aria-label':'Refresher mobile sections'}),layout=el(doc,'div',{className:'refresh-layout','data-pane':view.pane});
    const pause=button(doc,model.paused?'Resume':'Pause',async()=>{pause.disabled=true;try{const result=await controller.paused(!model.paused);update(project(result.state));notice.textContent=model.paused?'Paused. A Save already in progress may finish.':'Resume preference saved. Worker state is shown above.';}catch{notice.textContent='Pause preference unconfirmed. Recheck protected storage.';}finally{pause.disabled=false;}},{className:'primary'});actions.append(pause);
    for(const [value,label] of [['queue','Queue'],['rate','Rate'],['attempts','Attempts']])mobile.append(button(doc,label,()=>{view.pane=value;layout.dataset.pane=value;for(const b of mobile.children)b.setAttribute('aria-pressed',String(b.dataset.pane===value));},{'data-pane':value,'aria-pressed':view.pane===value}));
    const membership=el(doc,'div',{className:'toolbar refresh-membership','aria-label':'Queue membership'}),eligible=button(doc,'Eligible',()=>select('eligible'),{'aria-pressed':view.membership==='eligible'}),ineligible=button(doc,'Not eligible',()=>select('ineligible'),{'aria-pressed':view.membership==='ineligible'});membership.append(eligible,ineligible);
    const rows=el(doc,'div',{className:'scroll refresh-rows',role:'rowgroup','aria-label':'Refresher queue rows',tabindex:0}),columns=el(doc,'div',{className:'refresh-columnhead',role:'row'}),table=el(doc,'div',{className:'refresh-table',role:'table','aria-label':'Eligible FIFO queue'},columns,rows),foot=el(doc,'footer',{className:'refresh-foot'});
    const queue=el(doc,'section',{className:'panel refresh-queue','aria-label':'Refresher generator queue'},el(doc,'header',{},el(doc,'h2',{},'FIFO queue'),membership),table,foot);
    const cap=el(doc,'input',{type:'number',inputmode:'numeric',min:1,max:3600,step:1,value:view.capDraft??String(model.cap??30),'aria-label':'Max attempts per hour','aria-describedby':'pcms-refresh-cap-error',oninput:()=>{view.capDraft=cap.value;view.dirty=true;}});
    const error=el(doc,'p',{id:'pcms-refresh-cap-error',role:'status',className:'refresh-error'}),derived=el(doc,'div',{className:'refresh-derived'});
    const apply=button(doc,'Apply',async()=>{
      const value=Number(cap.value);if(!Number.isInteger(value)||value<1||value>3600){error.textContent='Use an integer from 1 to 3600.';cap.setAttribute('aria-invalid','true');return;}
      apply.disabled=true;try{const result=await controller.cap(value);view.dirty=false;view.capDraft=String(result.state.settings.refreshCap);error.textContent='';cap.setAttribute('aria-invalid','false');update(project(result.state));}catch{error.textContent='Limit unconfirmed. Recheck protected storage.';}finally{apply.disabled=false;}
    });
    const rate=el(doc,'section',{className:'panel refresh-rate','aria-label':'Refresher rate configuration'},el(doc,'header',{},el(doc,'h2',{},'Rate limit')),el(doc,'div',{className:'refresh-rate-body'},el(doc,'label',{'for':'pcms-refresh-cap'},'Max attempts / hour'),el(doc,'div',{className:'refresh-inputrow'},cap,apply),error,derived,el(doc,'p',{className:'statusline'},'Estimates assume continuous operation without skips; rates are not guarantees.')));cap.id='pcms-refresh-cap';
    const attempts=el(doc,'div',{className:'scroll refresh-attempts',role:'list','aria-label':'Recent Save attempts',tabindex:0}),attemptCount=el(doc,'span',{className:'statusline'}),history=el(doc,'section',{className:'panel refresh-history','aria-label':'Recent native Save attempt results'},el(doc,'header',{},el(doc,'h2',{},'Recent attempts'),attemptCount),attempts),side=el(doc,'div',{className:'refresh-side'},rate,history);
    layout.append(queue,side);body.append(status,mobile,layout,notice);
    function select(value){view.membership=value;eligible.setAttribute('aria-pressed',String(value==='eligible'));ineligible.setAttribute('aria-pressed',String(value==='ineligible'));drawQueue(true);}
    function drawQueue(reset=false){
      const list=view.membership==='eligible'?model.queue||[]:model.notEligible||[],top=rows.scrollTop,wanted=new Set(list.map(g=>g.id));
      table.setAttribute('aria-label',view.membership==='eligible'?'Eligible FIFO queue':'Not eligible generators');table.dataset.held=String(view.membership==='ineligible');
      columns.replaceChildren(...['#','Generator','1h / last','Status',...(view.membership==='ineligible'?['Action']:[])].map(text=>el(doc,'span',{role:'columnheader'},text)));
      for(const child of [...rows.children])if(!wanted.has(child.dataset.id)||child.dataset.membership!==view.membership)child.remove();
      if(!list.length)rows.append(el(doc,'p',{className:'empty'},model.available===false?'Queue unavailable. Check protected attempt history.':view.membership==='eligible'?'No eligible generators. No Save will be attempted.':'All known generators are eligible.'));
      for(const [index,g] of list.entries()){
        let row=[...rows.children].find(n=>n.dataset.id===g.id);
        if(!row){row=el(doc,'div',{className:'refresh-row',role:'row','data-id':g.id,'data-membership':view.membership},el(doc,'span',{role:'cell','data-field':'position'}),el(doc,'div',{role:'cell',className:'refresh-identity'},el(doc,'strong',{},g.slug),el(doc,'small',{},'#'+g.id)),el(doc,'span',{role:'cell',className:'refresh-recent','data-field':'recent'}),el(doc,'span',{role:'cell',className:'tag','data-field':'status'}));if(view.membership==='ineligible')row.append(button(doc,'Manage',()=>navigate('generators',{manageId:g.id}),{className:'link','aria-label':'Manage '+g.slug}));}
        row.querySelector('strong').textContent=g.slug;row.querySelector('button')?.setAttribute('aria-label','Manage '+g.slug);row.querySelector('[data-field=position]').textContent=view.membership==='eligible'?String(g.position).padStart(2,'0'):'—';row.querySelector('[data-field=recent]').textContent=view.membership==='eligible'?`${g.used}/${g.perGeneratorCap} · ${clockText(g.lastAt)}`:'—';row.querySelector('[data-field=status]').textContent=view.membership==='ineligible'?g.reason:g.next?'Next':g.atCap?'At cap':'Waiting';
        if(rows.children[index]!==row)rows.insertBefore(row,rows.children[index]||null);
      }
      foot.textContent=view.membership==='ineligible'?'Not eligible entries do not spend Save slots.':'One attempt per slot · failures count · FIFO';rows.scrollTop=reset?0:top;
    }
    function drawAttempts(){
      const top=attempts.scrollTop;attempts.replaceChildren();const list=model.attempts||[];attemptCount.textContent=String(list.length)+' retained';
      if(!list.length)attempts.append(el(doc,'p',{className:'empty'},'No Save attempts recorded.'));
      for(const a of list){const details=a.reason==='native-rejected'?'Native Save rejected':a.reason==='source-drift'?'Saved source changed':a.outcome==='Unknown'?'Acknowledgement or readback unverified':a.outcome==='Skipped'?'No Save sent':'';attempts.append(el(doc,'div',{className:'refresh-event',role:'listitem'},el(doc,'time',{},clockText(a.at)),el(doc,'span',{className:'refresh-event-name'},a.slug||'#'+a.generatorId),el(doc,'span',{className:'tag'},a.outcome),...(details?[el(doc,'small',{},details)]:[])));}
      attempts.scrollTop=top;
    }
    function draw(){
      pause.textContent=model.paused?'Resume':'Pause';eligible.textContent=(model.snapshotOnly?'Snapshot':'Eligible')+' ('+(model.queue?.length||0)+')';ineligible.textContent='Not eligible ('+(model.notEligible?.length||0)+')';
      status.replaceChildren(el(doc,'span',{className:'tag'},model.workerState||'Unknown'),el(doc,'span',{'data-status':'eligible'},model.snapshotOnly?`${model.queue?.length||0} in queue · snapshot only`:`${model.rates?.eligibleCount??'—'} eligible`),el(doc,'span',{'data-status':'attempts'},`${model.workerKnown?model.rates?.used??'—':'—'} / ${model.cap??'—'} attempts · rolling 60 min`),el(doc,'span',{className:'refresh-next',title:'Next · '+(model.nextSlug||'—')+' · '+waitText(model.nextAt)},'Next · '+(model.nextSlug||'—')+' · '+waitText(model.nextAt)),el(doc,'span',{},'Last · '+(model.lastResult||'—')));
      if(!view.dirty)cap.value=String(model.cap??30);
      const rates=model.rates;derived.replaceChildren(...[['Per-generator cap',rates?.perGeneratorCap===null||!rates?'—':rates.perGeneratorCap+' / h'],['Estimated rate',rates?.estimatedRate===null||!rates?'—':rates.estimatedRate.toFixed(2)+' / h'],['Estimated interval',rates?.estimatedIntervalHours===null||!rates?'—':(rates.estimatedIntervalHours*60<1?Math.ceil(rates.estimatedIntervalHours*3600)+' sec':Math.round(rates.estimatedIntervalHours*60)+' min')]].map(([label,value])=>el(doc,'div',{},el(doc,'span',{},label),el(doc,'strong',{},value))));
      drawQueue();drawAttempts();
    }
    function update(next){if(Number.isFinite(next.revision)&&Number.isFinite(revision)&&next.revision<revision)return;revision=next.revision;model=next.refresher||{};draw();}
    draw();return {update};
  };
}
