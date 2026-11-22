import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testStore} from '../fixtures/store.mjs';
import {classifySlug,AVAILABLE_TEXT,RESERVED_TEXT} from '../../src/adapters/perchance/slugs.js';
import {Reservation} from '../../src/workflows/reservation.js';
import {nativeReceipt,NativeActions} from '../../src/adapters/perchance/actions.js';

test('exact slug signals reject challenge, shell, approximate and contradictory responses',()=>{
  const check=(text,saved=null)=>classifySlug({text,saved,targetSlug:'wanted-slug'});
  assert.equal(check(AVAILABLE_TEXT),'Available');assert.equal(check(RESERVED_TEXT),'Reserved');
  assert.equal(check(' create one? '),'Unknown');assert.equal(check(''),'Unknown');
  assert.equal(check('Just a moment'),'Unknown');assert.equal(check(AVAILABLE_TEXT,{id:'1',slug:'wanted-slug'}),'Unknown');
  assert.equal(check('positive generator content',{id:'1',slug:'wanted-slug'}),'Taken');assert.equal(check('positive',{id:'1',slug:'different'}),'Unknown');
});
async function fixture(classification='Available'){
  const {store}=testStore();await store.transact(s=>{s.settings.account.accountId='alpha';});
  const repository={owner:'synthetic',name:'repo'},baseline={repository,commit:'a'.repeat(40),entries:{}};
  const request={slug:'wanted-slug',valid:true,repository,commit:baseline.commit,requestCommit:baseline.commit,status:{account:'alpha',action:'develop',state:'ready'},instructions:[]};
  const live={id:'123',slug:classification==='Taken'?'wanted-slug':'temporary-slug',listing:'listed'};const calls=[];let ownership=true;
  const gate={requireSession:async()=>true,requireOwner:async()=>{if(!ownership)throw Error('owner-mismatch');return true;}};
  const reader={metadata:async target=>{if(target!==live.slug)throw Error('not found');return structuredClone(live);}};
  const slugs={check:async()=>({classification,saved:classification==='Taken'?structuredClone(live):null})};
  const native={create:async()=>{calls.push('create');return structuredClone(live);},listing:async(_t,intent)=>{calls.push(intent);live.listing=intent;},rename:async(_t,slug)=>{calls.push('rename');live.slug=slug;}};
  const writer={write:async input=>{calls.push(new TextDecoder().decode(Uint8Array.from(Object.values(input.changes)[0])));return {verified:true,commit:'b'.repeat(40)};}};
  const reservation=new Reservation({store,slugs,reader,native,gate,github:{snapshot:async()=>baseline},writer});
  return {store,reservation,request,live,calls,native,slugs,noOwner:()=>{ownership=false;}};
}
test('reservation creates once, records ID, explicitly Unlists then exact Renames before reserved',async()=>{
  const f=await fixture(),r=await f.reservation.run(f.request,'reserve1');assert.equal(r.phase,'reserved');assert.deepEqual(f.calls.slice(0,3),['create','unlisted','rename']);assert.match(f.calls[3],/state: reserved/);
  const s=await f.store.read();assert.equal(s.settings.account.locked,true);assert.equal(s.generators['123'].listing,'unlisted');assert.equal(s.generators['123'].slug,'wanted-slug');assert.equal(s.jobs['reserve1-create'].data.id,'123');
  await f.reservation.run(f.request,'reserve1');assert.equal(f.calls.length,4);
});
test('owned exact slug is reused without create, Unlist or Rename',async()=>{
  const f=await fixture('Taken');const r=await f.reservation.run(f.request,'reuse');assert.equal(r.phase,'reserved');assert.equal(r.created,false);assert.equal(f.live.listing,'listed');assert.equal(f.calls.length,1);
});
test('unowned Taken, Reserved and Unknown block only this request without creating',async()=>{
  for(const kind of ['Taken','Reserved','Unknown']){const f=await fixture(kind);if(kind==='Taken')f.noOwner();const r=await f.reservation.run(f.request,'blocked');assert.equal(r.phase,'blocked');assert.equal(r.closed,true);assert.equal(f.calls.filter(c=>c==='create').length,0);assert.match(f.calls[0],/state: blocked/);}
});
test('lost creation result is never replayed, even if a late generator appears',async()=>{
  const f=await fixture();f.native.create=async()=>{f.calls.push('create');throw Error('lost response');};
  assert.equal((await f.reservation.run(f.request,'lost')).phase,'unknown');assert.equal((await f.reservation.run(f.request,'lost')).phase,'unknown');assert.deepEqual(f.calls,['create']);assert.equal((await f.store.read()).jobs['lost-create'].phase,'unknown');
});
test('rename race retains temporary native identity Unlisted and reports blocked',async()=>{
  const f=await fixture();let checks=0;f.slugs.check=async()=>({classification:++checks<3?'Available':'Taken'});
  const r=await f.reservation.run(f.request,'race');assert.equal(r.phase,'blocked');assert.equal(r.generatorId,'123');assert.equal(f.live.listing,'unlisted');assert.equal(f.live.slug,'temporary-slug');assert.ok((await f.store.read()).generators['123'].holds.some(h=>h.kind==='slug'));
});
test('uncertain Rename reconciles exact same ID and owner without another native request',async()=>{
  const f=await fixture();f.native.rename=async(_t,slug)=>{f.calls.push('rename');f.live.slug=slug;throw Error('reply lost');};
  assert.equal((await f.reservation.run(f.request,'rename')).phase,'unknown');assert.equal((await f.reservation.run(f.request,'rename')).phase,'reserved');assert.equal(f.calls.filter(c=>c==='rename').length,1);
});
test('native receipt observes matched native response and never treats frontend return as success',async()=>{
  const page={Promise,fetch:async()=>({ok:true,clone:()=>({json:async()=>({status:'saved',name:'wanted-slug',sessionToken:'must not escape',arbitrary:'must not escape'})})})};
  const original=page.fetch;const receipt=await nativeReceipt(page,{path:'/api/save',exporter:f=>f,matches:b=>b?.generator?.name==='wanted-slug',invoke:()=>page.fetch('/api/save',{body:JSON.stringify({generator:{name:'wanted-slug'}})})});
  assert.deepEqual(receipt,{status:'saved',name:'wanted-slug'});assert.equal(page.fetch,original);
  await assert.rejects(nativeReceipt(page,{path:'/api/save',exporter:f=>f,timeout:2,invoke:()=>Promise.resolve('saved')}),/timeout/);
});
test('production native actions remain gated before touching a live page',async()=>{
  const actions=new NativeActions({});await assert.rejects(actions.create(),/not-live-verified/);await assert.rejects(actions.listing({},'listed'),/not-live-verified/);await assert.rejects(actions.rename({},'new-name'),/not-live-verified/);
});
test('storage failure prevents create and session is required before reading availability',async()=>{
  const f=await fixture();f.reservation.gate.requireSession=async()=>{throw Error('sign-in-required');};
  assert.equal((await f.reservation.run(f.request,'signedout')).phase,'blocked');assert.equal(f.calls.filter(c=>c==='create').length,0);
  const g=await fixture();g.store.markDispatched=async()=>{throw Error('quota');};
  assert.equal((await g.reservation.run(g.request,'quota')).phase,'blocked');assert.equal(g.calls.filter(c=>c==='create').length,0);
});
test('a new request cannot bypass an unresolved creation for the same repository and slug',async()=>{
  const f=await fixture();f.native.create=async()=>{f.calls.push('create');throw Error('lost');};await f.reservation.run(f.request,'old');
  await assert.rejects(f.reservation.run({...f.request,requestCommit:'c'.repeat(40)},'new'),/already-active/);assert.deepEqual(f.calls,['create']);
});
test('creation checkpoints the temporary ID before ownership confirmation can fail',async()=>{
  const f=await fixture();await f.store.transact(s=>{s.utility={native:{id:'native',request:f.request,phase:'checking',generatorId:null,steps:[]}};s.jobs.create={id:'create',kind:'native-create',requestId:'native',phase:'dispatched'};});
  const page={location:{pathname:'/minimal',hash:'#edit'},currentInterfaceMode:'edit',perchanceSaveState:'saved',srcState:{isDirty:()=>false},modelTextEditor:{isClean:()=>true},outputTemplateEditor:{isClean:()=>true},app:{saveGenerator:async()=>{}}};
  const actions=new NativeActions({store:f.store,page,doc:{visibilityState:'hidden'},capability:()=>{},native:{identity:()=>({id:'minimal',slug:'minimal'}),ready:async()=>{},ownership:async()=>false},gate:{store:f.store,requireSession:async()=>{},requireOwner:async()=>{throw Error('session changed');}},reader:{metadata:async()=>({id:'123',slug:'temporary-slug',listing:'listed'})}});
  actions.receipt=async()=>({status:'created',name:'temporary-slug'});await assert.rejects(actions.create('create'),/session changed/);const s=await f.store.read();assert.equal(s.utility.native.generatorId,'123');assert.equal(s.generators['123'].ownerVerified,false);assert.equal(s.jobs.create.createdIdentity.id,'123');
});
test('known created receipt can recover a temporarily unreadable ID without creating again',async()=>{
  const f=await fixture();f.native.create=async actionId=>{f.calls.push('create');await f.store.transact(s=>{s.jobs[actionId].creationReceipt={status:'created',name:'temporary-slug'};});throw Error('metadata unavailable');};
  assert.equal((await f.reservation.run(f.request,'receipt')).phase,'unknown');assert.equal((await f.reservation.run(f.request,'receipt')).phase,'reserved');assert.equal(f.calls.filter(c=>c==='create').length,1);
});
test('a blocked temporary generator is retained across a new ready request rather than silently recreated',async()=>{
  const f=await fixture();let checks=0;f.slugs.check=async()=>({classification:++checks<3?'Available':'Taken'});assert.equal((await f.reservation.run(f.request,'oldtemp')).phase,'blocked');
  await assert.rejects(f.reservation.run({...f.request,requestCommit:'c'.repeat(40)},'newtemp'),/already-active/);assert.equal(f.calls.filter(c=>c==='create').length,1);assert.equal((await f.store.read()).generators['123'].slug,'temporary-slug');
});
test('a late created receipt retains the temporary ID after Stop without reactivating management',async()=>{
  const f=await fixture();await f.store.transact(s=>{s.utility={late:{id:'late',request:f.request,phase:'checking',generatorId:null,steps:[]}};s.jobs.lateCreate={id:'lateCreate',kind:'native-create',requestId:'late',phase:'dispatched'};});
  const page={location:{pathname:'/minimal',hash:'#edit'},currentInterfaceMode:'edit',perchanceSaveState:'saved',srcState:{isDirty:()=>false},modelTextEditor:{isClean:()=>true},outputTemplateEditor:{isClean:()=>true},app:{saveGenerator:()=>{}}};
  const actions=new NativeActions({store:f.store,page,doc:{visibilityState:'hidden'},capability:()=>{},native:{identity:()=>({id:'minimal',slug:'minimal'}),ready:async()=>{},ownership:async()=>false},gate:{store:f.store,requireSession:async()=>{},requireOwner:async()=>{}},reader:{metadata:async()=>({id:'123',slug:'temporary-slug',listing:'listed'})}});actions.receipt=async()=>{await f.store.transact(s=>{s.utility.late.phase='stopped';s.utility.late.stopped=true;s.utility.late.stopRequested=true;s.jobs.lateCreate.phase='unknown';s.jobs.lateCreate.locallyStopped=true;});return {status:'created',name:'temporary-slug'};};await actions.create('lateCreate');const s=await f.store.read();assert.equal(s.jobs.lateCreate.createdIdentity.id,'123');assert.equal(s.jobs.lateCreate.creationReceipt.status,'created');assert.equal(s.generators['123'],undefined);assert.equal(s.utility.late.phase,'stopped');
});
test('a stale native operation is rejected before transport while unrelated fetches stay native',async()=>{
  let effects=0;const page={Promise,fetch:async()=>{effects++;return {ok:true,clone:()=>({json:async()=>({status:'saved',name:'wanted-slug'})})};}};const original=page.fetch;
  await assert.rejects(nativeReceipt(page,{path:'/api/save',exporter:f=>f,allow:async()=>{throw Error('stale');},invoke:()=>page.fetch('/api/save',{body:JSON.stringify({generator:{name:'wanted-slug'}})}),matches:b=>b?.generator?.name==='wanted-slug'}));assert.equal(effects,0);assert.equal(page.fetch,original);
  const receipt=await nativeReceipt(page,{path:'/api/save',exporter:f=>f,allow:async()=>{},invoke:async()=>{await page.fetch('/api/unrelated');await page.fetch('/api/save',{body:'{}'});}});assert.equal(receipt.status,'saved');assert.equal(effects,2);
});
test('native receipt timeout bounds a hung frontend and preserves an already-observed acknowledgement',async()=>{
  let observed=null;const page={Promise,fetch:async()=>({ok:true,clone:()=>({json:async()=>({status:'saved',name:'wanted-slug'})})})};const original=page.fetch;
  await assert.rejects(nativeReceipt(page,{path:'/api/save',exporter:f=>f,observe:async value=>{observed=value;},timeout:2,invoke:async()=>{await page.fetch('/api/save',{body:'{}'});await new Promise(()=>{});}}),/timeout/);assert.equal(observed.status,'saved');assert.equal(page.fetch,original);
});
test('one native invocation cannot send a second matched Save',async()=>{
  let sends=0;const page={Promise,fetch:async()=>{sends++;return {ok:true,clone:()=>({json:async()=>({status:'saved',name:'wanted-slug'})})};}};
  await assert.rejects(nativeReceipt(page,{path:'/api/save',exporter:f=>f,invoke:()=>Promise.all([page.fetch('/api/save',{body:'{}'}),page.fetch('/api/save',{body:'{}'})])}));assert.equal(sends,1);
});
test('reconciled reservation effects release only their own correlated interruption holds',async()=>{
  const f=await fixture();f.native.rename=async(_target,slug)=>{f.calls.push('rename');f.live.slug=slug;throw Error('lost reply');};assert.equal((await f.reservation.run(f.request,'correlation')).phase,'unknown');
  await f.store.transact(s=>{s.jobs['correlation-rename-worker']={id:'correlation-rename-worker',kind:'native-rename',phase:'unknown'};s.generators['123'].holds.push({id:'correlation-rename',kind:'native-unknown'},{id:'correlation-rename-worker',kind:'native-unknown'},{id:'independent',kind:'edit'});});
  assert.equal((await f.reservation.run(f.request,'correlation')).phase,'reserved');const ids=(await f.store.read()).generators['123'].holds.map(h=>h.id);assert.equal(ids.includes('correlation-rename'),false);assert.equal(ids.includes('correlation-rename-worker'),false);assert.equal(ids.includes('independent'),true);assert.equal(f.calls.filter(c=>c==='rename').length,1);
});
test('native transport rejects body mutation while its protected allow check is pending',async()=>{
  let effects=0;const options={body:'{}'},page={Promise,fetch:async()=>{effects++;return {ok:true,clone:()=>({json:async()=>({status:'saved'})})};}};
  await assert.rejects(nativeReceipt(page,{path:'/api/save',exporter:f=>f,allow:async()=>{options.body='changed';},invoke:()=>page.fetch('/api/save',options)}));assert.equal(effects,0);
});
