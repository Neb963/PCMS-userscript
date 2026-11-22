import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testStore} from '../fixtures/store.mjs';
import {ApprovedPublication} from '../../src/workflows/approved-publication.js';
import {Synchronizer} from '../../src/workflows/sync.js';
async function fixture({created=false,listing='listed',mode='saved'}={}){
 const {store}=testStore(),baseline={pjs:'previous',html:'previous',files:{'old.bin':[0]}},approved={pjs:'approved',html:'approved',files:{'new.bin':[0,255],'empty.bin':[]}},request={repository:{owner:'synthetic',name:'original'},commit:'a'.repeat(40),status:{account:'alpha',action:'develop',state:'reserved'}},live={source:structuredClone(baseline),listing},calls=[];let draft=structuredClone(approved),clean=false,settled=true,number=0;
 await store.transact(s=>{s.settings.account={accountId:'alpha',locked:true,confirmed:true};s.development={dev:{id:'dev',generatorId:'123',slug:'synthetic-target',request,created,originalListing:listing,baselineSource:baseline,phase:'review',workerId:'worker',documentId:'doc',draftId:'draft'}};s.generators['123']={id:'123',slug:'synthetic-target',listing,status:request.status,holds:[{id:'dev',kind:'review'}]};s.workers.worker={id:'worker',role:'development',phase:'retained',slotReleased:true,documentId:'doc'};s.requestQueue={dev:{id:'dev',closed:false}};});
 const native={captureApproved:async()=>({id:'123',slug:'synthetic-target',source:structuredClone(draft),draftId:'draft',workerId:'worker',documentId:'doc',settled,clean}),saveApproved:async(_target,_id,pendingId)=>{
  const p=(await store.read()).pending[pendingId];assert.deepEqual(p.source,approved,'full approved source must persist before Save');assert.deepEqual(p.previousSource,baseline);calls.push('save');await store.prepareAction({id:pendingId+'-save',kind:'approved-save',generatorId:'123',workerId:'worker'});await store.markDispatched(pendingId+'-save');
  if(mode!=='lost-unlanded'){live.source=structuredClone(approved);clean=true;}
  await store.transact(s=>{s.jobs[pendingId+'-save'].phase=mode.startsWith('lost')?'unknown':'verified';});if(mode.startsWith('lost'))throw Error('lost receipt');return {status:'saved'};
 },listApproved:async(_target,_id,pendingId)=>{assert.deepEqual(live.source,approved);calls.push('list');live.listing='listed';await store.prepareAction({id:pendingId+'-list',kind:'approved-listing',generatorId:'123',workerId:'worker'});await store.transact(s=>{s.jobs[pendingId+'-list'].phase='verified';});}};
 const publisher=new ApprovedPublication({store,nativeFactory:async()=>native,reader:{saved:async()=>structuredClone(live)},gate:{requireOwner:async()=>true},allowed:()=>{},uuid:()=>String(++number)});
 return {store,publisher,live,baseline,approved,calls,draft:value=>{draft=value;},settled:value=>{settled=value;},clean:value=>{clean=value;}};
}
test('approved publication saves exact retained source once, preserves Listing and queues full original-repository source/done',async()=>{
 const f=await fixture(),candidate=await f.publisher.prepare('dev');assert.equal(Object.keys((await f.store.read()).pending).length,0);const result=await f.publisher.confirm('dev',candidate.approval.id);assert.equal(result.kind,'verified');assert.deepEqual(f.calls,['save']);const s=await f.store.read(),p=s.pending[result.pendingId];assert.equal(s.development.dev.phase,'done');assert.equal(s.generators['123'].listing,'listed');assert.equal(s.generators['123'].localApproved,true);assert.equal(s.generators['123'].holds.length,0);assert.deepEqual(p.source,f.approved);assert.deepEqual(p.repository,{owner:'synthetic',name:'original'});assert.equal(p.status.state,'done');assert.equal(p.nativeVerified,true);await assert.rejects(f.publisher.confirm('dev',candidate.approval.id),/approval-changed/);assert.equal(f.calls.length,1);
 const sync=new Synchronizer({store:f.store,services:async()=>{throw Error('offline');}});await sync.syncOne(p.id);const offline=await f.store.read();assert.deepEqual(offline.pending[p.id].source,f.approved);assert.equal(offline.generators['123'].localDone,true);
});
test('new Unlisted is Listed only after exact Save; an existing Unlisted remains Unlisted',async()=>{
 for(const created of [true,false]){const f=await fixture({created,listing:'unlisted'}),c=await f.publisher.prepare('dev');assert.equal((await f.publisher.confirm('dev',c.approval.id)).kind,'verified');assert.deepEqual(f.calls,created?['save','list']:['save']);assert.equal((await f.store.read()).generators['123'].listing,created?'listed':'unlisted');}
});
test('draft changes, active Helper and quota failure cannot authorize the approved Save',async()=>{
 for(const change of [async f=>f.draft({pjs:'operator changed',html:'approved',files:{}}),async f=>f.settled(false),async f=>{const set=f.store.set;f.store.set=async(k,v)=>{if(v.includes('"pending":{"approved-'))throw Error('quota');return set(k,v);};}]){const f=await fixture(),c=await f.publisher.prepare('dev');await change(f);await assert.rejects(f.publisher.confirm('dev',c.approval.id));assert.deepEqual(f.calls,[]);assert.deepEqual(f.live.source,f.baseline);}
});
test('a landed Save with a lost receipt is reconciled by full readback without another Save',async()=>{
 const f=await fixture({mode:'lost-landed'}),c=await f.publisher.prepare('dev');const first=await f.publisher.confirm('dev',c.approval.id);assert.equal(first.kind,'unknown');const result=await f.publisher.publish('dev');assert.equal(result.kind,'verified');assert.deepEqual(f.calls,['save']);assert.equal((await f.store.read()).jobs[first.pendingId+'-save'].resolution,'independent-source-readback');
});
test('an unknown unlanded Save is never replayed, including simultaneous rechecks',async()=>{
 const f=await fixture({mode:'lost-unlanded'}),c=await f.publisher.prepare('dev');const first=await f.publisher.confirm('dev',c.approval.id);await Promise.all([f.publisher.publish('dev'),f.publisher.publish('dev')]);const s=await f.store.read();assert.equal(s.development.dev.phase,'publication-unknown');assert.deepEqual(f.calls,['save']);assert.deepEqual(s.pending[first.pendingId].source,f.approved);assert.equal(s.generators['123'].holds[0].kind,'review');
});
test('external saved-source drift and changed account assignment retain the snapshot and cannot Save',async()=>{
 const f=await fixture(),c=await f.publisher.prepare('dev');f.live.source={pjs:'external source',html:'external',files:{}};const result=await f.publisher.confirm('dev',c.approval.id);assert.equal(result.kind,'unknown');assert.deepEqual(f.calls,[]);assert.deepEqual((await f.store.read()).pending[result.pendingId].source,f.approved);
 const other=await fixture();await other.store.transact(s=>{s.requestQueue.dev.incoming={status:{account:'other'}};});await assert.rejects(other.publisher.prepare('dev'),/account-assignment/);assert.deepEqual(other.calls,[]);
});
