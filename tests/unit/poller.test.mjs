import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubPoller } from '../../src/adapters/github/poller.js';
import { emptyState } from '../../src/state/store.js';
import { githubFixture } from '../fixtures/github.mjs';

test('Check now preserves polling schedule and offline preserves known independent work',async()=>{
  const f=await githubFixture();let now=1000;const state=emptyState();state.settings.github={repository:{owner:'synthetic',name:'repo'},pat:'synthetic-pat'};state.settings.account.accountId='alpha';state.fifo=['123'];
  const store={read:async()=>structuredClone(state),transact:async fn=>fn(state)};
  const poller=new GitHubPoller({store,request:f.request,now:()=>now});
  assert.equal(await poller.check(true),true);const scheduled=poller.nextAt;
  now+=100;assert.equal(await poller.check(false),true);assert.equal(poller.nextAt,scheduled);
  assert.equal(await poller.check(true),false);
  const old=structuredClone(state.requests);poller.client.request=async()=>{throw Error('offline');};
  assert.equal(await poller.check(false),false);assert.equal(state.githubCheck.status,'offline');assert.deepEqual(state.requests,old);assert.deepEqual(state.fifo,['123']);
});
