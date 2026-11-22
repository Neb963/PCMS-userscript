import {test} from 'node:test';
import assert from 'node:assert/strict';
import {helperFixture} from '../fixtures/helper.mjs';

test('native Helper stages optional scratch separately and sends one durable correlated prompt',async()=>{
  const f=await helperFixture({scratch:{'AGENTS.md':[65,66]}});try{
    assert.equal((await f.helper.start(f.target,'dev')).kind,'admitted');const r=(await f.store.read()).development.dev;
    assert.equal(f.sends(),1);assert.equal(f.dispatches(),1);assert.equal(r.admitted,true);assert.equal(r.nativeAttemptId,'native-attempt');assert.equal(r.draftId,'draft');assert.deepEqual(f.scratchFiles['AGENTS.md'],[65,66]);assert.deepEqual(r.baselineSource,f.source);assert.equal(f.page.perchanceSaveState,'saved');
    await assert.rejects(f.helper.start(f.target,'dev'),/not-replayable/);assert.equal(f.sends(),1);
  }finally{f.helper.dispose();}
});
test('absent scratch needs no Files panel; admission loss and mismatch are not successes or replay permission',async()=>{
  for(const mode of ['admitted','lost','mismatch','rejected']){const f=await helperFixture({mode});delete f.controls['#aiAgentSrcFilesBtn'];try{const r=await f.helper.start(f.target,'dev');assert.equal(r.kind,mode==='admitted'?'admitted':'unknown');assert.equal(f.sends(),1);assert.equal(f.dispatches(),mode==='mismatch'?0:1);await assert.rejects(f.helper.start(f.target,'dev'),/not-replayable/);}finally{f.helper.dispose();}}
});
test('existing input, chat binding, dirty source and scratch collisions preserve operator work without Send',async()=>{
  for(const change of [f=>{f.input.value='operator input';},f=>{f.page.srcState.getDraftChatSid=()=> 'prior-chat';},f=>{f.page.perchanceSaveState='unsaved';},f=>{f.scratchFiles['AGENTS.md']=[99];}]){
    const f=await helperFixture({scratch:{'AGENTS.md':[65]}});change(f);try{await assert.rejects(f.helper.start(f.target,'dev'));assert.equal(f.sends(),0);assert.equal(f.dispatches(),0);if(f.input.value)assert.equal(f.input.value,'operator input');}finally{f.helper.dispose();}
  }
});
test('storage failure before Send cannot dispatch a prompt',async()=>{
  const f=await helperFixture(),set=f.store.set;f.store.set=async(k,v)=>{if(v.includes('"sendInvoked":true'))throw Error('quota');return set(k,v);};try{await assert.rejects(f.helper.start(f.target,'dev'),/storage-write/);assert.equal(f.sends(),0);assert.equal(f.dispatches(),0);}finally{f.helper.dispose();}
});
test('native commit cannot be duplicated, and only matching fresh stream facts are retained',async()=>{
  const f=await helperFixture();try{
    await f.helper.start(f.target,'dev');await assert.rejects(f.page.fetch('https://ai-agent.perchance.org/api/aiAgent/commit',{body:JSON.stringify({sessionId:'native-session',attemptID:'native-attempt',text:f.input.value})}));assert.equal(f.dispatches(),1);
    f.emit({t:'done',attemptID:'old-attempt'});await f.helper.tail;assert.equal((await f.store.read()).development.dev.terminal,undefined);
    f.emit({t:'done',attemptID:'native-attempt',errored:false});await f.helper.tail;assert.equal((await f.store.read()).development.dev.terminal.attemptId,'native-attempt');
  }finally{f.helper.dispose();}
});

test('completion observation requires same chat/draft, native checked receipt, no queued work and settled workspace',async()=>{
  const f=await helperFixture();try{
    await f.helper.start(f.target,'dev');f.emit({t:'done',attemptID:'native-attempt'});await f.helper.tail;
    f.page.__aiAgentDeliveryState=async()=>({id:'native-attempt',checked:true,terminal:true,delivery:'delivered',state:'completed',busy:false});f.page.aiAgentWorkspaceSnapshot=async()=>null;
    await f.helper.inspect('dev');assert.equal((await f.store.read()).development.dev.observation.settled,true);
    f.page.srcState.getDraftChatSid=()=> 'different-chat';await f.helper.inspect('dev');assert.equal((await f.store.read()).development.dev.observation.settled,false);
    f.page.srcState.getDraftChatSid=()=> 'native-session';f.page.aiAgentWorkspaceSnapshot=async()=>({unavailable:true});await f.helper.inspect('dev');assert.equal((await f.store.read()).development.dev.observation.settled,false);
    f.page.aiAgentWorkspaceSnapshot=async()=>null;f.page.aiAgentActivityState=()=>({active:true,unknown:false});await f.helper.inspect('dev');assert.equal((await f.store.read()).development.dev.observation.settled,false);
  }finally{f.helper.dispose();}
});
