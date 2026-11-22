import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testStore} from '../fixtures/store.mjs';
import {Synchronizer,syncRecords} from '../../src/workflows/sync.js';
import {refresherReason} from '../../src/state/inventory.js';
import {parseStatus} from '../../src/shared/domain.js';

async function fixture({mode='source',approved=true}={}){
  const {store}=testStore(),repository={owner:'synthetic',name:'original'},baseCommit='a'.repeat(40),source={pjs:'approved',html:'<p>approved</p>',files:{'binary.bin':[0,255]}},previous={pjs:'old',html:'<p>old</p>',files:{}};
  const pending={id:'pending',generatorId:'123',slug:'target-slug',repository,baseCommit,kind:'source',source,previousSource:previous,status:{account:'alpha',action:'develop',state:'done'},phase:'local-done',listingIntent:'listed',nativeVerified:true,syncKind:mode,...(approved?{approval:{id:'approval',kind:'review',draftId:'draft',workerId:'tab',documentId:'doc',confirmedAt:1},draftId:'draft',retainedTab:'tab'}:{})};
  await store.transact(s=>{s.settings.account={accountId:'alpha',locked:true,confirmed:true};s.settings.github={repository,pat:'synthetic-pat'};s.pending.pending=pending;s.generators['123']={id:'123',slug:'target-slug',listing:'listed',status:{account:'alpha',action:'develop',state:'review'},localDone:true,localApproved:approved,savedVerified:true,ownerVerified:true,holds:[]};});
  function entries(sourceTag='old',statusTag='review',instructionTag='instructions'){return Object.fromEntries([['main.pjs',sourceTag],['main.html',sourceTag],['status.md',statusTag],['prompt.md',instructionTag]].map(([p,sha])=>['target-slug/'+p,{path:'target-slug/'+p,type:'blob',mode:'100644',sha}]));}
  const baseline={repository,commit:baseCommit,entries:entries()},remote={snapshot:{repository,commit:'b'.repeat(40),entries:entries()},source:previous,status:{account:'alpha',action:'develop',state:'review'},history:baseCommit,offline:false};
  const calls=[];let uuid=0,unknown=false,land=true;
  const github={snapshot:async at=>{if(remote.offline)throw Error('offline');return structuredClone(at===baseCommit?baseline:remote.snapshot);},source:async()=>structuredClone(remote.source),text:async snapshot=>snapshot.commit===baseCommit?'account: alpha\naction: develop\nstate: review\n':`account: ${remote.status.account}\naction: ${remote.status.action}\nstate: ${remote.status.state}\n`,api:async path=>[{sha:path.includes(baseCommit)?baseCommit:remote.history}]};
  const writer={write:async input=>{
    calls.push(input);await store.prepareAction({id:input.id,kind:'github'});await store.markDispatched(input.id);
    if(land){if(input.operation==='source')remote.source=structuredClone(source);remote.status=parseStatus(new TextDecoder().decode(Uint8Array.from(input.changes['target-slug/status.md'])));if(input.operation==='source')remote.snapshot.entries=entries('approved','done');else remote.snapshot.entries['target-slug/status.md'].sha=remote.status.state;remote.snapshot.commit='c'.repeat(40);}
    if(unknown){await store.transact(s=>{s.jobs[input.id].phase='unknown';});throw Error('github-write-unknown');}await store.transact(s=>{s.jobs[input.id].phase='verified';});return {verified:true,commit:remote.snapshot.commit};
  },reconcile:async()=>({verified:land,commit:remote.snapshot.commit}),guard:async()=>{}};
  const client={github,writer},sync=new Synchronizer({store,services:async repo=>{assert.deepEqual(repo,repository);return client;},uuid:()=>String(++uuid)});
  return {store,source,previous,remote,calls,sync,client,conflict:()=>{remote.source={pjs:'remote changed',html:'<p>different</p>',files:{}};remote.snapshot.entries=entries('changed','review');},unknown:({landed=true}={})=>{unknown=true;land=landed;}};
}
test('original-repository source synchronization is one atomic complete-source and done commit',async()=>{
  const f=await fixture();assert.equal((await f.sync.syncOne('pending')).phase,'synced');assert.equal(f.calls.length,1);assert.equal(f.calls[0].operation,'source');assert.deepEqual(f.calls[0].changes['target-slug/src/binary.bin'],[0,255]);assert.match(new TextDecoder().decode(Uint8Array.from(f.calls[0].changes['target-slug/status.md'])),/state: done/);assert.equal((await f.store.read()).pending.pending.source,undefined);
});
test('GitHub offline retains full approved source and locally verified Listed Refresher eligibility',async()=>{
  const f=await fixture();f.remote.offline=true;assert.equal((await f.sync.syncOne('pending')).phase,'offline');const s=await f.store.read();assert.deepEqual(s.pending.pending.source,f.source);assert.equal(refresherReason({...s.generators['123'],managed:true}),null);assert.equal(f.calls.length,0);
  f.remote.offline=false;assert.equal((await f.sync.syncOne('pending')).phase,'synced');
});
test('same source and status on main resolves pending work without creating another commit',async()=>{
  const f=await fixture();f.remote.source=structuredClone(f.source);f.remote.status.state='done';f.remote.snapshot.entries['target-slug/main.pjs'].sha='approved';f.remote.snapshot.entries['target-slug/status.md'].sha='done';assert.equal((await f.sync.syncOne('pending')).phase,'synced');assert.equal(f.calls.length,0);
});
test('source conflict holds only synchronization; request and account conflicts do not offer source choices',async()=>{
  const f=await fixture();f.conflict();assert.equal((await f.sync.syncOne('pending')).phase,'source-conflict');const s=await f.store.read();assert.equal(refresherReason({...s.generators['123'],managed:true}),null);assert.equal(f.calls.length,0);
  const r=await fixture();r.remote.snapshot.entries['target-slug/prompt.md'].sha='new prompt';assert.equal((await r.sync.syncOne('pending')).phase,'request-conflict');await assert.rejects(r.sync.compare('pending'),/approved-source-conflict-required/);
  const a=await fixture();a.remote.status.account='different';assert.equal((await a.sync.syncOne('pending')).phase,'account-conflict');await assert.rejects(a.sync.compare('pending'),/approved-source-conflict-required/);
});
test('same ready/request status bytes with a different history commit are a request conflict',async()=>{
  const f=await fixture();f.remote.history='d'.repeat(40);assert.equal((await f.sync.syncOne('pending')).phase,'request-conflict');assert.equal(f.calls.length,0);
});
test('comparison and confirmation are mandatory; changed main cannot be resolved using an old comparison',async()=>{
  const f=await fixture();f.conflict();await f.sync.syncOne('pending');const comparison=await f.sync.compare('pending');await assert.rejects(f.sync.decide(comparison.token,'local',false),/confirmation-required/);f.remote.snapshot.commit='d'.repeat(40);await assert.rejects(f.sync.decide(comparison.token,'local',true),/comparison-changed/);assert.equal(f.calls.length,0);
});
test('Keep approved local commits after fresh comparison without any native Save',async()=>{
  const f=await fixture();f.conflict();await f.sync.syncOne('pending');const compared=await f.sync.compare('pending');assert.equal((await f.sync.decide(compared.token,'local',true)).phase,'synced');assert.equal(f.calls.length,1);assert.equal(f.calls[0].baseline.commit,'b'.repeat(40));
});
test('lost commit response is reconciled without a second GitHub write',async()=>{
  const f=await fixture();f.unknown();assert.equal((await f.sync.syncOne('pending')).phase,'unknown');assert.equal((await f.sync.syncOne('pending')).phase,'synced');assert.equal(f.calls.length,1);
  const g=await fixture();g.unknown({landed:false});await g.sync.syncOne('pending');await g.sync.syncOne('pending');assert.equal(g.calls.length,1);assert.equal((await g.store.read()).pending.pending.phase,'unknown');
});
test('status-only sync never replaces source and same status with changed source cannot hide a conflict',async()=>{
  const f=await fixture({mode:'status',approved:false});f.remote.source=structuredClone(f.source);f.remote.snapshot.entries['target-slug/main.pjs'].sha='approved';assert.equal((await f.sync.syncOne('pending')).phase,'synced');assert.deepEqual(Object.keys(f.calls[0].changes),['target-slug/status.md']);
  const g=await fixture({mode:'status',approved:false});g.conflict();g.remote.status.state='done';assert.equal((await g.sync.syncOne('pending')).phase,'request-conflict');assert.equal(g.calls.length,0);
});
test('an approved snapshot cannot synchronize before its native source has been independently verified',async()=>{
  const f=await fixture();await f.store.transact(s=>{s.pending.pending.nativeVerified=false;});assert.equal((await f.sync.syncOne('pending')).phase,'snapshot-unverified');assert.equal(f.calls.length,0);assert.deepEqual((await f.store.read()).pending.pending.source,f.source);
});
test('unrelated main changes coexist with a complete approved-source synchronization',async()=>{
  const f=await fixture();f.remote.snapshot.entries['another-generator/main.pjs']={path:'another-generator/main.pjs',sha:'unrelated',type:'blob',mode:'100644'};assert.equal((await f.sync.syncOne('pending')).phase,'synced');assert.equal(f.calls.length,1);
});
test('Unknown writes remain recheck-only even when remote source now differs',async()=>{
  const f=await fixture();f.unknown({landed:false});await f.sync.syncOne('pending');f.conflict();assert.equal((await f.sync.syncOne('pending')).phase,'unknown');await assert.rejects(f.sync.compare('pending'),/github-result-unknown/);assert.equal(f.calls.length,1);
});
test('a utility status without a native ID has a durable synced row after recovery',async()=>{
  const f=await fixture();await f.store.transact(s=>{delete s.pending.pending;delete s.generators['123'];s.utility={request:{id:'request',request:{slug:'target-slug',repository:f.remote.snapshot.repository,status:{account:'alpha',action:'develop',state:'ready'}},generatorId:null,pendingStatus:{status:{account:'alpha',action:'develop',state:'blocked'},repository:f.remote.snapshot.repository,baseCommit:'a'.repeat(40)}}};});
  const row=syncRecords(await f.store.read())[0];assert.equal(row.generatorId,null);assert.equal((await f.sync.syncOne(row.id)).phase,'synced');assert.equal(syncRecords(await f.store.read()).length,1);
});
