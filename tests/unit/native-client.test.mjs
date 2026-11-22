import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testStore} from '../fixtures/store.mjs';
import {NativeClient} from '../../src/runtime/native-client.js';
import {WorkerRuntime,WorkerPool,workerURL} from '../../src/runtime/workers.js';

test('native client sends a protected command once and returns only accepted job data',async()=>{
  const {store}=testStore();let dispatched=0;
  await store.transact(s=>{s.workers.utility={id:'utility',role:'utility',slug:'target-slug',phase:'idle',documentId:'doc',selected:false};});
  const coordinator={assertOwner:()=>{},claim:async job=>store.prepareAction(job),dispatch:async(id,send)=>{dispatched++;await store.markDispatched(id);await send((await store.read()).jobs[id]);}};
  const pool={send:async command=>store.transact(s=>{s.jobs[command.id].phase='verified';s.jobs[command.id].data={status:'success'};})};
  const client=new NativeClient({store,pool,coordinator});
  assert.deepEqual(await client.listing({id:'123',slug:'target-slug'},'unlisted','unlist'),{status:'success'});
  assert.deepEqual(await client.listing({id:'123',slug:'target-slug'},'unlisted','unlist'),{status:'success'});assert.equal(dispatched,1);
  await store.transact(s=>{s.workers.utility.selected=true;});
  await assert.rejects(client.rename({id:'123',slug:'target-slug'},'another-slug','rename'),/operator-selected/);assert.equal(dispatched,1);
});
test('a recorded unknown command never sends a replacement',async()=>{
  const {store}=testStore();await store.prepareAction({id:'creation-worker',kind:'native-create'});await store.markDispatched('creation-worker');await store.recoverInterrupted();
  const client=new NativeClient({store,coordinator:{assertOwner:()=>{}},pool:{open:()=>assert.fail('must not open a replacement')}});
  await assert.rejects(client.create('creation'),/unconfirmed/);
});
test('worker navigation requires clean hidden original document and a current unexpired intent',async()=>{
  const {store}=testStore();const navigations=[];let clean=false;
  await store.transact(s=>{s.coordinator.term=2;s.workers.worker={id:'worker',phase:'idle',documentId:'doc',slug:'old-slug',navigation:{slug:'next-slug',generatorId:'123',fork:false,term:2,expiresAt:200}};});
  const doc={visibilityState:'visible'},runtime=new WorkerRuntime({store,id:'worker',documentId:'doc',doc,execute:()=>{},now:()=>100,beforeNavigate:async()=>{if(!clean)throw Error('dirty');},navigate:async url=>navigations.push(url)});
  await runtime.observe();assert.equal(navigations.length,0);doc.visibilityState='hidden';
  await assert.rejects(runtime.observe(),/dirty/);assert.equal((await store.read()).workers.worker.phase,'idle');clean=true;
  await runtime.observe();assert.equal(navigations.length,1);assert.match(navigations[0],/next-slug\?pcms_worker=worker#edit$/);assert.equal((await store.read()).workers.worker.phase,'opening');
  const fresh=new WorkerRuntime({store,id:'worker',documentId:'new-doc',doc,execute:()=>{}});await fresh.register();assert.equal((await store.read()).workers.worker.documentId,'new-doc');
});
test('expired or previous-term navigation cannot move a worker',async()=>{
  for(const intent of [{term:1,expiresAt:200},{term:2,expiresAt:99}]){
    const {store}=testStore();await store.transact(s=>{s.coordinator.term=2;s.workers.w={id:'w',documentId:'d',phase:'idle',slug:'old-slug',navigation:{...intent,slug:'new-slug'}};});
    await new WorkerRuntime({store,id:'w',documentId:'d',doc:{visibilityState:'hidden'},execute:()=>{},now:()=>100,navigate:()=>assert.fail('stale navigation')}).observe();assert.equal((await store.read()).workers.w.navigation,undefined);
  }
  assert.match(workerURL({id:'create',fork:true},'minimal'),/#edit:new$/);
});
test('a missing pinned retained worker never opens a replacement editor',async()=>{
 const {store}=testStore();const client=new NativeClient({store,role:'development',workerId:'missing',coordinator:{assertOwner:()=>{}},pool:{open:()=>assert.fail('must keep original tab')}});
 await assert.rejects(client.captureApproved({id:'123',slug:'synthetic-target'},'dev','capture'),/retained-tab-unavailable/);
});
