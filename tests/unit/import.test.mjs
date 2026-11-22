import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BulkImport } from '../../src/workflows/import.js';
import { ProtectedStore } from '../../src/state/store.js';
import { isolatedManager, requireGitHubWriteProof } from '../../src/runtime/context.js';

async function fixture(){
  let raw=null,chain=Promise.resolve();const store=new ProtectedStore({get:async()=>raw,set:async(_k,v)=>{raw=v;},locks:{request:(_k,_o,run)=>{const p=chain.then(run);chain=p.catch(()=>{});return p;}}});
  const repository={owner:'synthetic',name:'repo'},source={pjs:'output\n  example',html:'<p>example</p>',files:{'a.bin':[0,255]}};
  await store.transact(s=>{s.settings.account.accountId='alpha';s.settings.github={repository,pat:'synthetic-pat'};s.inventory=[{id:'123',slug:'existing-folder',verified:true,listing:'listed'},{id:'456',slug:'native-listed',verified:true,listing:'listed'},{id:'789',slug:'native-unlisted',verified:true,listing:'unlisted'}];s.commands.run1={id:'run1',kind:'bulk-import',results:{}};});
  const commits=[];let lost=false;const github={snapshot:async()=>({repository,commit:'a'.repeat(40),treeSha:'b'.repeat(40),entries:{'existing-folder/status.md':{path:'existing-folder/status.md',type:'blob',mode:'100644',sha:'f'.repeat(40)}}})};
  const reader={inventory:async()=>(await store.read()).inventory,saved:async(slug,id)=>({id,slug,listing:id==='789'?'unlisted':'listed',source:structuredClone(source)})};
  const writer={write:async input=>{commits.push(input);await store.prepareAction({id:input.id,kind:'github'});if(lost){lost=false;throw Error('lost');}return {verified:true,commit:'c'.repeat(40)};},reconcile:async()=>({verified:true,commit:'c'.repeat(40)})};
  const workflow=new BulkImport({store,reader,github,writer,gate:{requireOwner:async()=>true}});
  return {store,reader,workflow,commits,source,lose:()=>{lost=true;},command:{id:'run1',account:'alpha',repository,ids:['123','456','789']}};
}
test('Bulk Import skips a conflicting folder and commits complete source/status without native mutations',async()=>{
  const f=await fixture(),preview=await f.workflow.preview();assert.equal(preview[0].eligible,false);assert.equal(preview[1].eligible,true);
  const results=await f.workflow.run(f.command);assert.deepEqual(results.map(r=>r.outcome),['skipped','imported','imported']);assert.equal(f.commits.length,2);
  const changes=f.commits[0].changes;assert.deepEqual(changes['native-listed/src/a.bin'],[0,255]);assert.match(new TextDecoder().decode(Uint8Array.from(changes['native-listed/status.md'])),/action: publish_from_github\nstate: done/);
  const s=await f.store.read();assert.equal(s.settings.account.locked,true);assert.equal(s.generators['456'].savedVerified,true);assert.equal(s.generators['789'].listing,'unlisted');assert.equal(s.generators['456'].holds.length,0);
});
test('unknown GitHub import retains complete source and reconciles without a second commit',async()=>{
  const f=await fixture();f.command.ids=['456'];f.lose();assert.equal((await f.workflow.run(f.command))[0].outcome,'unknown');assert.deepEqual((await f.store.read()).pending['run1-456'].source.files['a.bin'],[0,255]);
  assert.equal((await f.workflow.run(f.command))[0].outcome,'imported');assert.equal(f.commits.length,1);
});
test('changed native source after commit stays held and cannot join Refresher',async()=>{
  const f=await fixture();f.command.ids=['456'];let reads=0;const original=f.reader.saved;f.reader.saved=async(...args)=>{const r=await original(...args);if(++reads>1)r.source.pjs='external save';return r;};
  assert.equal((await f.workflow.run(f.command))[0].outcome,'held');const s=await f.store.read();assert.equal(s.generators['456'].savedVerified,false);assert.ok(s.generators['456'].holds.some(h=>h.kind==='source-drift'));assert.ok(s.pending['run1-456'].source);
});
test('production refuses page-world credential access and unverified GitHub writes',()=>{
  assert.equal(isolatedManager({scriptHandler:'Violentmonkey',injectInto:'content'}),true);assert.equal(isolatedManager({scriptHandler:'Violentmonkey',injectInto:'page'}),false);assert.equal(isolatedManager(null),false);assert.throws(()=>requireGitHubWriteProof(),/not-live-verified/);
});

test('a crash after verified import but before the row report does not need deleted source again',async()=>{
  const f=await fixture();f.command.ids=['456'];await f.workflow.run(f.command);await f.store.transact(s=>{delete s.commands.run1.results['456'];});
  assert.equal((await f.workflow.run(f.command))[0].outcome,'imported');assert.equal(f.commits.length,1);assert.equal((await f.store.read()).generators['456'].holds.length,0);
});
