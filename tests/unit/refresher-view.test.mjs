import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../../src/state/store.js';
import {refresherView,RefresherSettings} from '../../src/refresher/view.js';
import {PulseMonitor} from '../../src/runtime/health.js';
import {testStore} from '../fixtures/store.mjs';
function state(){const s=emptyState();s.settings.account={accountId:'alpha',locked:true,confirmed:true};s.settings.refreshPaused=false;s.coordinator={term:1,owner:'owner'};s.refreshClock={logical:1000,restartAt:null};for(let i=0;i<35;i++){const id=String(i+1);s.generators[id]={id,slug:'synthetic-'+id,listing:'listed',status:{account:'alpha',action:'publish_from_github',state:'done'},holds:[],savedVerified:true,ownerVerified:true};}s.fifo=Object.keys(s.generators).reverse();return s;}
test('Refresher projection keeps the whole FIFO and distinguishes a cached queue from a verified worker',()=>{
  const s=state(),view=refresherView(s,{coordinator:'Verified'});assert.equal(view.queue.length,35);assert.deepEqual(view.queue.map(g=>g.id),s.fifo);assert.equal(view.workerState,'Unknown');assert.equal(view.snapshotOnly,true);assert.equal(view.nextAt,null);assert.equal(view.rates.estimatedIntervalHours,35/30);
});
test('current worker proof and Coordinator-owned logical time drive actual next-slot display',()=>{
  const s=state();s.workers.worker={id:'worker',role:'refresher',phase:'idle',documentId:'doc',nativeVerified:true};s.refreshView={owner:'owner',term:1,workerKnown:true,workerId:'worker',documentId:'doc',logicalAt:1000,restartAt:null,observedAt:5000};
  assert.equal(refresherView(s,{coordinator:'Verified'}).workerKnown,true);assert.equal(refresherView(s,{coordinator:'Verified'}).nextAt,5000);s.workers.worker.documentId='new-document';assert.equal(refresherView(s,{coordinator:'Verified'}).workerState,'Unknown');s.workers.worker.documentId='doc';s.workers.worker.selected=true;assert.equal(refresherView(s,{coordinator:'Verified'}).nextAt,null);
});
test('failed and Unknown attempts count; skipped attempts and unverified results cannot become Saved',()=>{
  const s=state();s.attempts=[{id:'failed',generatorId:'1',at:100,logicalAt:100,counted:true,outcome:'failed'},{id:'uncertain',generatorId:'2',at:200,logicalAt:200,counted:true,outcome:'unknown',recorded:true},{id:'skip',generatorId:'3',at:300,logicalAt:300,counted:false,notSent:true,outcome:'skipped'}];const v=refresherView(s);assert.equal(v.rates.used,2);assert.deepEqual(v.attempts.map(a=>a.outcome),['Skipped','Unknown','Failed']);assert.equal(v.lastResult,'Skipped');assert.equal(v.attempts.some(a=>a.outcome==='Saved'),false);
});
test('Not eligible shows every reason and n=0 has no fabricated derived rates',()=>{
  const s=state();for(const g of Object.values(s.generators))g.listing='unlisted';const v=refresherView(s);assert.equal(v.queue.length,0);assert.equal(v.notEligible.length,35);assert.equal(v.notEligible[0].reason,'Unlisted');assert.equal(v.rates.perGeneratorCap,null);assert.equal(v.rates.estimatedRate,null);assert.equal(v.rates.estimatedIntervalHours,null);
});
test('local cap and Pause/Resume preferences preserve FIFO and history; invalid input preserves applied cap',async()=>{
  const {store}=testStore(),seed=state();await store.transact(s=>Object.assign(s,seed));const controller=new RefresherSettings(store);await assert.rejects(controller.cap(0),/invalid/);assert.equal((await store.read()).settings.refreshCap,30);const history=(await store.read()).attempts,queue=(await store.read()).fifo;await controller.cap(60);await controller.paused(true);await controller.paused(false);const s=await store.read();assert.deepEqual(s.fifo,queue);assert.deepEqual(s.attempts,history);assert.equal(s.settings.refreshCap,60);assert.equal(s.settings.refreshPaused,false);
});
test('protected pulse liveness is monotonic and does not trust an initial cached pulse',()=>{
  let mono=0;const monitor=new PulseMonitor({now:()=>mono});assert.equal(monitor.observe('coordinator','cached'),false);mono=100;assert.equal(monitor.observe('coordinator','fresh'),true);mono=15001;assert.equal(monitor.observe('coordinator','fresh'),true);mono=15101;assert.equal(monitor.observe('coordinator','fresh'),false);mono=10;assert.equal(monitor.observe('coordinator','fresh'),false);mono=20;assert.equal(monitor.observe('coordinator','next'),true);
});
test('next slot respects retained failed attempts and a changed cap without reordering FIFO',()=>{
  const s=state();s.workers.worker={id:'worker',role:'refresher',phase:'idle',documentId:'doc',nativeVerified:true};s.refreshView={owner:'owner',term:1,workerKnown:true,workerId:'worker',documentId:'doc',logicalAt:1000,restartAt:null,observedAt:5000};
  s.attempts=[{id:'failed',generatorId:'35',at:0,logicalAt:0,counted:true,outcome:'failed'}];s.settings.refreshCap=30;
  let v=refresherView(s,{coordinator:'Verified'});assert.equal(v.nextAt,124000);assert.equal(v.nextId,'34');assert.equal(v.nextSlug,'synthetic-34');assert.deepEqual(v.queue.map(g=>g.id),s.fifo);assert.equal(v.rates.used,1);
  s.settings.refreshCap=60;v=refresherView(s,{coordinator:'Verified'});assert.equal(v.nextAt,64000);assert.equal(v.rates.used,1);assert.equal(v.nextId,'35');assert.equal(s.attempts.length,1);
  s.settings.account.confirmed=false;v=refresherView(s,{coordinator:'Verified'});assert.equal(v.workerState,'Session required');assert.equal(v.nextAt,null);
  s.settings.account.confirmed=true;s.settings.refreshPaused=true;v=refresherView(s,{coordinator:'Verified'});assert.equal(v.workerState,'Paused');assert.equal(v.nextAt,null);
});
test('invalid history and stale Coordinator packets cannot invent current worker progress',()=>{
  const s=state();s.refreshView={owner:'old-owner',term:1,workerKnown:true,logicalAt:100000000};
  const v=refresherView(s,{coordinator:'Verified'});assert.equal(v.workerState,'Unknown');assert.equal(v.nextAt,null);
  s.attempts=[{id:'invalid'}];const broken=refresherView(s);assert.equal(broken.available,false);assert.equal(broken.reason,'history-unavailable');assert.equal(broken.nextAt,undefined);
});
