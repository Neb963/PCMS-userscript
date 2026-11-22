import { el, button, dialog, picker } from './dom.js';
import { filterInventory, manageActions } from '../state/inventory.js';

export function inventoryRenderer({controller,project,actions={}}) {
  const view={query:'',filter:'all',sort:'slug',selected:new Set()};
  return ({doc,root,body,actions:headerActions,navigate,snapshot,params})=>{
    let model=snapshot,visible=[],refreshManage=null;
    const notice=el(doc,'p',{role:'status',className:'statusline'});
    const rows=el(doc,'div',{className:'inventory-list scroll',role:'rowgroup',tabindex:0,'aria-label':'Generator inventory'});
    const count=el(doc,'span',{className:'statusline'});
    const selectAll=el(doc,'input',{type:'checkbox','aria-label':'Select visible',onchange:()=>{for(const g of visible)selectAll.checked?view.selected.add(g.id):view.selected.delete(g.id);selection();}});
    const clear=button(doc,'Clear selection',()=>{view.selected.clear();selection();},{className:'link'});
    const selectionControls=el(doc,'div',{className:'selection-controls toolbar'},el(doc,'label',{},selectAll,'Select visible'),clear);
    const exclude=button(doc,'Exclude selected',()=>confirmSelection(true));
    const include=button(doc,'Include selected',()=>confirmSelection(false));
    const filters=el(doc,'div',{className:'inventory-filters'},selectionControls);
    for(const [key,label] of [['all','All'],['listed','Listed'],['unlisted','Unlisted'],['review','Review'],['held','Held'],['sync','Sync issues'],['excluded','Excluded']])filters.append(button(doc,label,()=>{view.filter=key;for(const b of filters.querySelectorAll('[data-filter]'))b.setAttribute('aria-pressed',String(b.dataset.filter===key));render(true);},{'data-filter':key,'aria-pressed':view.filter===key}));
    const search=el(doc,'input',{type:'search',placeholder:'Search slug or native ID','aria-label':'Search generators',value:view.query,oninput:event=>{view.query=event.target.value;render(true);}});
    const sort=picker(doc,root,'Sort generators',[['slug','Slug'],['workflow','Workflow'],['nativeId','Native ID']],view.sort,value=>{view.sort=value;render(true);});
    headerActions.append(button(doc,'Bulk Import',()=>navigate('import')));
    const table=el(doc,'div',{role:'table','aria-label':'Generators',className:'inventory-table panel'},el(doc,'div',{className:'inventory-head',role:'row'},['Generator','Listing','Workflow','GitHub','Refresher',''].map(text=>el(doc,'span',{role:'columnheader'},text))),rows);
    const footer=el(doc,'footer',{className:'footer inventory-footer'},count,el(doc,'div',{className:'toolbar'},exclude,include));
    body.append(el(doc,'div',{className:'inventory-view'},el(doc,'div',{className:'inventory-tools'},search,sort),filters,table,footer,notice));

    function selection(){
      const selectedVisible=visible.filter(g=>view.selected.has(g.id)).length;
      selectAll.checked=visible.length>0&&selectedVisible===visible.length;selectAll.indeterminate=selectedVisible>0&&selectedVisible<visible.length;
      selectAll.disabled=visible.length===0;clear.disabled=view.selected.size===0;exclude.disabled=include.disabled=view.selected.size===0;
      count.textContent=`${visible.length} visible · ${model.generators?.length||0} total · ${view.selected.size} selected`;
      for(const input of rows.querySelectorAll('input[data-id]')){input.checked=view.selected.has(input.dataset.id);input.closest('[role=row]').dataset.selected=String(input.checked);}
    }
    function render(reset=false){
      const top=rows.scrollTop;visible=filterInventory(model.generators||[],view);
      const wanted=new Set(visible.map(g=>g.id));
      for(const child of [...rows.children])if(!wanted.has(child.dataset.id))child.remove();
      if(!visible.length)rows.append(el(doc,'p',{className:'empty'},model.restored?'No matching generators':'Checking saved inventory…'));
      for(const [index,g] of visible.entries()){
        let row=[...rows.children].find(node=>node.dataset.id===g.id);
        if(!row){
          const check=el(doc,'input',{type:'checkbox','data-id':g.id,'aria-label':'Select '+g.slug,onchange:()=>{check.checked?view.selected.add(g.id):view.selected.delete(g.id);selection();}});
          const identity=el(doc,'div',{role:'cell',className:'inventory-identity'},check,el(doc,'div',{},el(doc,'strong',{},g.slug),el(doc,'p',{},'Native ID '+g.id)));
          const cells=['listing','workflow','github','refresher'].map(key=>el(doc,'div',{role:'cell',className:'inventory-state'},el(doc,'span',{className:'state-label'},key==='github'?'GitHub':key[0].toUpperCase()+key.slice(1)),el(doc,'span',{className:'tag','data-state':key},g.states?.[key]||'Unknown')));
          row=el(doc,'div',{role:'row',className:'inventory-row','data-id':g.id},identity,...cells,el(doc,'div',{role:'cell',className:'inventory-manage'},button(doc,'Manage',()=>openManage(g.id),{'aria-label':'Manage '+g.slug})));
        }
        const name=row.querySelector('strong');if(name.textContent!==g.slug)name.textContent=g.slug;
        row.querySelector('input').setAttribute('aria-label','Select '+g.slug);
        row.querySelector('.inventory-manage button').setAttribute('aria-label','Manage '+g.slug);
        for(const tag of row.querySelectorAll('[data-state]')){const text=g.states?.[tag.dataset.state]||'Unknown';if(tag.textContent!==text)tag.textContent=text;}
        if(rows.children[index]!==row)rows.insertBefore(row,rows.children[index]||null);
      }
      selection();rows.scrollTop=reset?0:top;
    }
    function confirmSelection(value){
      const ids=[...view.selected];const content=el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},`${value?'Exclude':'Include'} ${ids.length} selected generators? This changes local automation eligibility.`));
      const modal=dialog(doc,root,value?'Exclude selected':'Include selected',content);
      const confirm=button(doc,'Confirm',async()=>{
        confirm.disabled=true;
        try{const result=await controller.exclude(ids,value,true);update(project(result.state));const applied=result.result.filter(r=>r.applied).length;notice.textContent=`${applied} changed · ${result.result.length-applied} skipped`;modal.close();}
        catch{notice.textContent='Eligibility change unconfirmed. Recheck the current state.';confirm.disabled=false;}
      },{className:'primary'});
      content.append(el(doc,'div',{className:'toolbar'},button(doc,'Cancel',()=>modal.close()),confirm));
    }
    function openManage(id){
      let g=model.generators.find(g=>g.id===id);if(!g)return;
      const content=el(doc,'div',{className:'panelbody stack'});
      const modal=dialog(doc,root,'Manage '+g.slug,content,{drawer:true});let eligibilityControl=null;
      const refreshThis=()=>{if(!modal.isConnected)return;g=model.generators.find(item=>item.id===id)||g;draw();};refreshManage=refreshThis;modal.addEventListener('close',()=>{if(refreshManage===refreshThis)refreshManage=null;},{once:true});
      function draw(){
        const restoreEligibility=content.contains(root.activeElement)&&root.activeElement?.hasAttribute('data-eligibility');
        content.replaceChildren(el(doc,'p',{},'Native ID '+g.id),el(doc,'div',{className:'manage-states'},Object.entries(g.states||{}).map(([key,value])=>el(doc,'div',{},el(doc,'strong',{},key==='github'?'GitHub':key[0].toUpperCase()+key.slice(1)),el(doc,'span',{className:'tag'},value)))));
        if(g.holds?.length)content.append(el(doc,'p',{className:'notice'},g.holds.map(h=>h.kind).join(' · ')));
        const available=manageActions(g,Object.keys(actions));
        const tools=el(doc,'div',{className:'toolbar'});
        for(const action of available){
          if(action==='import')tools.append(button(doc,'Bulk Import',()=>{modal.close();navigate('import');}));
          else if(['exclude','include'].includes(action)){
            if(!eligibilityControl)eligibilityControl=button(doc,'',()=>{
              const excluding=!g.excluded;
              const inner=el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},`${excluding?'Exclude':'Include'} ${g.slug} from local automation?`));
              const confirmDialog=dialog(doc,root,excluding?'Exclude generator':'Include generator',inner,{returnFocus:()=>eligibilityControl});
              const yes=button(doc,'Confirm',async()=>{yes.disabled=true;try{const result=await controller.exclude([g.id],excluding,true);update(project(result.state));g=model.generators.find(item=>item.id===id);draw();confirmDialog.close();}catch{inner.append(el(doc,'p',{className:'error'},'Change unconfirmed.'));yes.disabled=false;}},{className:'primary'});
              inner.append(el(doc,'div',{className:'toolbar'},button(doc,'Cancel',()=>confirmDialog.close()),yes));
            },{'data-eligibility':''});
            eligibilityControl.textContent=g.excluded?'Include':'Exclude';tools.append(eligibilityControl);
          }
          else tools.append(button(doc,action[0].toUpperCase()+action.slice(1),()=>actions[action](g,{doc,root,modal,navigate})));
        }
        if(g.status?.state==='review'||g.holds?.some(h=>['review','cancelled-draft','helper-unknown'].includes(h.kind)))tools.append(button(doc,'Open Reviews',()=>{modal.close();navigate('reviews');}));
        if(g.holds?.some(h=>h.kind==='source-conflict'))tools.append(button(doc,'Open GitHub sync',()=>{modal.close();navigate('sync');}));
        content.append(tools);
        if(!g.ownerVerified)content.append(el(doc,'p',{className:'statusline'},'Ownership unverified. Confirm session in Settings before owner actions.'));
        if(restoreEligibility)content.querySelector('[data-eligibility]')?.focus({preventScroll:true});
      }
      draw();
      controller.inspect(id).then(verified=>{if(!modal.isConnected)return;g={...(model.generators.find(item=>item.id===id)||g),listing:verified.listing,ownerVerified:true};draw();}).catch(()=>{if(modal.isConnected){g={...(model.generators.find(item=>item.id===id)||g),ownerVerified:false};draw();}});
    }
    function update(next){if(Number.isFinite(next.revision)&&Number.isFinite(model.revision)&&next.revision<model.revision)return;model=next;render(false);refreshManage?.();}
    render();if(params?.manageId)openManage(params.manageId);
    return {update};
  };
}
