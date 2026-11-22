import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testStore} from '../fixtures/store.mjs';
import {RefreshScheduler,HOUR} from '../../src/refresher/scheduler.js';
import {RefresherController} from '../../src/refresher/controller.js';

async function fixture(kind='confirmed'){
  const {store}=testStore();await store.transact(s=>{s.settings.account={accountId:'alpha',locked:true,confirmed:true};s.settings.refreshPaused=false;for(const id of ['a','b','c'])s.generators[id]={id,slug:'synthetic-'+id,listing:'listed',status:{account:'alpha',action:'publish_from_github',state:'done'},holds:[],ownerVerified:true,savedVerified:true};s.workers.worker={id:'worker',role:'refresher',phase:'idle',documentId:'doc',selected:false};});let logical=0,number=0,active=0,maxActive=0;
  const scheduler=new RefreshScheduler({store,bootId:'boot',available:()=>true,wall:()=>logical,mono:()=>logical});const calls=[];
  const native={workerId:'worker',prepareRefresh:async target=>{calls.push('prepare-'+target.id);return {kind:'prepared'};},saveRefresh:async(target,id)=>{active++;maxActive=Math.max(maxActive,active);calls.push('save-'+target.id);await store.prepareAction({id:id+'-save',kind:'refresh-save',generatorId:target.id,accepted:true});await store.transact(s=>{s.jobs[id+'-save'].phase='verified';s.jobs[id+'-save'].data={kind,reusable:kind==='confirmed'||kind==='failed',notSent:kind==='skipped'};});active--;return {kind,reusable:kind==='confirmed'||kind==='failed',notSent:kind==='skipped'};}};
  const controller=new RefresherController({store,scheduler,nativeFactory:async()=>native,locks:{request:(_k,_o,run)=>run({})},writeAllowed:()=>{},uuid:()=>String(++number)});
  return {store,scheduler,controller,native,calls,set:value=>{logical=value;},maxActive:()=>maxActive};
}
test('dedicated refresh records one confirmed attempt/event and advances FIFO without overlap',async()=>{
  const f=await fixture();await Promise.all([f.controller.tick(),f.controller.tick()]);const s=await f.store.read();assert.deepEqual(f.calls,['prepare-a','save-a']);assert.equal(s.attempts.length,1);assert.equal(s.attempts[0].outcome,'confirmed');assert.deepEqual(s.fifo,['b','c','a']);assert.equal(s.journal.filter(e=>e.component==='refresher'&&e.outcome==='confirmed').length,1);assert.equal(f.maxActive(),1);
});
test('ordinary failures count and permit the next generator at its next slot without blocking workflow',async()=>{
  const f=await fixture('failed');await f.controller.tick();await f.controller.tick();assert.deepEqual(f.calls,['prepare-a','save-a']);f.set(HOUR/30);await f.controller.tick();const s=await f.store.read();assert.deepEqual(f.calls,['prepare-a','save-a','prepare-b','save-b']);assert.equal(s.attempts.length,2);assert.equal(s.generators.a.holds.length,0);assert.equal(s.generators.a.status.state,'done');assert.equal(s.journal.filter(e=>e.outcome==='confirmed').length,0);
});
test('Unknown counts and holds only the affected generator; it is never automatically repeated',async()=>{
  const f=await fixture('unknown');await f.controller.tick();const s=await f.store.read();assert.equal(s.attempts[0].outcome,'unknown');assert.equal(s.generators.a.holds[0].kind,'native-unknown');assert.equal(s.generators.b.holds.length,0);assert.equal(s.workers.worker.phase,'retained');f.set(HOUR/30);await f.controller.tick();assert.deepEqual(f.calls,['prepare-a','save-a','prepare-b','save-b']);
});
test('preparation failure and proven pre-send skip do not spend an attempt or fabricate confirmation',async()=>{
  const f=await fixture();f.native.prepareRefresh=async()=>({kind:'skipped',notSent:true,hold:'source-drift',reason:'source-drift'});await f.controller.tick();assert.equal((await f.store.read()).attempts.length,0);assert.equal((await f.store.read()).generators.a.holds[0].kind,'source-drift');
  const g=await fixture('skipped');await g.controller.tick();assert.equal((await g.store.read()).attempts[0].counted,false);assert.equal((await g.scheduler.snapshot()).plan.stats.used,0);assert.equal((await g.store.read()).journal.filter(e=>e.outcome==='confirmed').length,0);
});
test('unverified production Save capability prevents worker creation and dispatch',async()=>{
  const f=await fixture();f.controller.writeAllowed=()=>{throw Error('native-capability-not-live-verified');};await assert.rejects(f.controller.tick(),/not-live-verified/);assert.deepEqual(f.calls,[]);assert.equal((await f.store.read()).attempts.length,0);
});
test('restart consumes a persisted result once and does not issue another native Save',async()=>{
  const f=await fixture();await f.scheduler.reconcile();await f.scheduler.claim('refresh-recovered','a');await f.store.transact(s=>{s.jobs['refresh-recovered-save']={id:'refresh-recovered-save',kind:'refresh-save',phase:'verified',data:{kind:'confirmed',reusable:true}};});await f.controller.recoverResults();await f.controller.recoverResults();const s=await f.store.read();assert.equal(s.attempts[0].outcome,'confirmed');assert.equal(s.journal.filter(e=>e.outcome==='confirmed').length,1);assert.deepEqual(f.calls,[]);
});
test('a crash after attempt persistence but before Save command preparation has a safe no-send disposition',async()=>{
  const f=await fixture();await f.scheduler.reconcile();await f.scheduler.claim('refresh-no-send','a');await f.store.transact(s=>{s.refreshDrafts={'refresh-no-send':{id:'refresh-no-send',phase:'staged',workerId:'worker'}};});await f.controller.recoverResults();assert.equal((await f.store.read()).attempts[0].counted,false);assert.equal((await f.store.read()).workers.worker.phase,'retained');assert.equal((await f.store.read()).generators.a.holds[0].kind,'edit');assert.deepEqual(f.calls,[]);
});
test('a dirty retained editor cannot be reused as another generator worker',async()=>{
  const f=await fixture();f.native.prepareRefresh=async()=>({kind:'skipped',notSent:true,reason:'dirty-or-stale-editor',hold:'edit',retain:true});await f.controller.tick();const s=await f.store.read();assert.equal(s.workers.worker.phase,'retained');assert.equal(s.generators.a.retainedTab,'worker');assert.equal(s.generators.b.holds.length,0);assert.equal(s.attempts.length,0);
});
test('known native result survives a one-time atomic outcome storage failure without another Save',async()=>{
  const f=await fixture(),set=f.store.set;let failed=false;f.store.set=async(k,v)=>{if(!failed&&v.includes('"recorded":true')){failed=true;throw Error('quota');}return set(k,v);};await f.controller.tick();const s=await f.store.read();assert.equal(f.calls.filter(c=>c.startsWith('save-')).length,1);assert.equal(s.attempts[0].outcome,'confirmed');assert.equal(s.generators.a.holds.length,0);assert.equal(s.journal.filter(e=>e.outcome==='confirmed').length,1);assert.equal(s.workers.worker.phase,'idle');
});
