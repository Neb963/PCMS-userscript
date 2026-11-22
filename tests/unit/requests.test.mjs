import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testStore} from '../fixtures/store.mjs';
import {RequestRunner} from '../../src/runtime/requests.js';
const request={valid:true,slug:'target-slug',repository:{owner:'synthetic',name:'repo'},commit:'a'.repeat(40),requestCommit:'a'.repeat(40),instructions:[],status:{account:'alpha',action:'publish_from_github',state:'ready'}};
async function fixture(factory){const {store}=testStore();let id=0;await store.transact(s=>{s.requests=[request];});const runner=new RequestRunner({store,coordinator:{active:true,term:1,assertOwner:()=>{}},uuid:()=>String(++id),factory});return {store,runner};}
test('automatic request claims close stale ready and accept only a new explicit transition',async()=>{
  let calls=0;const {store,runner}=await fixture(async()=>({run:async()=>{calls++;return {phase:'done',closed:true};}}));
  await Promise.all([runner.tick(),runner.tick()]);await runner.tick();assert.equal(calls,1);assert.equal(Object.keys((await store.read()).requestQueue).length,1);
  const before=(await store.read()).revision;await runner.tick();assert.equal((await store.read()).revision,before,'stable queue must not generate a GM watch feedback loop');
  await store.transact(s=>{s.requests=[{...request,requestCommit:'b'.repeat(40),readyTransition:true}];});await runner.tick();assert.equal(calls,2);
});
test('unqualified native requests wait without opening workers or mutating remote state',async()=>{
  const {store,runner}=await fixture(async()=>{throw Error('native-capability-not-live-verified');});await runner.tick();const first=await store.read();assert.equal(first.requestQueue['1'].phase,'waiting');assert.equal(first.requestQueue['1'].reason,'live-verification-required');await runner.tick();assert.equal((await store.read()).revision,first.revision);
});
test('changed unfinished request retains local work and holds incoming request without dispatch',async()=>{
  let calls=0;const {store,runner}=await fixture(async()=>({run:async()=>{calls++;return {phase:'reserved',closed:false};}}));await runner.tick();
  await store.transact(s=>{s.requests=[{...request,instructions:[['target-slug/prompt.md','b'.repeat(40)]]}];});await runner.tick();const q=(await store.read()).requestQueue['1'];assert.equal(q.phase,'reserved');assert.equal(q.reason,'request-conflict');assert.equal(calls,1);assert.ok(q.incoming);
});
test('coordinator restart records an uncertain request without automatically re-dispatching it',async()=>{
  let calls=0;const {store,runner}=await fixture(async()=>({run:async()=>{calls++;throw Error('lost');}}));await runner.tick();await runner.tick();assert.equal(calls,1);assert.equal((await store.read()).requestQueue['1'].phase,'unknown');
});
