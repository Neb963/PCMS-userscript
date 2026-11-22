import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkerPool, WorkerRuntime } from '../../src/runtime/workers.js';
import { ProtectedStore } from '../../src/state/store.js';

function fixture() {
  let chain = Promise.resolve(), id = 0;
  const data = new Map(), opens = [];
  const store = new ProtectedStore({ get: async k => data.get(k) ?? null, set: async (k,v) => data.set(k,v), locks: { request: (_k,_o,run) => { const r=chain.then(run);chain=r.catch(()=>{});return r; } } });
  const pool = new WorkerPool({ store, uuid: () => 'worker-' + ++id, openTab: (url, options) => { opens.push({url, options}); return { closed: false }; } });
  return { store, pool, opens };
}
test('dedicated roles enforce one Utility/Refresher and two active Development slots', async () => {
  const f = fixture();
  await f.pool.open('utility', 'synthetic-utility');
  await assert.rejects(f.pool.open('utility', 'other-utility'), /capacity/);
  await f.pool.open('refresher', 'synthetic-refresh');
  await f.pool.open('development', 'synthetic-one');
  const second = await f.pool.open('development', 'synthetic-two');
  await f.pool.lost(second.id);
  await assert.rejects(f.pool.open('development', 'synthetic-three'), /capacity/);
  assert.ok(f.opens.every(o => o.options.active === false));
});
test('operator activation uses only an existing retained tab and never opens a replacement', async () => {
  const f = fixture(), worker = await f.pool.open('development', 'synthetic-editor');
  await assert.rejects(f.pool.activate(worker.id, false), /operator/);
  const result = await f.pool.activate(worker.id, true);
  assert.equal(result.reason, 'switch-to-retained-tab');
  assert.equal(f.opens.length, 1);
  await f.pool.lost(worker.id);
  assert.equal((await f.pool.activate(worker.id, true)).reason, 'retained-tab-lost');
  assert.equal(f.opens.length, 1);
});
test('privileged inbox executes once and protects a newly selected operator tab', async () => {
  const f = fixture(), worker = await f.pool.open('utility', 'synthetic-worker');
  const doc = { visibilityState: 'hidden' };
  let effects = 0;
  const runtime = new WorkerRuntime({ store: f.store, id: worker.id, documentId: 'doc-1', doc, execute: async () => { effects++;return { outcome: 'verified' }; } });
  await runtime.register();
  const command = { id: 'j1', kind: 'read', phase: 'dispatched', term: 1, owner: 'owner-1', workerId: worker.id, documentId: 'doc-1', accepted: false };
  await f.store.transact(s => { s.coordinator={ term:1,owner:'owner-1' };s.jobs.j1=command; });
  await f.pool.send(command);
  doc.visibilityState = 'visible';
  await runtime.pump();
  await runtime.pump();
  assert.equal(effects, 0);
  assert.equal((await f.store.read()).workers[worker.id].outbox.outcome, 'unknown');
  const impostor = new WorkerRuntime({ store:f.store,id:'not-assigned',documentId:'x',doc,execute:()=>{} });
  await assert.rejects(impostor.register(), /unassigned/);
});
test('worker loss preserves unresolved generator hold while another Utility can open', async () => {
  const f = fixture(), worker = await f.pool.open('utility', 'synthetic-lost', '123');
  await f.store.transact(s => { s.generators['123']={holds:[]};s.jobs.j1={id:'j1',kind:'save',phase:'dispatched',workerId:worker.id,generatorId:'123'}; });
  await f.pool.lost(worker.id);
  const s = await f.store.read();
  assert.equal(s.jobs.j1.phase,'unknown');
  assert.equal(s.generators['123'].holds[0].kind,'worker-lost');
  await f.pool.open('utility','synthetic-next','456');
});

test('hidden worker executes canonical inbox once and coordinator accepts its result', async () => {
  const f = fixture(), worker = await f.pool.open('refresher', 'synthetic-roundtrip');
  let effects = 0;
  const runtime = new WorkerRuntime({ store:f.store,id:worker.id,documentId:'doc-r',doc:{visibilityState:'hidden'},execute:async command=>{ assert.equal(command.kind,'read');effects++;return {outcome:'verified'}; } });
  await runtime.register();
  const command={id:'roundtrip',kind:'read',phase:'dispatched',term:1,owner:'owner-1',workerId:worker.id,documentId:'doc-r',accepted:false};
  await f.store.transact(s=>{s.coordinator={term:1,owner:'owner-1'};s.jobs.roundtrip=command;});
  await f.pool.send(command);
  await Promise.all([runtime.pump(),runtime.pump()]);
  assert.equal(effects,1);
  assert.equal((await f.store.read()).workers[worker.id].outbox.outcome,'verified');
  const coordinator={active:true,term:1,assertOwner:()=>{},acceptResult:async(c,outcome)=>f.store.transact(s=>{s.jobs[c.id].phase=outcome;})};
  await f.pool.consume(coordinator);
  assert.equal((await f.store.read()).workers[worker.id].phase,'idle');
  assert.equal((await f.store.read()).jobs.roundtrip.phase,'verified');
});
test('native readiness proof cannot survive a worker document replacement',async()=>{
  const f=fixture(),worker=await f.pool.open('refresher','synthetic-refresh');
  await f.store.transact(s=>{s.workers[worker.id].nativeVerified=true;s.workers[worker.id].nativeProofId='old-proof';});
  const runtime=new WorkerRuntime({store:f.store,id:worker.id,documentId:'new-document',doc:{visibilityState:'hidden'},execute:()=>{}});await runtime.register();await runtime.observe();
  const actual=(await f.store.read()).workers[worker.id];assert.equal(actual.nativeVerified,false);assert.equal(actual.nativeProofId,undefined);assert.equal(actual.documentId,'new-document');assert.equal(actual.pulse,2);
});
test('an explicit retained-tab command does not reclaim an automatic Development slot',async()=>{
  const f=fixture(),retained=await f.pool.open('development','retained-target');await f.store.transact(s=>{Object.assign(s.workers[retained.id],{phase:'retained',slotReleased:true,documentId:'doc',selected:true});});
  await f.pool.send({id:'inspect',workerId:retained.id,documentId:'doc',operatorAction:true});assert.equal((await f.store.read()).workers[retained.id].phase,'busy');
  await f.pool.open('development','active-one');await f.pool.open('development','active-two');await assert.rejects(f.pool.open('development','active-three'),/capacity/);
});
