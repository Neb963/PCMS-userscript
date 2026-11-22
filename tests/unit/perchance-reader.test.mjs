import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerchanceReader, reconcileInventory } from '../../src/adapters/perchance/reader.js';

const generator={id:123,name:'synthetic-generator',isPrivate:false,modelText:'output\n  example',outputTemplate:'<p>example</p>',srcManifest:{'assets/test.bin':{key:'synthetic-key',size:3}},saveCount:4};
function reader(overrides={}) { return new PerchanceReader({request:async(url,options)=>{
  if(options.type==='bytes')return new Uint8Array([0,127,255]);
  return {status:'success',generator:structuredClone(generator)};
},...overrides}); }
test('complete saved source reads exact bytes and accepts an explicitly empty src tree',async()=>{
  const r=reader();const result=await r.saved('synthetic-generator','123');
  assert.deepEqual(result.source.files['assets/test.bin'],[0,127,255]);
  const empty=reader({request:async()=>({status:'success',generator:{...generator,srcManifest:{}}})});
  assert.deepEqual(Object.keys((await empty.saved('synthetic-generator')).source.files),[]);
});
test('missing fields/files, corrupted lengths, wrong IDs and concurrent save fail closed',async()=>{
  await assert.rejects(reader().saved('synthetic-generator','456'),/target-mismatch/);
  for(const missing of ['modelText','outputTemplate','srcManifest']) {
    const g={...generator};delete g[missing];
    await assert.rejects(reader({request:async()=>({status:'success',generator:g})}).saved('synthetic-generator'),/unavailable/);
  }
  await assert.rejects(reader({request:async(_u,o)=>o.type==='bytes'?new Uint8Array([1]):{status:'success',generator}}).saved('synthetic-generator'),/size-mismatch/);
  let count=0;
  await assert.rejects(reader({request:async(_u,o)=>o.type==='bytes'?new Uint8Array([0,127,255]):{status:'success',generator:{...generator,saveCount:++count}}}).saved('synthetic-generator'),/changed-during-read/);
  await assert.rejects(reader({request:async()=>{throw new Error('unavailable');}}).saved('synthetic-generator'),/unavailable/);
});
test('rename and disappearing slug retain known identity without inferring deletion',()=>{
  const known=[{id:'123',slug:'old-name'}];
  assert.deepEqual(reconcileInventory(known,[]),[{...known[0],observed:'unknown'}]);
  const renamed=reconcileInventory(known,[{id:'123',slug:'new-name',verified:true,listing:'listed'}])[0];
  assert.equal(renamed.slug,'old-name');assert.equal(renamed.observedSlug,'new-name');
});
test('inventory reads owner/native metadata independently and flags unavailable entries',async()=>{
  const r=reader({native:{ownerRequest:async()=>({status:'success',generators:[{name:'synthetic-generator'},{name:'unavailable-generator'}]}),ownership:async name=>name==='synthetic-generator'},gate:{observe:async()=>({signedIn:true,confirmed:true})}});
  const rows=await r.inventory();assert.equal(rows[0].id,'123');assert.equal(rows[1].verified,false);
  r.gate.observe=async()=>({signedIn:false,confirmed:false});await assert.rejects(r.inventory(),/confirm/);
});
