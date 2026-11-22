import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HOUR,refreshCap,reconcileFIFO,advanceRefreshClock,refreshRates,refreshPlan,beginRefresh,finishRefresh,skipBeforeSend,pruneRefreshAttempts,RefreshScheduler} from '../../src/refresher/scheduler.js';
import {testStore} from '../fixtures/store.mjs';
const at=(id,generatorId,logicalAt,outcome='confirmed')=>({id,generatorId,at:logicalAt,logicalAt,outcome,counted:true});
const input=(more={})=>({fifo:['a','b','c'],eligible:['a','b','c'],attempts:[],cap:3,clock:{logical:0,restartAt:null},...more});
test('n=0 preserves history/counts but has no fabricated per-generator rate or next slot',()=>{
  const plan=refreshPlan(input({fifo:[],eligible:[],attempts:[at('old','a',0)]}));assert.equal(plan.reason,'empty');assert.equal(plan.candidate,null);assert.equal(plan.nextAt,null);assert.equal(plan.stats.used,1);assert.equal(plan.stats.perGeneratorCap,null);assert.equal(plan.stats.estimatedRate,null);assert.equal(plan.stats.estimatedIntervalHours,null);
  for(const value of [0,3601,NaN,1.5,'30'])assert.throws(()=>refreshCap(value),/invalid-refresh-cap/);
});
test('FIFO removes ineligible members and appends newly eligible/returning IDs without reordering survivors',()=>{
  assert.deepEqual(reconcileFIFO(['a','b','c','a'],['b','c','d']),['b','c','d']);assert.deepEqual(reconcileFIFO(['b','c','d'],['a','b','c','d']),['b','c','d','a']);
});
test('selection does not spend an attempt; actual attempt moves only its generator to the tail',()=>{
  const state=input(),plan=refreshPlan(state);assert.equal(plan.candidate,'a');assert.equal(plan.scanned,1);assert.equal(state.attempts.length,0);assert.deepEqual(state.fifo,['a','b','c']);
  const begun=beginRefresh(state,{id:'first',generatorId:'a',wall:0});assert.deepEqual(begun.fifo,['b','c','a']);assert.equal(begun.attempts.length,1);assert.equal(begun.attempt.outcome,'unknown');
  assert.throws(()=>beginRefresh({...state,...begun},{id:'first',generatorId:'b',wall:0}),/slot-unavailable|duplicate/);
});
test('per-generator cap rotates the head and inspects the next member in the same slot',()=>{
  const plan=refreshPlan(input({fifo:['a','b'],eligible:['a','b'],cap:3,clock:{logical:HOUR/2,restartAt:null},attempts:[at('one','a',0),at('two','a',HOUR/6)]}));assert.equal(plan.stats.perGeneratorCap,2);assert.equal(plan.candidate,'b');assert.equal(plan.scanned,2);assert.deepEqual(plan.fifo,['b','a']);
});
test('all capped/account-limited members wait without spending an attempt or spinning',()=>{
  const state=input({attempts:[at('one','a',0),at('two','b',HOUR/3),at('three','c',HOUR*2/3)],clock:{logical:HOUR-1,restartAt:null}}),plan=refreshPlan(state);assert.equal(plan.candidate,null);assert.equal(plan.reason,'account-cap');assert.ok(plan.scanned<=3);assert.equal(plan.nextAt,HOUR);assert.equal(state.attempts.length,3);
  assert.equal(refreshPlan({...state,clock:{logical:HOUR,restartAt:null}}).candidate,'a');
});
test('failed and Unknown attempts count; no immediate retry, no exclusion or workflow mutation',()=>{
  for(const outcome of ['failed','unknown']){const begun=beginRefresh(input(),{id:'attempt',generatorId:'a',wall:0}),attempts=finishRefresh(begun.attempts,'attempt',outcome,50),next=refreshPlan(input({...begun,attempts,clock:{logical:50,restartAt:null}}));assert.equal(next.stats.used,1);assert.equal(next.candidate,null);assert.equal(next.nextAt,50+HOUR/3);assert.deepEqual(next.fifo,['b','c','a']);}
});
test('a proven pre-dispatch skip does not consume limits and preserves FIFO position',()=>{
  const begun=beginRefresh(input(),{id:'not-sent',generatorId:'a',wall:0});assert.throws(()=>skipBeforeSend(begun.attempts,begun.fifo,['a','b','c'],'not-sent',false),/no-send-proof/);
  const skipped=skipBeforeSend(begun.attempts,begun.fifo,['a','b','c'],'not-sent',true),plan=refreshPlan(input(skipped));assert.equal(plan.stats.used,0);assert.equal(plan.candidate,'a');assert.deepEqual(skipped.fifo,['a','b','c']);
});
test('cap/count changes preserve all past attempts and apply new rolling caps and spacing',()=>{
  const history=[at('one','a',0),at('two','b',HOUR/4)];
  const small=refreshPlan(input({attempts:history,cap:1,clock:{logical:HOUR/2,restartAt:null}}));assert.equal(small.reason,'account-cap');assert.equal(small.nextAt,HOUR+HOUR/4);assert.equal(small.stats.used,2);
  const large=refreshPlan(input({attempts:history,cap:12,clock:{logical:HOUR/2,restartAt:null}}));assert.equal(large.candidate,'a');assert.equal(large.stats.perGeneratorCap,4);assert.equal(history.length,2);assert.equal(refreshRates(30,300,[],0).estimatedIntervalHours,10);
});
test('Pause/Resume and missed timer slots never replay a backlog',()=>{
  const begun=beginRefresh(input(),{id:'last',generatorId:'a',wall:0}),paused=refreshPlan(input({...begun,paused:true,clock:{logical:5*HOUR,restartAt:null}}));assert.equal(paused.candidate,null);assert.deepEqual(paused.fifo,['b','c','a']);
  const resumed=input({...begun,clock:{logical:5*HOUR,restartAt:null}}),next=beginRefresh(resumed,{id:'now',generatorId:'b',wall:5*HOUR});assert.equal(next.attempts.length,2);assert.equal(refreshPlan({...resumed,...next}).candidate,null);assert.equal(refreshPlan({...resumed,...next}).nextAt,5*HOUR+HOUR/3);
});
test('wall-clock jumps cannot accelerate or reverse a running logical clock',()=>{
  const initial=advanceRefreshClock(null,{wall:100000,mono:10,bootId:'boot'},30),forward=advanceRefreshClock(initial,{wall:100000+24*HOUR,mono:20,bootId:'boot'},30,true),backward=advanceRefreshClock(forward,{wall:1,mono:30,bootId:'boot'},30,true);
  assert.equal(forward.logical,100010);assert.equal(backward.logical,100020);
});
test('restart/monotonic reset use a fresh spacing fence without clearing attempts',()=>{
  const old={bootId:'old',wall:1000,mono:1000,logical:1000,restartAt:null},restarted=advanceRefreshClock(old,{wall:1000+24*HOUR,mono:0,bootId:'new'},30,true);assert.equal(restarted.logical,1000+HOUR);
  const history=[at('last','a',1000)],plan=refreshPlan(input({attempts:history,cap:30,clock:restarted}));assert.equal(plan.candidate,null);assert.equal(plan.nextAt,restarted.logical+HOUR/30);assert.equal(history.length,1);
  const reset=advanceRefreshClock(old,{wall:5000000,mono:0,bootId:'old'},30,true);assert.equal(reset.logical,1000);assert.equal(reset.restartAt,1000);
});
test('old routine attempts are bounded while rolling-limit and unresolved evidence survive',()=>{
  const rows=[at('old','a',0),at('unknown','b',0,'unknown'),at('recent','c',HOUR*1.5,'failed')];assert.deepEqual(pruneRefreshAttempts(rows,2*HOUR,0).map(a=>a.id),['unknown','recent']);assert.equal(rows.length,3);
});
test('future attempt times are counted conservatively; malformed history fails closed',()=>{
  assert.equal(refreshPlan(input({attempts:[at('future','a',HOUR)]})).nextAt,HOUR+HOUR/3);assert.throws(()=>refreshPlan(input({attempts:[{...at('bad','a',0),counted:false}]})),/uncounted/);assert.throws(()=>refreshPlan(input({clock:{logical:0,restartAt:NaN}})),/time/);
});
async function schedulerFixture(){
  const {store}=testStore();await store.transact(s=>{s.settings.refreshPaused=false;for(const id of ['a','b','c'])s.generators[id]={id,slug:'synthetic-'+id,listing:'listed',status:{account:'alpha',action:'publish_from_github',state:'done'},holds:[],savedVerified:true,ownerVerified:true};});let wall=1000,mono=100;
  const scheduler=new RefreshScheduler({store,bootId:'test-boot',available:()=>true,wall:()=>wall,mono:()=>mono});return {store,scheduler,set:(w,m)=>{wall=w;mono=m;}};
}
test('durable reconciliation avoids per-timer root writes and retains queue/attempts across restart',async()=>{
  const f=await schedulerFixture();await f.scheduler.reconcile();const before=(await f.store.read()).revision;f.set(2000,1100);await f.scheduler.reconcile();assert.equal((await f.store.read()).revision,before);assert.deepEqual((await f.store.read()).fifo,['a','b','c']);
  await f.scheduler.claim('claimed','a');assert.equal((await f.store.read()).attempts.length,1);assert.deepEqual((await f.store.read()).fifo,['b','c','a']);
  const next=new RefreshScheduler({store:f.store,bootId:'restart',available:()=>true,wall:()=>5000,mono:()=>0});await next.reconcile();assert.equal((await f.store.read()).attempts[0].outcome,'unknown');assert.equal((await next.snapshot()).plan.candidate,null);
});
test('storage failure cannot return an attempt dispatch authorization',async()=>{
  const f=await schedulerFixture();await f.scheduler.reconcile();f.store.set=async()=>{throw Error('quota');};await assert.rejects(f.scheduler.claim('no-save','a'),/unconfirmed/);assert.equal((await f.store.read()).attempts.length,0);
});
test('completion anchors later slots conservatively and cannot overwrite a final outcome',async()=>{
  const f=await schedulerFixture();await f.scheduler.reconcile();await f.scheduler.claim('one','a');f.set(5000,4100);await f.scheduler.finish('one','failed');const result=await f.scheduler.snapshot();assert.equal(result.plan.nextAt,5000+HOUR/30);assert.equal(result.plan.stats.used,1);await assert.rejects(f.scheduler.finish('one','confirmed'),/already-final/);assert.equal((await f.store.read()).attempts[0].outcome,'failed');
});
test('a reversed monotonic sample is reseeded once and then advances without a burst',async()=>{
  const f=await schedulerFixture();await f.scheduler.reconcile();await f.scheduler.claim('old','a');f.set(5000,200);await f.scheduler.finish('old','failed');f.set(100000,0);await f.scheduler.reconcile();const clock=(await f.store.read()).refreshClock;assert.equal(clock.mono,0);assert.equal(clock.restartAt,clock.logical);f.set(100100,100);const snapshot=await f.scheduler.snapshot();assert.equal(snapshot.input.clock.logical,clock.logical+100);assert.equal(snapshot.plan.candidate,null);assert.equal((await f.store.read()).attempts.length,1);
});
