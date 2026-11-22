import assert from 'node:assert/strict';
import {testStore} from './store.mjs';
import {NativeHelper} from '../../src/development/native.js';
export async function helperFixture({mode='admitted',scratch={}}={}){
  const {store}=testStore(),source={pjs:'output\n  fixture',html:'[output]',files:{}},target={id:'123',slug:'synthetic-target',account:'alpha'};
  await store.transact(s=>{s.development={dev:{id:'dev',generatorId:target.id,slug:target.slug,phase:'starting',prompt:'Build a synthetic fixture.',scratch,originalListing:'listed',workerId:null,sendInvoked:false}};});
  const scratchFiles={},streams=[],input={value:'',dispatchEvent:()=>{}},controls={};let sends=0,dispatches=0;
  class Stream extends EventTarget{constructor(url){super();this.url=url;streams.push(this);}emit(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}}
  const page={Promise,Event,EventSource:Stream,document:{querySelector:selector=>controls[selector]||null},PerchanceSrc:{buildFilesPanel:()=>({})},modelTextEditor:{getValue:()=>source.pjs,isClean:()=>true},outputTemplateEditor:{getValue:()=>source.html,isClean:()=>true},perchanceSaveState:'saved',srcState:{idle:async()=>{},list:()=>({}),isDirty:()=>false,hasPending:()=>false,getDraftChatSid:()=>null},aiAgentActivityState:()=>({active:false,unknown:false}),fetch:async()=>{dispatches++;if(mode==='lost')throw Error('connection lost');return new Response(JSON.stringify({ok:mode!=='rejected',inputID:'input'}));}};
  const fs={ready:async()=>{},list:()=>Object.fromEntries(Object.keys(scratchFiles).map(k=>[k,{size:scratchFiles[k].length}])),readFile:async p=>Uint8Array.from(scratchFiles[p]).buffer,writeFile:async(p,buf)=>{scratchFiles[p]=Array.from(new Uint8Array(buf));}};
  controls['#aiAgentInputEl']=input;controls['#aiAgentSendBtn']={disabled:false,click:()=>{sends++;new page.EventSource('https://ai-agent.perchance.org/api/aiAgent/events?sessionId=native-session');const text=mode==='mismatch'?'different':input.value;page.fetch('https://ai-agent.perchance.org/api/aiAgent/commit',{body:JSON.stringify({sessionId:'native-session',attemptID:'native-attempt',text})}).catch(()=>{});}};
  controls['#aiAgentSrcFilesBtn']={disabled:false,click:()=>page.PerchanceSrc.buildFilesPanel(page.srcState,{scratchFs:fs})};
  const actions={page,workerId:'worker',documentId:'doc',exporter:fn=>fn,capability:()=>{},selected:()=>{},guard:async()=>{}},native={ready:async()=>({...target,draftId:'draft'})},reader={saved:async()=>({...target,source:structuredClone(source),listing:'listed'})};
  const helper=new NativeHelper({actions,store,native,reader,gate:{requireOwner:async()=>true},wait:()=>new Promise(r=>setTimeout(r,0)),timeout:10000});
  return {store,helper,target,page,actions,controls,scratchFiles,streams,source,input,sends:()=>sends,dispatches:()=>dispatches,emit:value=>{assert.ok(streams.length);streams.at(-1).emit(value);}};
}
