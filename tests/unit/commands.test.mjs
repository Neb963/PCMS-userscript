import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueueImport, CommandRunner } from '../../src/runtime/commands.js';
import { emptyState } from '../../src/state/store.js';

test('explicit import intent is durable, account-bound and rejects stale repository preview',async()=>{
  const state=emptyState();state.settings.account.accountId='alpha';state.settings.github={repository:{owner:'synthetic',name:'repo'},pat:'synthetic'};
  const store={read:async()=>structuredClone(state),transact:async fn=>fn(state)};
  await assert.rejects(enqueueImport(store,['123'],{owner:'other',name:'repo'}),/settings-changed/);
  const id=await enqueueImport(store,['123','123'],state.settings.github.repository,()=> 'intent-1');assert.equal(id,'intent-1');assert.deepEqual(state.commands[id].ids,['123']);assert.equal(state.commands[id].phase,'queued');assert.equal(state.commands[id].account,'alpha');
});
test('one coordinator claims a queued import once; unknown results remain unresolved',async()=>{
  const state=emptyState();state.commands.one={id:'one',kind:'bulk-import',phase:'queued',results:{}};const store={read:async()=>structuredClone(state),transact:async fn=>fn(state)};let effects=0;
  const coordinator={active:true,term:1,assertOwner:s=>assert.equal(s.coordinator.term,1)};state.coordinator.term=1;
  const runner=new CommandRunner({store,coordinator,importWorkflow:async()=>({run:async()=>{effects++;return [{outcome:'unknown'}];}})});
  await Promise.all([runner.tick(),runner.tick()]);assert.equal(effects,1);assert.equal(state.commands.one.phase,'unknown');await runner.tick();assert.equal(effects,1);
});
