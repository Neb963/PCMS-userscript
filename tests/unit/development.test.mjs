import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testStore} from '../fixtures/store.mjs';
import {Development} from '../../src/development/controller.js';
export async function fixture(){
  const {store}=testStore(),request={valid:true,slug:'synthetic-target',repository:{owner:'synthetic',name:'repo'},commit:'a'.repeat(40),requestCommit:'a'.repeat(40),status:{account:'alpha',action:'develop',state:'ready'},instructions:[]},reserved={id:'dev',phase:'reserved',generatorId:'123',created:true,originalListing:'listed',steps:['identity checked'],statusCommit:'b'.repeat(40)};
  let prompt='Synthetic prompt',calls=0;
  const snapshot={entries:{'synthetic-target/prompt.md':{path:'synthetic-target/prompt.md',sha:'c'.repeat(40),mode:'100644',type:'blob'}}};
  const github={snapshot:async()=>structuredClone(snapshot),text:async(_s,p)=>p.endsWith('status.md')?'account: alpha\naction: develop\nstate: reserved\n':prompt,api:async()=>[{sha:reserved.statusCommit}],bytes:async()=>[65]};
  await store.transact(s=>{s.settings.account={accountId:'alpha',confirmed:true,locked:true};s.generators['123']={id:'123',slug:request.slug,listing:'unlisted',status:request.status,holds:[{id:'dev',kind:'publication'}]};s.requestQueue={dev:{id:'dev',request,phase:'development'}};});
  const development=new Development({store,services:async()=>({github}),allowed:()=>{},nativeFactory:async()=>({workerId:'worker',startDevelopment:async()=>{calls++;await store.transact(s=>{s.development.dev.admitted=true;});return {kind:'admitted'};}})});
  return {store,request,reserved,github,snapshot,development,calls:()=>calls,prompt:value=>{prompt=value;}};
}
test('verified reservation queues pinned prompt and optional scratch without publishing source',async()=>{
  const f=await fixture();f.snapshot.entries['synthetic-target/scratch/AGENTS.md']={path:'synthetic-target/scratch/AGENTS.md',sha:'d'.repeat(40),mode:'100644',type:'blob'};
  const r=await f.development.enqueue(f.request,'dev',f.reserved);assert.equal(r.originalListing,'unlisted');assert.deepEqual(r.scratch,{'AGENTS.md':[65]});assert.equal((await f.store.read()).generators['123'].holds[0].kind,'development');
  await Promise.all([f.development.tick(),f.development.tick()]);await f.development.tick();assert.equal(f.calls(),1);assert.equal((await f.store.read()).development.dev.phase,'running');
});
test('unknown admission survives restart without a second native submission',async()=>{
  const f=await fixture();await f.development.enqueue(f.request,'dev',f.reserved);f.development.nativeFactory=async()=>({workerId:'worker',startDevelopment:async()=>{throw Error('lost');}});await f.development.tick();let s=await f.store.read();assert.equal(s.development.dev.phase,'unknown');assert.equal(s.generators['123'].holds[0].kind,'helper-unknown');
  const next=new Development({store:f.store,services:()=>{},allowed:()=>{},nativeFactory:()=>assert.fail('unknown must not replay')});await next.tick();s=await f.store.read();assert.equal(s.development.dev.workerId,'worker');
});
test('two occupied or lost Development slots preserve a queued request; static gate opens no worker',async()=>{
  const f=await fixture();await f.development.enqueue(f.request,'dev',f.reserved);await f.store.transact(s=>{s.workers.a={role:'development',phase:'idle'};s.workers.b={role:'development',phase:'lost'};});await f.development.tick();assert.equal(f.calls(),0);assert.equal((await f.store.read()).development.dev.phase,'queued');
  f.development.allowed=()=>{throw Error('not-qualified');};await assert.rejects(f.development.tick(),/not-qualified/);assert.equal(f.calls(),0);
});
test('empty prompt, changed request and independent hold cannot enter development',async()=>{
  for(const change of [async f=>f.prompt('  '),async f=>f.store.transact(s=>{s.requestQueue.dev.incoming={};}),async f=>f.store.transact(s=>{s.generators['123'].holds.push({id:'edit',kind:'edit'});})]){const f=await fixture();await change(f);await assert.rejects(f.development.enqueue(f.request,'dev',f.reserved));assert.equal((await f.store.read()).development,undefined);assert.equal(f.calls(),0);}
});
