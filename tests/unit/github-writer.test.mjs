import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubWriter, sourceChanges, statusChanges } from '../../src/adapters/github/writer.js';
import { blobHash, base64ToBytes } from '../../src/adapters/github/reader.js';
import { emptyState } from '../../src/state/store.js';

async function fixture() {
  const repo={owner:'synthetic',name:'repo'},commit='a'.repeat(40),treeSha='b'.repeat(40),next='c'.repeat(40),newTree='d'.repeat(40);
  const baseline={repository:repo,commit,treeSha,entries:{}};
  for(const path of ['main.pjs','main.html','status.md','src/old.bin','prompt.md']) {const full='synthetic-generator/'+path;baseline.entries[full]={path:full,type:'blob',mode:'100644',sha:await blobHash(new TextEncoder().encode('old-'+path))};}
  const s=emptyState(),calls=[],history=[];let current=structuredClone(baseline),planned=null,lose=false;
  const store={read:async()=>structuredClone(s),transact:async fn=>fn(s),prepareAction:async j=>{s.jobs[j.id]={...j,phase:'prepared'};},markDispatched:async id=>{s.jobs[id].phase='dispatched';}};
  const reader={repository:repo,snapshot:async()=>structuredClone(current),head:async()=>current.commit,api:async(path,options={})=>{
    calls.push({path,options});
    if(path==='/git/blobs')return {sha:await blobHash(base64ToBytes(options.body.content))};
    if(path==='/git/trees'){planned=options.body.tree;return {sha:newTree};}
    if(path==='/git/commits'){history.push({sha:next,commit:{message:options.body.message,tree:{sha:newTree}}});return {sha:next};}
    if(path==='/git/refs/heads/main'){
      assert.equal(options.body.force,false);current.commit=next;current.treeSha=newTree;
      for(const e of planned){if(e.sha===null)delete current.entries[e.path];else current.entries[e.path]={...e};}
      if(lose)throw Error('lost-response');return {object:{sha:next}};
    }
    if(path.startsWith('/commits?'))return structuredClone(history);
    throw Error('unexpected');
  }};
  return {baseline,reader,store,calls,s,lose:()=>{lose=true;},advance:()=>{current.commit='e'.repeat(40);},writer:new GitHubWriter({reader,store,locks:{request:(_k,_o,run)=>run()},guard:async()=>{}})};
}
const status={account:'alpha',action:'develop',state:'done'};
test('complete source is atomic, removes obsolete src and retains instructions',async()=>{
  const f=await fixture(),source={pjs:'new pjs',html:'new html',files:{'new.bin':[0,255]}};
  const changes=sourceChanges(f.baseline,'synthetic-generator',source,status);
  assert.equal(changes['synthetic-generator/src/old.bin'],null);
  const result=await f.writer.write({id:'write-1',targetSlug:'synthetic-generator',baseline:f.baseline,changes});
  assert.equal(result.verified,true);const current=await f.reader.snapshot();
  assert.equal(current.entries['synthetic-generator/src/old.bin'],undefined);
  assert.equal(current.entries['synthetic-generator/prompt.md'].sha,f.baseline.entries['synthetic-generator/prompt.md'].sha);
  assert.equal(f.calls.filter(c=>c.path==='/git/commits').length,1);
  assert.deepEqual(Object.keys(statusChanges('synthetic-generator',status)),['synthetic-generator/status.md']);
});
test('lost ref response reconciles without repeating commit or ref update',async()=>{
  const f=await fixture();f.lose();
  await assert.rejects(f.writer.write({id:'write-unknown',targetSlug:'synthetic-generator',baseline:f.baseline,changes:statusChanges('synthetic-generator',status),operation:'status'}),/unknown/);
  assert.equal(f.s.jobs['write-unknown'].phase,'unknown');
  assert.equal((await f.writer.reconcile('write-unknown')).verified,true);
  assert.equal((await f.writer.write({id:'write-unknown',targetSlug:'synthetic-generator',baseline:f.baseline,changes:statusChanges('synthetic-generator',status),operation:'status'})).verified,true);
  assert.equal(f.calls.filter(c=>c.path==='/git/commits').length,1);assert.equal(f.calls.filter(c=>c.path==='/git/refs/heads/main').length,1);
});
test('changed same-generator baseline and head race never overwrite new main',async()=>{
  const f=await fixture();const changed=structuredClone(f.baseline);changed.entries['synthetic-generator/prompt.md'].sha='f'.repeat(40);
  await assert.rejects(f.writer.write({id:'conflict',targetSlug:'synthetic-generator',baseline:changed,changes:statusChanges('synthetic-generator',status)}),/generator-conflict/);
  const g=await fixture();const oldApi=g.reader.api;g.reader.api=async(path,o)=>{const r=await oldApi(path,o);if(path==='/git/commits')g.advance();return r;};
  await assert.rejects(g.writer.write({id:'race',targetSlug:'synthetic-generator',baseline:g.baseline,changes:statusChanges('synthetic-generator',status)}),/head-conflict/);
  assert.equal(g.calls.filter(c=>c.path==='/git/refs/heads/main').length,0);
});
test('fresh reconciliation detects a superseding edit after an earlier verified receipt',async()=>{
  const f=await fixture();await f.writer.write({id:'landed',targetSlug:'synthetic-generator',baseline:f.baseline,changes:statusChanges('synthetic-generator',status),operation:'status'});
  const current=await f.reader.snapshot();current.entries['synthetic-generator/status.md'].sha='f'.repeat(40);f.reader.snapshot=async()=>structuredClone(current);
  assert.equal((await f.writer.reconcile('landed',{fresh:true})).superseded,true);assert.equal((await f.writer.reconcile('landed')).superseded,true);assert.equal(f.calls.filter(c=>c.path==='/git/refs/heads/main').length,1);
});
