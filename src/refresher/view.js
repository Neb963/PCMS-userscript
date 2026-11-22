import {inventoryRows,refresherReason} from '../state/inventory.js';
import {refreshRates,refreshPlan,reconcileFIFO,refreshCap,HOUR} from './scheduler.js';
import {requireThat} from '../shared/domain.js';
import {appendEvent} from '../state/journal.js';

export function refresherView(state,{coordinator='Unverified'}={}){
  const rows=inventoryRows(state),byId=new Map(rows.map(g=>[g.id,g])),eligible=rows.filter(g=>refresherReason(g)===null).map(g=>g.id),fifo=reconcileFIFO(state.fifo,eligible),packet=state.refreshView;
  try{
    const current=packet?.owner===state.coordinator.owner&&packet?.term===state.coordinator.term,clock={logical:current?packet.logicalAt:state.refreshClock?.logical??0,restartAt:current?packet.restartAt:state.refreshClock?.restartAt??null},cap=refreshCap(state.settings.refreshCap),rates=refreshRates(cap,fifo.length,state.attempts,clock.logical);
    const worker=current&&state.workers[packet.workerId],workerKnown=coordinator==='Verified'&&current&&packet.workerKnown===true&&worker?.documentId===packet.documentId&&worker.nativeVerified===true&&!['retained','released','lost','opening'].includes(worker.phase),plan=refreshPlan({fifo,eligible,attempts:state.attempts,cap,clock,paused:state.settings.refreshPaused,available:workerKnown&&worker.phase==='idle'&&!worker.selected&&state.settings.account.confirmed});
    const preview=plan.nextAt===null?null:refreshPlan({fifo,eligible,attempts:state.attempts,cap,clock:{...clock,logical:plan.nextAt}}),nextId=plan.candidate||preview?.candidate||null;
    const latest=[...state.attempts].reverse(),usage=new Map(),lastById=new Map(),eligibleSet=new Set(eligible);for(const a of latest){if(!lastById.has(a.generatorId))lastById.set(a.generatorId,a.at);if(a.counted!==false&&(a.spacingAt??a.logicalAt)>clock.logical-HOUR)usage.set(a.generatorId,(usage.get(a.generatorId)||0)+1);}
    const label=a=>a.outcome==='confirmed'?'Saved':a.outcome==='failed'?'Failed':a.outcome==='skipped'?'Skipped':!a.recorded&&['prepared','dispatched'].includes(state.jobs[a.id+'-save']?.phase)?'In progress':'Unknown';
    return {available:true,paused:state.settings.refreshPaused,cap,rates,workerKnown,workerState:!workerKnown?'Unknown':!state.settings.account.confirmed?'Session required':worker.selected?'Operator selected':state.settings.refreshPaused?'Paused':worker.phase==='busy'?'Active':'Waiting',snapshotOnly:!workerKnown,nextId,nextSlug:byId.get(nextId)?.slug||null,nextAt:plan.nextAt===null?null:packet?.observedAt===undefined?null:packet.observedAt+Math.max(0,plan.nextAt-clock.logical),reason:plan.reason,
      queue:fifo.map((id,index)=>{const g=byId.get(id),used=usage.get(id)||0;return {id,slug:g.slug,position:index+1,used,perGeneratorCap:rates.perGeneratorCap,lastAt:lastById.get(id)??null,next:nextId===id,atCap:used>=rates.perGeneratorCap};}),
      notEligible:rows.filter(g=>!eligibleSet.has(g.id)).map(g=>({id:g.id,slug:g.slug,reason:refresherReason(g)||'Unverified'})),
      attempts:latest.map(a=>({id:a.id,generatorId:a.generatorId,slug:byId.get(a.generatorId)?.slug||null,at:a.at,outcome:label(a),counted:a.counted!==false,reason:['native-rejected','source-drift','listing-unconfirmed','dirty-or-stale-editor','refresh-preflight-unconfirmed','refresh-readback-unconfirmed','refresh-receipt-unconfirmed'].includes(a.reason)?a.reason:null})),lastResult:latest[0]?label(latest[0]):'—'};
  }catch{return {available:false,paused:state.settings.refreshPaused,cap:state.settings.refreshCap,workerKnown:false,workerState:'Unknown',snapshotOnly:true,queue:[],notEligible:[],attempts:[],lastResult:'—',reason:'history-unavailable'};}
}
export class RefresherSettings {
  constructor(store){this.store=store;}
  async cap(value){refreshCap(value);return this.store.transact(s=>{s.settings.refreshCap=value;appendEvent(s,{component:'settings',outcome:'applied'});});}
  async paused(value){requireThat(typeof value==='boolean','invalid-refresh-pause');return this.store.transact(s=>{s.settings.refreshPaused=value;appendEvent(s,{component:'settings',outcome:'applied'});});}
}
