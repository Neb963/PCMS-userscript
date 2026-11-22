import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InventoryController, inventoryRows, generatorStates, filterInventory, manageActions, refresherReason } from '../../src/state/inventory.js';
import { emptyState } from '../../src/state/store.js';
const gen={id:'123',slug:'synthetic-generator',listing:'listed',status:{account:'alpha',action:'publish_from_github',state:'done'},holds:[],ownerVerified:true,savedVerified:true,githubCommit:'a'.repeat(40),excluded:false};
test('one verified ID has independent state columns; unknown native items are not invented rows',()=>{
  const s=emptyState();s.generators['123']=structuredClone(gen);s.inventory=[{id:'123',slug:gen.slug,verified:true},{id:'456',slug:'unmanaged-generator',listing:'unlisted',verified:true},{id:null,slug:'unknown-generator',verified:false}];
  const rows=inventoryRows(s);assert.equal(rows.length,2);assert.equal(generatorStates(rows[0],s).refresher,'Eligible');assert.equal(generatorStates(rows[1],s).workflow,'Not managed');
  assert.equal(refresherReason({...rows[0],listing:'unknown'}),'Listing unknown');
});
test('filter/sort are deterministic and selection remains an independent ID set',()=>{
  const rows=[{...gen,managed:true,states:{workflow:'done',github:'Synced'}},{...gen,id:'456',slug:'another-generator',listing:'unlisted',managed:true,states:{workflow:'review',github:'Conflict'}}];const selected=new Set(['123']);
  assert.equal(filterInventory(rows,{filter:'unlisted'})[0].id,'456');assert.equal(selected.has('123'),true);assert.equal(filterInventory(rows,{sort:'slug'})[0].id,'456');assert.equal(filterInventory(rows,{query:'123'}).length,1);
});
test('wrong ownership and independent holds hide native actions without clearing local exclusions',()=>{
  assert.deepEqual(manageActions({...gen,managed:true,ownerVerified:false},['edit','rename','rollback']),['exclude']);
  assert.deepEqual(manageActions({...gen,managed:true,holds:[{id:'unknown',kind:'native-unknown'}]},['edit']),['exclude']);
  assert.ok(manageActions({...gen,managed:true},['edit']).includes('edit'));
});
test('bulk eligibility updates recheck each ID, preserve remote source/listing and all holds',async()=>{
  const s=emptyState();s.generators['123']={...structuredClone(gen),holds:[{id:'edit',kind:'edit'},{id:'unknown',kind:'native-unknown'}]};
  const c=new InventoryController({store:{read:async()=>structuredClone(s),transact:async fn=>({result:fn(s)})}});
  await assert.rejects(c.exclude(['123'],true,false),/confirmation/);const result=await c.exclude(['123','456'],true,true);assert.equal(result.result[0].applied,true);assert.equal(result.result[1].applied,false);assert.equal(s.generators['123'].listing,'listed');assert.equal(s.generators['123'].status.state,'done');assert.equal(s.generators['123'].holds.length,2);
});

test('inventory refresh retains renamed/missing IDs and holds unexpected unlisting independently',async()=>{
  const s=emptyState();s.generators['123']={...structuredClone(gen),holds:[{id:'edit',kind:'edit'}]};const store={read:async()=>structuredClone(s),transact:async fn=>({result:fn(s)})};
  const c=new InventoryController({store,reader:{inventory:async()=>[{id:'123',slug:'renamed-generator',listing:'listed',verified:true}]}});await c.refresh();assert.equal(s.generators['123'].slug,gen.slug);assert.ok(s.generators['123'].holds.some(h=>h.kind==='identity-mismatch'));
  c.reader.inventory=async()=>[{id:'123',slug:gen.slug,listing:'unlisted',verified:true}];await c.refresh();assert.equal(s.generators['123'].listing,'unlisted');assert.ok(s.generators['123'].holds.some(h=>h.kind==='listing-mismatch'));assert.ok(s.generators['123'].holds.some(h=>h.kind==='edit'));
});

test('inventory refresh does not infer an external rename during a managed native→GitHub rename',async()=>{
 const s=emptyState();s.generators['123']=structuredClone(gen);s.maintenance={moving:{id:'moving',generatorId:'123',phase:'github-pending'}};const c=new InventoryController({store:{read:async()=>structuredClone(s),transact:async fn=>({state:s,result:fn(s)})},reader:{inventory:async()=>[{id:'123',slug:'new-name',listing:'listed',verified:true}]}});await c.refresh();assert.equal(s.generators['123'].holds.length,0);await assert.rejects(c.inspect('123'),/maintenance-in-progress/);assert.equal(s.generators['123'].slug,gen.slug);
});
test('Manage inspection persists unexpected Unlisting independently of other holds',async()=>{
 const s=emptyState();s.generators['123']={...structuredClone(gen),holds:[{id:'edit',kind:'edit'}]};const c=new InventoryController({store:{read:async()=>structuredClone(s),transact:async fn=>({state:s,result:fn(s)})},reader:{metadata:async()=>({id:'123',listing:'unlisted'})},gate:{requireOwner:async()=>true}});await c.inspect('123');assert.equal(s.generators['123'].listing,'unlisted');assert.equal(s.generators['123'].holds.some(h=>h.kind==='listing-mismatch'),true);assert.equal(s.generators['123'].holds.some(h=>h.kind==='edit'),true);
});
