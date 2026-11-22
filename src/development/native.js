import {requireThat,sourceEqual,sourcePath} from '../shared/domain.js';
import {EditorSource} from '../adapters/perchance/editor.js';
import {functionalFingerprint} from '../refresher/markers.js';

const API='https://ai-agent.perchance.org/api/aiAgent/';
const opaque=v=>typeof v==='string'&&v.length>0&&v.length<=512&&!/[\x00-\x1f]/.test(v);
export class NativeHelper {
  constructor({actions,store,native,reader,gate,wait=ms=>new Promise(r=>setTimeout(r,ms)),timeout=15000}){
    Object.assign(this,{actions,store,native,reader,gate,wait,timeout});this.tail=Promise.resolve();this.restore=[];this.listeners=[];
    this.editor=new EditorSource({page:actions.page,native,guard:async()=>{actions.selected();await actions.guard();}});
  }
  async until(test){for(let n=0;n<Math.ceil(this.timeout/100);n++){const value=await test();if(value)return value;await this.wait(100);}throw Error('helper-readiness-unconfirmed');}
  async record(id,change){return this.store.transact(s=>{const r=s.development?.[id];requireThat(r&&r.workerId===this.actions.workerId&&r.documentId===this.actions.documentId,'helper-document-changed');change(r,s);});}
  persist(id,change){this.tail=this.tail.then(()=>this.record(id,change));this.tail.catch(()=>{});return this.tail;}
  async scratch(){
    const p=this.actions.page,original=p.PerchanceSrc?.buildFilesPanel;let adapter=null;
    requireThat(typeof original==='function'&&typeof this.actions.exporter==='function','helper-scratch-interface-unavailable');
    const wrapped=this.actions.exporter(function(...args){adapter=args[1]?.scratchFs||null;return original.apply(this,args);},p);
    p.PerchanceSrc.buildFilesPanel=wrapped;
    try{const control=p.document.querySelector('#aiAgentSrcFilesBtn');requireThat(control&&!control.disabled,'helper-files-unavailable');control.click();await this.until(()=>adapter);}
    finally{if(p.PerchanceSrc.buildFilesPanel===wrapped)p.PerchanceSrc.buildFilesPanel=original;}
    requireThat(adapter?.ready&&adapter?.list&&adapter?.readFile&&adapter?.writeFile,'helper-scratch-interface-unavailable');
    await adapter.ready();return adapter;
  }
  activity(){const a=this.actions.page.aiAgentActivityState?.();requireThat(a&&typeof a.active==='boolean'&&typeof a.unknown==='boolean','helper-state-unavailable');return a;}
  observe(id,prompt){
    const p=this.actions.page,original=p.fetch,OriginalStream=p.EventSource,exporter=this.actions.exporter,self=this;
    requireThat(typeof original==='function'&&typeof OriginalStream==='function'&&typeof exporter==='function'&&typeof p.Promise==='function','helper-observer-unavailable');
    let active=true,attempt=null,session=null,dispatched=false,ack=null;
    const wrapped=exporter(function(...args){
      const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,'https://perchance.org');
      if(url.origin+url.pathname===API+'interrupt'){try{const body=JSON.parse(args[1]?.body);if(dispatched&&body.sessionId===session)self.persist(id,r=>{r.stopObserved=true;});}catch{}return original.apply(this,args);}
      if(url.origin+url.pathname!==API+'commit')return original.apply(this,args);
      const receiver=this,bodyText=args[1]?.body;let body;
      try{body=JSON.parse(bodyText);}catch{return p.Promise.reject('PCMS Helper request unconfirmed');}
      if(attempt&&body.attemptID!==attempt){self.persist(id,r=>{r.foreignTurn=true;});return original.apply(receiver,args);}
      return new p.Promise((resolve,reject)=>{
        Promise.resolve().then(async()=>{
          requireThat(active&&!dispatched,'helper-duplicate-submission');self.actions.selected();await self.actions.guard();
          requireThat(opaque(body.attemptID)&&opaque(body.sessionId)&&typeof body.text==='string'&&(body.text===prompt.trim()||body.text.endsWith('\n\n'+prompt.trim())),'helper-request-mismatch');
          requireThat(args[1]?.body===bodyText,'helper-request-changed');attempt=body.attemptID;session=body.sessionId;
          await self.record(id,r=>{requireThat(r.phase==='submitting'&&!r.commitSent,'helper-attempt-already-sent');r.nativeAttemptId=attempt;r.nativeSession=session;r.commitSent=true;});
          self.actions.selected();await self.actions.guard();requireThat(active&&args[1]?.body===bodyText,'helper-request-changed');dispatched=true;
          return original.apply(receiver,args);
        }).then(response=>{
          resolve(response);
          Promise.resolve().then(async()=>{const receipt=await response.clone().json();requireThat(response.ok&&receipt.ok===true&&!receipt.stopped&&receipt.delivery!=='cancelled','helper-admission-unconfirmed');await self.record(id,r=>{r.admitted=true;});ack={kind:'admitted'};}).catch(()=>{ack={kind:'unknown'};self.persist(id,r=>{r.admissionUnknown=true;});});
        }).catch(()=>{reject('PCMS Helper submission unavailable');ack={kind:'unknown'};});
      });
    },p);
    const WrappedStream=exporter(function(...args){
      const stream=new OriginalStream(...args),url=new URL(String(args[0]),'https://perchance.org');
      if(url.origin+url.pathname===API+'events'){
        const sid=url.searchParams.get('sessionId');
        const onMessage=exporter(event=>{
          if(!active)return;let m;try{m=JSON.parse(event.data);}catch{return;}
          if(!dispatched||sid!==session)return;
          if(m.t==='done'&&m.attemptID===attempt)self.persist(id,r=>{if(!r.terminal)r.terminal={attemptId:attempt,errored:m.errored===true,stopped:m.stopped===true||m.delivery==='cancelled',delivery:m.delivery||null};});
          if(m.t==='error')self.persist(id,r=>{r.streamError=true;});
          if(m.t==='connected')self.persist(id,r=>{r.streamGap=true;});
        },p);
        const onError=exporter(()=>{if(active&&dispatched&&sid===session)self.persist(id,r=>{r.streamGap=true;});},p);
        stream.addEventListener('message',onMessage);stream.addEventListener('error',onError);self.listeners.push(()=>{stream.removeEventListener('message',onMessage);stream.removeEventListener('error',onError);});
      }
      return stream;
    },p);
    p.fetch=wrapped;p.EventSource=WrappedStream;
    this.restore.push(()=>{active=false;if(p.fetch===wrapped)p.fetch=original;if(p.EventSource===WrappedStream)p.EventSource=OriginalStream;});
    return async()=>this.until(()=>ack);
  }
  dispose(){for(const fn of this.restore.splice(0))fn();for(const fn of this.listeners.splice(0))fn();}
  async stop(id,actions=this.actions){
    actions.capability('helper');await actions.guard();const r=(await this.store.read()).development?.[id];requireThat(r?.nativeAttemptId&&r.documentId===actions.documentId,'helper-attempt-unavailable');
    const p=actions.page,current=await p.__aiAgentDeliveryState?.();requireThat(current?.id===r.nativeAttemptId&&p.srcState.getDraftChatSid?.()===r.nativeSession,'helper-turn-changed');const stop=p.document.querySelector('#aiAgentStopBtn');requireThat(stop&&!stop.disabled,'helper-stop-unavailable');stop.click();
    return this.until(async()=>{const a=this.activity(),d=await p.__aiAgentDeliveryState?.();return !a.active&&!a.unknown&&d?.id===r.nativeAttemptId&&d.checked&&d.terminal&&!d.busy?{kind:'stopped'}:null;});
  }
  async resolve(id){
    await this.actions.guard();const r=(await this.store.read()).development?.[id];requireThat(r?.phase==='cancelled'&&r.documentId===this.actions.documentId,'cancelled-draft-unavailable');
    const a=this.activity();requireThat(!a.active&&!a.unknown,'helper-not-settled');
    if(r.sendInvoked){const d=await this.actions.page.__aiAgentDeliveryState?.();requireThat(d?.id===r.nativeAttemptId&&d.checked&&d.terminal&&!d.busy,'helper-result-unconfirmed');}
    const target={id:r.generatorId,slug:r.slug};await this.gate.requireOwner(target);const saved=await this.reader.saved(r.slug,r.generatorId),current=await this.editor.capture(target);
    requireThat(current.clean&&current.draftId===r.draftId&&sourceEqual(current.source,saved.source)&&sourceEqual(saved.source,r.baselineSource)&&saved.listing===r.originalListing,'draft-resolution-unconfirmed');
    return {kind:'resolved',draftId:current.draftId,listing:saved.listing,source:saved.source};
  }
  async inspect(id){
    await this.tail;const r=(await this.store.read()).development?.[id];if(!r||!['running','submitting'].includes(r.phase))return;
    const target={id:r.generatorId,slug:r.slug};
    const editor=new EditorSource({page:this.actions.page,native:this.native,guard:async()=>{const state=await this.store.read(),current=state.development?.[id];requireThat(current?.documentId===this.actions.documentId&&current.workerId===this.actions.workerId&&state.workers[current.workerId]?.documentId===this.actions.documentId,'helper-document-changed');}});
    try{
      const a=this.activity();if(a.active||a.unknown){await this.record(id,own=>{if(own.observation)own.observation.settled=false;});return;}
      const delivery=await this.actions.page.__aiAgentDeliveryState?.();
      const current=await editor.capture(target),p=this.actions.page;requireThat(typeof p.aiAgentWorkspaceSnapshot==='function','helper-workspace-unavailable');const workspace=await p.aiAgentWorkspaceSnapshot();
      const quiet=this.activity(),sid=p.srcState.getDraftChatSid?.();
      const settled=quiet.active===false&&quiet.unknown===false&&delivery?.id===r.nativeAttemptId&&delivery.checked===true&&delivery.terminal===true&&delivery.delivery==='delivered'&&delivery.state==='completed'&&!delivery.busy&&sid===r.nativeSession&&current.draftId===r.draftId&&!workspace?.unavailable&&!workspace?.preferWorkspace?.modelText&&!workspace?.preferWorkspace?.outputTemplate;
      await this.record(id,(own,state)=>{own.observation={workerPulse:state.workers[own.workerId]?.pulse??null,documentId:this.actions.documentId,draftId:current.draftId,nativeAttemptId:delivery?.id||null,terminalAttempt:r.terminal?.attemptId||null,settled};});
    }catch{ /* No new completion proof when the editor or native state cannot be read. */ }
  }
  async start(target,id){
    this.actions.capability('helper');this.actions.selected();await this.actions.guard();if(this.native.waitUntilReady)await this.native.waitUntilReady(target,{guard:this.actions.guard});await this.gate.requireOwner(target);
    const r=(await this.store.read()).development?.[id];requireThat(r&&r.phase==='starting'&&!r.sendInvoked,'helper-start-not-replayable');
    const current=await this.editor.capture(target),saved=await this.reader.saved(target.slug,target.id);
    requireThat(current.clean&&sourceEqual(current.source,saved.source)&&saved.listing===r.originalListing,'dirty-or-stale-editor');
    if(r.baselineFingerprint)requireThat(await functionalFingerprint(saved.source)===r.baselineFingerprint,'source-drift');
    const p=this.actions.page;
    if(!p.document.querySelector('#aiAgentInputEl')){const show=p.document.querySelector('#showAiHelperBtn .toggleBtn');requireThat(show,'helper-control-unavailable');show.click();}
    await this.until(()=>p.document.querySelector('#aiAgentInputEl')&&typeof p.aiAgentActivityState==='function');
    await this.until(()=>{const a=this.activity();return !a.active&&!a.unknown;});
    requireThat(!p.srcState.getDraftChatSid?.(),'helper-existing-chat');
    const input=p.document.querySelector('#aiAgentInputEl'),send=p.document.querySelector('#aiAgentSendBtn');
    requireThat(input&&!input.value&&send&&!send.disabled,'helper-input-held');
    await this.store.transact(s=>{const own=s.development[id];requireThat(own?.phase==='starting'&&!own.sendInvoked,'helper-start-not-replayable');Object.assign(own,{workerId:this.actions.workerId,documentId:this.actions.documentId,draftId:current.draftId,baselineSource:saved.source});});
    const admission=this.observe(id,r.prompt);
    if(Object.keys(r.scratch).length){
      const fs=await this.scratch(),listing=await fs.list();
      for(const [path,bytes] of Object.entries(r.scratch)){
        sourcePath(path);this.actions.selected();await this.actions.guard();
        if(Object.hasOwn(listing,path)){const existing=Array.from(new Uint8Array(await fs.readFile(path)));requireThat(JSON.stringify(existing)===JSON.stringify(bytes),'helper-scratch-conflict');}
        else await fs.writeFile(path,new Uint8Array(bytes).buffer);
        requireThat(JSON.stringify(Array.from(new Uint8Array(await fs.readFile(path))))===JSON.stringify(bytes),'helper-scratch-readback-mismatch');
      }
    }
    const fresh=await this.editor.capture(target);requireThat(fresh.draftId===current.draftId&&fresh.clean&&sourceEqual(fresh.source,saved.source)&&!input.value,'helper-draft-changed');
    const a=this.activity();requireThat(!a.active&&!a.unknown&&!send.disabled,'helper-not-settled');
    await this.record(id,own=>{requireThat(!own.sendInvoked,'helper-start-not-replayable');own.sendInvoked=true;own.phase='submitting';});
    this.actions.selected();await this.actions.guard();requireThat(!input.value,'helper-input-held');
    input.value=r.prompt;input.dispatchEvent(new p.Event('input',{bubbles:true}));requireThat(input.value===r.prompt&&!send.disabled,'helper-input-unconfirmed');send.click();
    return admission();
  }
}
