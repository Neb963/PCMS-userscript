import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativePage, SessionGate, requireLiveCapability } from '../../src/adapters/perchance/session.js';
import { ProtectedStore } from '../../src/state/store.js';

function fixture() {
  let raw = null, chain = Promise.resolve();
  const store = new ProtectedStore({ get:async()=>raw,set:async(_k,v)=>{raw=v;},locks:{request:(_k,_o,run)=>{const p=chain.then(run);chain=p.catch(()=>{});return p;}} });
  const page={ app:{store:{data:{user:{loggedIn:true,email:'synthetic@example.test',sessionToken:'synthetic-session'}}},data:{generator:{id:123,name:'synthetic-generator'}}},fetch:async()=>({ok:true,json:async()=>({status:'is-owner'})}) };
  const native=new NativePage(page),gate=new SessionGate(store,native);
  return {store,page,native,gate};
}
test('manual binding and confirmation never infer account ID', async()=>{
  const f=fixture();
  assert.equal((await f.store.read()).settings.account.accountId,'');
  await assert.rejects(f.gate.requireOwner({slug:'synthetic-generator'}),/confirm/);
  await f.gate.bind('operator-label');
  await assert.rejects(f.gate.confirm(false),/manual/);
  await f.gate.confirm(true);
  await f.gate.requireOwner({slug:'synthetic-generator',account:'operator-label'});
  assert.equal((await f.store.read()).settings.account.accountId,'operator-label');
  await f.store.transact(s=>{s.settings.account.locked=true;});
  await assert.rejects(f.gate.bind('other'),/locked/);
});
test('sign-out, changed session and ownership mismatch invalidate confirmation', async()=>{
  const f=fixture();await f.gate.bind('alpha');await f.gate.confirm(true);
  f.page.app.store.data.user.sessionToken='synthetic-new-session';
  assert.equal((await f.gate.observe()).confirmed,false);
  await f.gate.confirm(true);
  f.page.fetch=async()=>({ok:true,json:async()=>({status:'is-not-owner'})});
  await assert.rejects(f.gate.requireOwner({slug:'synthetic-generator'}),/owner-mismatch/);
  assert.equal((await f.store.read()).settings.account.confirmed,false);
  f.page.app.store.data.user.loggedIn=false;
  await assert.rejects(f.gate.confirm(true),/sign-in/);
  assert.equal((await f.store.read()).settings.account.accountId,'alpha');
});
test('native identity/draft readiness rejects wrong targets and unresolved choice', async()=>{
  const f=fixture();
  Object.assign(f.page,{modelTextEditor:{getValue:()=>''},outputTemplateEditor:{getValue:()=>''},srcState:{ready:async()=>{},getDraftId:()=> 'draft-1'},currentInterfaceMode:'edit',__editorReady:true,__draftChoiceSettled:true});
  assert.equal((await f.native.ready({id:'123',slug:'synthetic-generator'})).draftId,'draft-1');
  await assert.rejects(f.native.ready({id:'456',slug:'synthetic-generator'}),/target-mismatch/);
  f.page.__draftChoiceSettled=false;
  await assert.rejects(f.native.ready({id:'123',slug:'synthetic-generator'}),/not-settled/);
  assert.throws(()=>requireLiveCapability('save'),/not-live-verified/);
});

test('server-rejected session invalidates manual confirmation even with stale page login flag',async()=>{
  const f=fixture();await f.gate.bind('alpha');await f.gate.confirm(true);
  f.page.fetch=async()=>({ok:true,json:async()=>({status:'session-token-error'})});
  await assert.rejects(f.gate.requireOwner({slug:'synthetic-generator'}),/sign-in/);
  assert.equal((await f.store.read()).settings.account.confirmed,false);
});
