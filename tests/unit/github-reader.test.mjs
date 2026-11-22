import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubReader, blobHash, bytesToBase64, parseRepositoryURL, requestDisposition } from '../../src/adapters/github/reader.js';

import { githubFixture } from '../fixtures/github.mjs';
test('repository URLs reject lookalikes, credentials, paths, query and non-HTTPS',()=>{
  assert.deepEqual(parseRepositoryURL('https://github.com/synthetic/repo.git'),{owner:'synthetic',name:'repo'});
  for(const url of ['https://github.com.evil.test/a/b','https://github.com/a/b/tree/main','https://user@github.com/a/b','http://github.com/a/b','https://github.com/a/b?x=1'])assert.throws(()=>parseRepositoryURL(url));
});
test('one immutable snapshot reads complete source and selected manual-account requests',async()=>{
  const f=await githubFixture();const snap=await f.reader.snapshot();const source=await f.reader.source(snap,'synthetic-generator');assert.deepEqual(source.files['a.bin'],[0,255]);
  const requests=await f.reader.requests(snap,'alpha');assert.equal(requests[0].valid,true);assert.equal(requests[0].requestCommit,'c'.repeat(40));
  assert.deepEqual(await f.reader.requests(snap,'different-account'),[]);
  assert.ok(f.calls.every(c=>c.url.startsWith('https://api.github.com/repos/synthetic/repo/')));
  const oldCalls=f.calls.length;await f.reader.source(snap,'synthetic-generator');assert.equal(f.calls.length,oldCalls);
});
test('missing panels, corrupt blobs, truncated tree and repository switch fail safely',async()=>{
  const f=await githubFixture();f.entries.splice(f.entries.findIndex(e=>e.path.endsWith('main.html')),1);
  const snap=await f.reader.snapshot();await assert.rejects(f.reader.source(snap,'synthetic-generator'),/unavailable/);
  assert.equal((await f.reader.requests(snap,'alpha'))[0].valid,false);
  await assert.rejects(f.reader.bytes({...snap,repository:{owner:'other',name:'repo'}},'synthetic-generator/main.pjs'),/repository-changed/);
  const g=await githubFixture();Object.values(g.blobs)[0].content=bytesToBase64(new Uint8Array([1]));await assert.rejects(g.reader.source(await g.reader.snapshot(),'synthetic-generator'),/unavailable/);
  const h=await githubFixture();h.reader.request=async(url,o)=>url.includes('/git/trees/')?{sha:h.tree,truncated:true,tree:[]}:h.request(url,o);await assert.rejects(h.reader.snapshot(),/incomplete/);
});
test('closed requests do not replay on unrelated changes; explicit new ready is distinct',()=>{
  const incoming={valid:true,repository:{owner:'synthetic',name:'repo'},requestCommit:'a'.repeat(40),instructions:[],status:{account:'alpha',action:'develop',state:'ready'}};
  assert.equal(requestDisposition(incoming,{...incoming,closed:true}),'stale');
  assert.equal(requestDisposition({...incoming,requestCommit:'b'.repeat(40),readyTransition:true},{...incoming,closed:true}),'queue');
  assert.equal(requestDisposition({...incoming,instructions:[['prompt','new']]},{...incoming,closed:true}),'stale');
  assert.equal(requestDisposition({...incoming,instructions:[['prompt','new']]},{...incoming,closed:false}),'request-conflict');
  assert.equal(requestDisposition({...incoming,status:{...incoming.status,account:'other'}},{...incoming,closed:false}),'account-conflict');
});
