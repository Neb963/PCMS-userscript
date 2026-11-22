import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoherentStore } from '../../src/state/coherent-store.js';
import { emptyState, STORE_KEY } from '../../src/state/store.js';

function locksFixture() {
  const tails=new Map(),held=new Map();let serial=0;
  return {query:async()=>({held:[...held.values()]}),request:(name,options,run)=>{
    const previous=tails.get(name)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{if(options.signal?.aborted)throw Error('aborted');const id=++serial;held.set(id,{name});try{return await run();}finally{held.delete(id);}});
    tails.set(name,next.catch(()=>{}));return next;
  }};
}
function fixture(initial=emptyState()) {
  const backend=new Map([[STORE_KEY,JSON.stringify(initial)]]),contexts=[],locks=locksFixture();let sequence=0;
  const create=(stale=false)=>{
    const cache=stale?new Map([[STORE_KEY,JSON.stringify(emptyState())]]):new Map(backend),listeners=new Map();
    const context={cache,listeners};contexts.push(context);
    const api={locks,uuid:()=> 'nonce-'+ ++sequence,get:async(k,f)=>cache.get(k)??f,set:async(k,v)=>{
      cache.set(k,structuredClone(v));backend.set(k,structuredClone(v));
      for(const peer of contexts){if(peer===context)continue;setTimeout(()=>{const old=peer.cache.get(k);peer.cache.set(k,structuredClone(v));for(const listener of [...peer.listeners.values()])if(listener.key===k)listener.callback(k,old,structuredClone(v),true);},5);}
    },addListener:(key,callback)=>{const id=++sequence;listeners.set(id,{key,callback});return id;},removeListener:id=>listeners.delete(id),probe:async()=>backend.get(STORE_KEY)??null};
    return {api,store:new CoherentStore(api),cache};
  };
  return {backend,create};
}
test('stale per-tab caches cannot overwrite a newer source snapshot or independent changes',async()=>{
  const initial=emptyState();initial.revision=7;initial.writeId='latest';initial.pending.important={id:'important',generatorId:'123',slug:'synthetic-generator',repository:{owner:'synthetic',name:'repo'},baseCommit:'a'.repeat(40),kind:'source',status:{account:'alpha',action:'develop',state:'done'},source:{pjs:'approved',html:'approved',files:{'a.bin':[0,255]}}};
  const f=fixture(initial),authority=f.create(),stale=f.create(true);
  await authority.store.acquireAuthority();
  await Promise.all([stale.store.transact(s=>{s.fifo.push('123');}),authority.store.transact(s=>{s.settings.refreshCap=60;})]);
  const stored=JSON.parse(f.backend.get(STORE_KEY));assert.equal(stored.revision,9);assert.equal(stored.pending.important.source.pjs,'approved');assert.deepEqual(stored.fifo,['123']);assert.equal(stored.settings.refreshCap,60);
  assert.equal((await stale.store.read()).pending.important.source.files['a.bin'][1],255);
  await authority.store.releaseAuthority();
});
test('fresh authority startup reads manager state instead of its stale document cache',async()=>{
  const state=emptyState();state.settings.refreshCap=99;state.revision=5;state.writeId='latest';const f=fixture(state),candidate=f.create(true);
  assert.equal((await candidate.store.read()).settings.refreshCap,30);
  await candidate.store.acquireAuthority();assert.equal((await candidate.store.read()).settings.refreshCap,99);
  await candidate.store.transact(s=>{s.settings.theme='dark';});assert.equal(JSON.parse(f.backend.get(STORE_KEY)).settings.refreshCap,99);
  await candidate.store.releaseAuthority();
});
test('failed root persistence poisons authority and cannot authorize later actions',async()=>{
  const f=fixture(),candidate=f.create();candidate.store.set=async()=>{throw Error('quota');};await candidate.store.acquireAuthority();
  await assert.rejects(candidate.store.transact(s=>{s.fifo.push('123');}),/unconfirmed/);await assert.rejects(candidate.store.read(),/unavailable/);assert.equal(candidate.store.available,false);
  await candidate.store.releaseAuthority();
});
