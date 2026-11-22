import {requireThat,nativeId} from '../shared/domain.js';
import {inventoryRows,refresherReason} from '../state/inventory.js';

export const HOUR=3600000;
export function refreshCap(value){requireThat(Number.isInteger(value)&&value>=1&&value<=3600,'invalid-refresh-cap');return value;}
function time(value){requireThat(Number.isFinite(value)&&value>=0,'invalid-refresh-time');return value;}
export function refreshAttempt(value){
  requireThat(value&&typeof value.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value.id),'invalid-refresh-attempt');nativeId(value.generatorId);time(value.at);time(value.logicalAt);
  requireThat(['confirmed','failed','unknown','skipped'].includes(value.outcome),'invalid-refresh-outcome');
  if(value.outcome==='skipped')requireThat(value.counted===false&&value.notSent===true,'invalid-skip-proof');
  if(value.counted===false)requireThat(value.outcome==='skipped'&&value.notSent===true,'invalid-uncounted-attempt');
  if(value.spacingAt!==undefined)requireThat(time(value.spacingAt)>=value.logicalAt,'invalid-attempt-spacing');
  if(value.finishedLogicalAt!==undefined)requireThat(time(value.finishedLogicalAt)>=value.logicalAt&&(value.spacingAt??value.logicalAt)>=value.finishedLogicalAt,'invalid-attempt-finish');
  return value;
}
function counted(attempts){requireThat(Array.isArray(attempts),'invalid-attempt-history');return attempts.map(refreshAttempt).filter(a=>a.counted!==false);}
function stamp(a){return a.spacingAt??a.logicalAt;}
export function reconcileFIFO(queue,eligible){
  requireThat(Array.isArray(queue)&&Array.isArray(eligible),'invalid-refresh-queue');queue.forEach(nativeId);eligible.forEach(nativeId);
  const wanted=new Set(eligible),seen=new Set(),result=[];
  for(const id of [...queue,...eligible])if(wanted.has(id)&&!seen.has(id)){seen.add(id);result.push(id);}return result;
}
export function advanceRefreshClock(previous,{wall,mono,bootId},cap,hasHistory=false){
  time(wall);time(mono);refreshCap(cap);requireThat(typeof bootId==='string'&&bootId,'invalid-refresh-boot');
  if(!previous)return {bootId,wall,mono,logical:wall,restartAt:hasHistory?wall:null};
  time(previous.logical);time(previous.wall);time(previous.mono);
  if(previous.bootId===bootId&&mono>=previous.mono)return {bootId,wall,mono,logical:previous.logical+mono-previous.mono,restartAt:previous.restartAt??null};
  const elapsed=previous.bootId===bootId?0:Math.max(0,Math.min(HOUR,wall-previous.wall)),logical=previous.logical+elapsed;
  return {bootId,wall,mono,logical,restartAt:hasHistory?logical:null};
}
export function refreshRates(cap,n,attempts,logical){
  refreshCap(cap);time(logical);requireThat(Number.isInteger(n)&&n>=0,'invalid-eligible-count');
  const recent=counted(attempts).filter(a=>stamp(a)>logical-HOUR);
  return {eligibleCount:n,accountCap:cap,used:recent.length,perGeneratorCap:n?Math.ceil(cap/n):null,estimatedRate:n?cap/n:null,estimatedIntervalHours:n?n/cap:null,spacingMs:HOUR/cap};
}
function expiresAt(attempts,limit){const sorted=attempts.map(stamp).sort((a,b)=>a-b);return sorted.length>=limit?sorted[sorted.length-limit]+HOUR:0;}
export function refreshPlan({fifo,eligible,attempts,cap,clock,paused=false,available=true}){
  const queue=reconcileFIFO(fifo,eligible),all=counted(attempts),now=time(clock.logical),stats=refreshRates(cap,queue.length,attempts,now),base={fifo:queue,candidate:null,scanned:0,stats,nextAt:null};
  if(clock.restartAt!==null&&clock.restartAt!==undefined)time(clock.restartAt);
  if(!queue.length)return {...base,reason:'empty'};
  if(paused||!available)return {...base,reason:paused?'paused':'unavailable'};
  const recent=all.filter(a=>stamp(a)>now-HOUR),last=all.reduce((last,a)=>Math.max(last,stamp(a)),-Infinity),fence=clock.restartAt===null||clock.restartAt===undefined?0:clock.restartAt+stats.spacingMs;
  const nextSlot=Math.max(fence,Number.isFinite(last)?last+stats.spacingMs:0,expiresAt(recent,cap));
  if(nextSlot>now)return {...base,reason:recent.length>=cap?'account-cap':'spacing',nextAt:nextSlot};
  let earliest=Infinity;
  for(let pass=0;pass<queue.length;pass++){
    const id=queue[0],used=recent.filter(a=>a.generatorId===id),expires=expiresAt(used,stats.perGeneratorCap);
    if(used.length<stats.perGeneratorCap)return {...base,fifo:queue,candidate:id,scanned:pass+1,reason:'ready',nextAt:now};
    earliest=Math.min(earliest,expires);queue.push(queue.shift());
  }
  return {...base,fifo:queue,reason:'generator-cap',scanned:queue.length,nextAt:Math.max(nextSlot,earliest)};
}
export function beginRefresh(input,{id,generatorId,wall}){
  const plan=refreshPlan(input);requireThat(plan.candidate===generatorId,'refresh-slot-unavailable');
  requireThat(!input.attempts.some(a=>a.id===id),'duplicate-refresh-attempt');
  const attempt=refreshAttempt({id,generatorId,at:time(wall),logicalAt:input.clock.logical,spacingAt:input.clock.logical,outcome:'unknown',counted:true});
  return {fifo:[...plan.fifo.slice(1),generatorId],attempts:[...input.attempts,attempt],attempt};
}
export function finishRefresh(attempts,id,outcome,logical){
  requireThat(['confirmed','failed','unknown'].includes(outcome),'invalid-refresh-outcome');time(logical);
  const next=structuredClone(attempts),attempt=next.find(a=>a.id===id);requireThat(attempt&&attempt.counted!==false,'refresh-attempt-unavailable');
  requireThat(attempt.outcome==='unknown'||attempt.outcome===outcome,'refresh-outcome-already-final');
  attempt.outcome=outcome;
  if(attempt.finishedLogicalAt===undefined){attempt.finishedLogicalAt=Math.max(logical,attempt.logicalAt);attempt.spacingAt=attempt.finishedLogicalAt;}
  return next;
}
export function skipBeforeSend(attempts,fifo,eligible,id,confirmedNoSend){
  requireThat(confirmedNoSend===true,'no-send-proof-required');const next=structuredClone(attempts),attempt=next.find(a=>a.id===id);
  requireThat(attempt?.outcome==='unknown'&&attempt.finishedLogicalAt===undefined,'attempt-not-cancellable');
  attempt.outcome='skipped';attempt.counted=false;attempt.notSent=true;
  const queue=reconcileFIFO(fifo,eligible),rest=queue.filter(value=>value!==attempt.generatorId);
  return {attempts:next,fifo:eligible.includes(attempt.generatorId)?[attempt.generatorId,...rest]:rest};
}
export function pruneRefreshAttempts(attempts,logical,historyLimit=200){
  counted(attempts);time(logical);requireThat(Number.isInteger(historyLimit)&&historyLimit>=0,'invalid-attempt-history-limit');
  const recent=new Set((historyLimit?attempts.filter(a=>a.outcome!=='unknown').slice(-historyLimit):[]).map(a=>a.id));
  return attempts.filter(a=>a.outcome==='unknown'||a.counted!==false&&stamp(a)>logical-HOUR||recent.has(a.id));
}

export class RefreshScheduler {
  constructor({store,bootId,guard=async()=>{},assertCurrent=()=>{},available=()=>false,wall=()=>Date.now(),mono=()=>performance.now()}){Object.assign(this,{store,bootId,guard,assertCurrent,available,wall,mono});this.busy=false;}
  project(state){
    const eligible=inventoryRows(state).filter(g=>refresherReason(g)===null).map(g=>g.id),cap=refreshCap(state.settings.refreshCap),clock=advanceRefreshClock(state.refreshClock,{wall:this.wall(),mono:this.mono(),bootId:this.bootId},cap,counted(state.attempts).length>0);
    return {fifo:state.fifo,eligible,attempts:state.attempts,cap,clock,paused:state.settings.refreshPaused,available:this.available(state)};
  }
  async snapshot(){await this.guard();const state=await this.store.read(),input=this.project(state);return {input,plan:refreshPlan(input)};}
  async reconcile(){
    if(this.busy)return;this.busy=true;
    try{await this.guard();const state=await this.store.read(),input=this.project(state),queue=reconcileFIFO(state.fifo,input.eligible);
      if(state.refreshClock?.bootId===this.bootId&&input.clock.mono>=state.refreshClock.mono&&JSON.stringify(queue)===JSON.stringify(state.fifo))return;
      await this.store.transact(s=>{this.assertCurrent(s);const reseed=s.refreshClock?.bootId!==this.bootId,current=this.project(s);s.fifo=reconcileFIFO(s.fifo,current.eligible);s.refreshClock=current.clock;
        if(reseed)for(const a of s.attempts)if(a.outcome==='unknown'&&a.finishedLogicalAt===undefined){a.finishedLogicalAt=Math.max(a.logicalAt,current.clock.logical);a.spacingAt=a.finishedLogicalAt;}
      });
    }finally{this.busy=false;}
  }
  async claim(id,generatorId){
    await this.guard();const result=await this.store.transact(s=>{this.assertCurrent(s);const input=this.project(s),next=beginRefresh(input,{id,generatorId,wall:this.wall()});s.fifo=next.fifo;s.attempts=pruneRefreshAttempts(next.attempts,input.clock.logical);s.refreshClock=input.clock;return next.attempt;});
    const actual=(await this.store.read()).attempts.find(a=>a.id===id);requireThat(actual&&JSON.stringify(actual)===JSON.stringify(result.result),'refresh-attempt-readback-mismatch');return actual;
  }
  async finish(id,outcome){await this.guard();return this.store.transact(s=>{this.assertCurrent(s);const input=this.project(s);s.attempts=pruneRefreshAttempts(finishRefresh(s.attempts,id,outcome,input.clock.logical),input.clock.logical);s.refreshClock=input.clock;});}
  async skip(id,confirmedNoSend){await this.guard();return this.store.transact(s=>{this.assertCurrent(s);const input=this.project(s),next=skipBeforeSend(s.attempts,s.fifo,input.eligible,id,confirmedNoSend);s.attempts=next.attempts;s.fifo=next.fifo;s.refreshClock=input.clock;});}
}
