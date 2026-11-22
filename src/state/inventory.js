import { requireThat, addHold, nativeId } from '../shared/domain.js';
import { appendEvent } from './journal.js';

export function inventoryRows(state) {
  const rows=new Map(Object.values(state.generators).map(g=>[g.id,{...g,managed:true}]));
  for(const item of state.inventory||[]) {
    if(!item.verified||!item.id||rows.has(item.id))continue;
    rows.set(item.id,{id:item.id,slug:item.slug,listing:item.listing,status:null,holds:[],managed:false,ownerVerified:true,savedVerified:false,excluded:false});
  }
  return [...rows.values()];
}

export function refresherReason(g) {
  if(!g.managed)return 'Not managed';
  if(g.listing!=='listed')return g.listing==='unlisted'?'Unlisted':'Listing unknown';
  if(g.excluded)return 'Excluded';
  if(!g.savedVerified)return 'Saved source unverified';
  if(g.status?.state!=='done'&&!g.localDone)return 'Workflow '+(g.status?.state||'unknown');
  const holds=(g.holds||[]).filter(h=>!(h.kind==='source-conflict'&&g.localApproved&&g.localDone));
  if(holds.length)return 'Held · '+holds[0].kind;
  if(g.ownerVerified!==true)return 'Ownership unknown';
  return null;
}

export function generatorStates(g,state) {
  const pending=Object.values(state.pending).filter(p=>p.generatorId===g.id&&p.phase!=='synced');
  const conflict=(g.holds||[]).some(h=>['source-conflict','account-conflict','request-conflict'].includes(h.kind));
  const labels={ready:'Ready',reserved:'Reserved',review:'Awaiting review',done:'Done',blocked:'Blocked'};
  const reason=refresherReason(g);
  return {listing:g.listing==='listed'?'Listed':g.listing==='unlisted'?'Unlisted':'Unknown',workflow:g.localDone?'Local done':g.status?Object.hasOwn(labels,g.status.state)?labels[g.status.state]:'Unknown':'Not managed',github:!g.managed?'Not managed':conflict?'Conflict':pending.length?'Sync pending':g.githubCommit?'Synced':'Unknown',refresher:reason===null?'Eligible':g.excluded?'Excluded':g.holds?.length?'Held':'Not eligible'};
}

export function filterInventory(rows,{query='',filter='all',sort='slug'}={}) {
  const text=query.toLowerCase();
  return rows.filter(g=>(g.slug+' '+g.id).toLowerCase().includes(text)).filter(g=>filter==='all'||filter==='listed'&&g.listing==='listed'||filter==='unlisted'&&g.listing==='unlisted'||filter==='review'&&g.status?.state==='review'||filter==='held'&&g.holds.length>0||filter==='sync'&&['Conflict','Sync pending'].includes(g.states?.github)||filter==='excluded'&&g.excluded).sort((a,b)=>String(sort==='nativeId'?a.id:sort==='workflow'?a.states?.workflow:a.slug).localeCompare(String(sort==='nativeId'?b.id:sort==='workflow'?b.states?.workflow:b.slug))||a.id.localeCompare(b.id));
}

export function manageActions(g,available=[]) {
  const result=g.managed?[g.excluded?'include':'exclude']:['import'];
  if(g.managed&&g.ownerVerified===true&&g.status&&!g.holds.length)for(const action of ['edit','rename','rollback'])if(available.includes(action))result.push(action);
  return result;
}

export class InventoryController {
  constructor({store,reader,native,gate}){Object.assign(this,{store,reader,native,gate});}

  async refresh() {
    const observed=await this.reader.inventory();
    return this.store.transact(state=>{
      state.inventory=observed;state.inventoryAt=Date.now();
      for(const [id,g] of Object.entries(state.generators)) {
        if(Object.values(state.maintenance||{}).some(r=>r.generatorId===id&&!['done','failed','stopped'].includes(r.phase)))continue;
        const row=observed.find(r=>r.verified&&r.id===id);
        if(!row||row.slug!==g.slug){state.generators[id]=addHold({...g,ownerVerified:false},{id:'identity-'+id,kind:'identity-mismatch'});continue;}
        g.ownerVerified=true;
        if(g.listing==='listed'&&row.listing==='unlisted')state.generators[id]=addHold({...g,listing:'unlisted'},{id:'listing-'+id,kind:'listing-mismatch'});
        else g.listing=row.listing;
      }
    });
  }

  async inspect(id) {
    nativeId(id);const state=await this.store.read(),g=inventoryRows(state).find(g=>g.id===id);requireThat(g,'generator-not-found');
    requireThat(!Object.values(state.maintenance||{}).some(r=>r.generatorId===id&&!['done','failed','stopped'].includes(r.phase)),'maintenance-in-progress');
    let live;
    try { await this.gate.requireOwner({id,slug:g.slug});live=await this.reader.metadata(g.slug);requireThat(live.id===id,'native-target-mismatch'); }
    catch(error){
      if(g.managed&&['owner-mismatch','native-target-mismatch'].includes(error.message))await this.store.transact(s=>{if(s.generators[id]?.slug===g.slug)s.generators[id]=addHold({...s.generators[id],ownerVerified:false},{id:'identity-'+id,kind:'identity-mismatch'});});
      throw error;
    }
    if(g.managed)await this.store.transact(s=>{if(s.generators[id]?.slug===g.slug){const own=s.generators[id];own.ownerVerified=true;if(own.listing==='listed'&&live.listing==='unlisted')s.generators[id]=addHold({...own,listing:'unlisted'},{id:'listing-'+id,kind:'listing-mismatch'});else own.listing=live.listing;}});
    return {...g,listing:live.listing,ownerVerified:true};
  }

  async exclude(ids,value,confirmed) {
    requireThat(confirmed===true&&typeof value==='boolean','confirmation-required');
    return this.store.transact(state=>{
      const results=[];
      for(const id of [...new Set(ids)]){
        nativeId(id);const g=state.generators[id];
        if(!g){results.push({id,applied:false,reason:'not-managed'});continue;}
        g.excluded=value;results.push({id,applied:true});appendEvent(state,{component:'settings',outcome:'applied',nativeId:id});
      }
      return results;
    });
  }
}
