import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {cp,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {bundle} from '../../scripts/build.mjs';

async function policy(profile){
 const dir=await mkdtemp(join(tmpdir(),'pcms-profile-'));
 try{
  await cp(resolve('src'),dir,{recursive:true});
  const entry=join(dir,'policy.user.js');
  await writeFile(entry,`// ==UserScript==
// @name PCMS
// @description policy fixture
// ==/UserScript==
import {BUILD_MODE,OPERATOR_TEST} from './runtime/build-mode.js';
import {LIVE_CAPABILITIES,requireLiveCapability,SessionGate} from './adapters/perchance/session.js';
import {INTEGRATION_PROOF,requireGitHubWriteProof} from './runtime/context.js';
import {emptyState} from './state/store.js';
import {publicSnapshot} from './ui/shell.js';
globalThis.policy={BUILD_MODE,OPERATOR_TEST,LIVE_CAPABILITIES,requireLiveCapability,SessionGate,INTEGRATION_PROOF,requireGitHubWriteProof,emptyState,publicSnapshot};`);
  const code=await bundle(entry,dir,{profile});const context={structuredClone,TextEncoder};vm.runInNewContext(code,context);return context.policy;
 }finally{await rm(dir,{recursive:true,force:true});}
}

test('operator test enables every capability while the default build stays closed',async()=>{
 for(const profile of ['inspection','operator-test']){
  const p=await policy(profile),enabled=profile==='operator-test';assert.equal(p.BUILD_MODE,profile);assert.equal(p.OPERATOR_TEST,enabled);
  assert.deepEqual(Object.keys(p.LIVE_CAPABILITIES),['save','create','rename','listing','helper']);
  for(const key of Object.keys(p.LIVE_CAPABILITIES)){assert.equal(p.LIVE_CAPABILITIES[key],enabled);if(enabled)assert.doesNotThrow(()=>p.requireLiveCapability(key));else assert.throws(()=>p.requireLiveCapability(key),/not-live-verified/);}
  assert.equal(p.INTEGRATION_PROOF.githubWrite,enabled);if(enabled)assert.doesNotThrow(()=>p.requireGitHubWriteProof());else assert.throws(()=>p.requireGitHubWriteProof(),/not-live-verified/);
  assert.throws(()=>p.requireLiveCapability('arbitrary-browser-rpc'),/not-live-verified/);
  assert.ok(Object.isFrozen(p.LIVE_CAPABILITIES)&&Object.isFrozen(p.INTEGRATION_PROOF));
 }
});

test('enabled bundle preserves session, ownership, account lock and publication guards',async()=>{
 const p=await policy('operator-test'),state=p.emptyState();assert.equal(state.settings.refreshPaused,true);
 const store={read:async()=>structuredClone(state),transact:async fn=>fn(state)};let signedIn=false,owns=false;
 const gate=new p.SessionGate(store,{session:async()=>({signedIn,stamp:'same-session'}),ownership:async()=>owns});
 await gate.bind('alpha');await assert.rejects(gate.confirm(false),/manual-confirmation/);await assert.rejects(gate.confirm(true),/sign-in/);
 signedIn=true;await gate.confirm(true);await assert.rejects(gate.requireOwner({slug:'test-owned-generator',account:'other'}),/account-assignment/);
 await assert.rejects(gate.requireOwner({slug:'test-owned-generator',account:'alpha'}),/owner-mismatch/);assert.equal(state.settings.account.confirmed,false);
 owns=true;await gate.confirm(true);await gate.requireOwner({slug:'test-owned-generator',account:'alpha'});
 state.settings.account.locked=true;await assert.rejects(gate.bind('different'),/locked/);
 const request={repository:{owner:'synthetic',name:'repo'},status:{account:'alpha',action:'develop',state:'review'}};
 state.generators['123']={id:'123',slug:'test-owned-generator',listing:'listed',holds:[],savedVerified:true,status:request.status};
 state.development={dev:{id:'dev',generatorId:'123',slug:'test-owned-generator',phase:'review',request}};
 state.edits={edit:{id:'edit',generatorId:'123',phase:'editing'}};
 const view=p.publicSnapshot(state,{coordinator:'Verified'});assert.equal(view.development[0].canPublish,true);assert.equal(view.generators[0].edit.canPublish,true);
 state.settings.account.confirmed=false;assert.equal(p.publicSnapshot(state,{coordinator:'Verified'}).generators[0].edit.canPublish,false);
 signedIn=false;await assert.rejects(gate.requireOwner({slug:'test-owned-generator',account:'alpha'}),/sign-in/);
});

test('build profiles are explicit, deterministic and keep the installed script identity',async()=>{
 const entry=resolve('src/entry.user.js'),standard=await bundle(entry),enabled=await bundle(entry,resolve('src'),{profile:'operator-test'});
 assert.equal(enabled,await bundle(entry,resolve('src'),{profile:'operator-test'}));assert.notEqual(standard,enabled);
 for(const key of ['name','namespace','version'])assert.equal(standard.match(new RegExp('@'+key+'\\s+([^\\n]+)'))[1],enabled.match(new RegExp('@'+key+'\\s+([^\\n]+)'))[1]);
 assert.match(enabled,/@description\s+Operator testing build: real writes enabled/);assert.match(standard,/const BUILD_MODE = "inspection"/);
 await assert.rejects(bundle(entry,resolve('src'),{profile:'enabled'}),/Unknown build profile/);
});
