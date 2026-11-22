import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SettingsController } from '../../src/state/settings.js';
import { emptyState } from '../../src/state/store.js';
import { githubFixture } from '../fixtures/github.mjs';

async function fixture() {const f=await githubFixture(),s=emptyState();s.settings.github={repository:{owner:'synthetic',name:'repo'},pat:'synthetic-old'};const store={read:async()=>structuredClone(s),transact:async fn=>fn(s)};const controller=new SettingsController({store,request:f.request});controller.initialize(s);return {controller,s,store};}
test('candidate edits invalidate Test and failure preserves working settings',async()=>{
  const f=await fixture();f.controller.edit('repositoryURL','https://github.com/synthetic/repo');f.controller.edit('pat','synthetic-new');
  await assert.rejects(f.controller.apply(),/test-candidate/);await f.controller.test();f.controller.edit('pat','synthetic-newer');await assert.rejects(f.controller.apply(),/test-candidate/);
  f.controller.edit('repositoryURL','https://evil.test/a/b');await assert.rejects(f.controller.test(),/invalid/);assert.equal(f.s.settings.github.pat,'synthetic-old');
});
test('repository/PAT switches require exact pending-work confirmation and retain original access',async()=>{
  const f=await fixture();f.s.jobs.pending={id:'pending',kind:'github',phase:'unknown',repository:{owner:'synthetic',name:'repo'}};
  f.controller.edit('repositoryURL','https://github.com/synthetic/other');f.controller.edit('pat','synthetic-other');await f.controller.test();
  await assert.rejects(f.controller.apply(),/confirmation/);const work=await f.controller.switchWork();await f.controller.apply(work);
  assert.equal(await f.controller.credentialFor({owner:'synthetic',name:'repo'}),'synthetic-old');assert.equal(f.s.jobs.pending.repository.name,'repo');
  assert.equal(f.s.settings.github.repository.name,'other');
});
test('PAT-only update is used for same-repository pending work; invalid polling is non-mutating',async()=>{
  const f=await fixture();f.s.jobs.pending={id:'pending',kind:'github',phase:'unknown',repository:{owner:'synthetic',name:'repo'}};f.controller.edit('pat','synthetic-new');await f.controller.test();await f.controller.apply(await f.controller.switchWork());
  assert.equal(await f.controller.credentialFor({owner:'synthetic',name:'repo'}),'synthetic-new');
  for(const value of [0,1441,2.5,NaN])await assert.rejects(f.controller.setPolling(value),/invalid/);
  assert.equal(f.s.settings.pollMinutes,10);await f.controller.setPolling(15);assert.equal(f.s.settings.pollMinutes,15);
});
