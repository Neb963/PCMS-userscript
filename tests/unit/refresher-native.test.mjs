import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testStore} from '../fixtures/store.mjs';
import {NativeRefresher,checkRefreshRequest} from '../../src/refresher/native.js';
import {functionalFingerprint,refreshMarkers} from '../../src/refresher/markers.js';

async function fixture(){
  const {store}=testStore(),previous={pjs:'output\n  example',html:'<!doctype html>[output]',files:{'binary.bin':[0,255],'empty.bin':[]}},live={id:'123',slug:'target-slug',listing:'listed',source:structuredClone(previous),revision:{saveCount:1}},manifest={'binary.bin':{key:'binary-key',size:2},'empty.bin':{key:'empty-key',size:0}};
  const fingerprint=await functionalFingerprint(previous);
  await store.transact(s=>{s.generators['123']={id:'123',slug:'target-slug',listing:'listed',status:{account:'alpha',action:'publish_from_github',state:'done'},holds:[],savedVerified:true,ownerVerified:true,verifiedFingerprint:fingerprint};});
  let pjs=previous.pjs,html=previous.html,draft='draft',visible=false,mode='saved',saves=0,requestChange=null;
  const page={modelTextEditor:{getValue:()=>pjs,setValue:v=>{pjs=v;},isClean:()=>pjs===live.source.pjs},outputTemplateEditor:{getValue:()=>html,setValue:v=>{html=v;},isClean:()=>html===live.source.html},srcState:{idle:async()=>{},list:async()=>structuredClone(manifest),readFile:async p=>previous.files[p],isDirty:()=>false,hasPending:()=>false,writeFile:()=>assert.fail('Refresher must not write src'),deleteFile:()=>assert.fail('Refresher must not delete src')},recomputeSaveState:()=>{}};
  Object.defineProperty(page,'perchanceSaveState',{get:()=>pjs===live.source.pjs&&html===live.source.html?'saved':'unsaved'});
  const native={ready:async()=>({id:'123',slug:'target-slug',draftId:draft})},reader={saved:async()=>structuredClone(live),metadata:async()=>({id:live.id,slug:live.slug,listing:live.listing,revision:live.revision,manifest})},gate={requireOwner:async()=>true};
  const actions={page,workerId:'refresher',documentId:'document',capability:()=>{},guard:async()=>{},selected:()=>{if(visible)throw Error('operator-selected-tab');},receipt:async(_p,_invoke,_matches,options)=>{
    const body={generator:{name:live.slug,modelText:pjs,outputTemplate:html},srcManifest:structuredClone(manifest)};if(requestChange)requestChange(body);await options.allow(body);options.onDispatch();saves++;
    if(mode==='failed')return {status:'too-many-requests',name:live.slug};
    live.source={pjs,html,files:structuredClone(previous.files)};live.revision.saveCount++;
    if(mode==='missing-marker')live.source.html=previous.html;
    if(mode==='unlisted')live.listing='unlisted';
    if(mode==='lost')throw Error('timeout');
    return {status:mode==='unexpected-fork'?'created':'saved',name:mode==='unexpected-fork'?'fork-slug':live.slug};
  }};
  const worker=new NativeRefresher({actions,store,native,reader,gate}),target={id:'123',slug:'target-slug',account:'alpha'};
  async function prepared(){assert.equal((await worker.prepare(target,'attempt-one')).kind,'prepared');await store.transact(s=>{s.attempts.push({id:'attempt-one',generatorId:'123',at:0,logicalAt:0,spacingAt:0,counted:true,outcome:'unknown'});});}
  return {store,worker,target,previous,live,actions,reader,prepared,saves:()=>saves,mode:value=>{mode=value;},visible:value=>{visible=value;},draft:value=>{draft=value;},dirty:()=>{pjs='operator draft';},changeRequest:fn=>{requestChange=fn;}};
}
test('dedicated refresh changes only owned markers and confirms one acknowledged Listed Save',async()=>{
  const f=await fixture();await f.prepared();const p=(await f.store.read()).refreshDrafts['attempt-one'];assert.deepEqual(p.previousSource,f.previous);assert.equal(await functionalFingerprint(p.source),await functionalFingerprint(f.previous));const result=await f.worker.save(f.target,'attempt-one');assert.equal(result.kind,'confirmed');assert.equal(f.saves(),1);assert.deepEqual(refreshMarkers(f.live.source),{pjs:'attempt-one',html:'attempt-one'});assert.deepEqual(f.live.source.files,f.previous.files);assert.equal((await f.store.read()).refreshDrafts['attempt-one'].phase,'verified');
});
test('dirty/selected editor, missing baseline, Listing change and external source drift cannot begin a Save',async()=>{
  for(const setup of [async f=>f.dirty(),async f=>f.visible(true),async f=>f.store.transact(s=>{delete s.generators['123'].verifiedFingerprint;}),async f=>{f.live.listing='unlisted';},async f=>{f.live.source.pjs='external';}]){const f=await fixture();await setup(f);const result=await f.worker.prepare(f.target,'attempt-one');assert.equal(result.kind,'skipped');assert.equal(result.notSent,true);assert.equal(f.saves(),0);assert.equal((await f.store.read()).attempts.length,0);}
});
test('same draft/document and complete staged source are rechecked immediately before native dispatch',async()=>{
  const f=await fixture();await f.prepared();f.draft('different-draft');const result=await f.worker.save(f.target,'attempt-one');assert.equal(result.kind,'skipped');assert.equal(result.notSent,true);assert.equal(f.saves(),0);
  const g=await fixture();await g.prepared();g.changeRequest(body=>{delete body.srcManifest['empty.bin'];});assert.equal((await g.worker.save(g.target,'attempt-one')).kind,'skipped');assert.equal(g.saves(),0);
});
test('known rejected Save counts as failure and can restore its own marker draft without saving again',async()=>{
  const f=await fixture();await f.prepared();f.mode('failed');const result=await f.worker.save(f.target,'attempt-one');assert.equal(result.kind,'failed');assert.equal(result.reusable,true);assert.equal(result.hold,null);assert.equal(f.saves(),1);assert.equal(f.actions.page.modelTextEditor.getValue(),f.previous.pjs);assert.deepEqual(f.live.source,f.previous);
});
test('lost receipt, unexpected fork, missing saved marker or unexpected Unlisting never confirms refresh',async()=>{
  for(const mode of ['lost','unexpected-fork','missing-marker','unlisted']){const f=await fixture();await f.prepared();f.mode(mode);const result=await f.worker.save(f.target,'attempt-one');assert.equal(result.kind,'unknown',mode);assert.equal(f.saves(),1);assert.notEqual((await f.store.read()).refreshDrafts['attempt-one'].phase,'verified');}
});
test('native refresh request cannot change panel content, src path set, key or byte length',()=>{
  const source={pjs:'pjs',html:'html',files:{'a.bin':[0,255]}},manifest={'a.bin':{key:'expected',size:2}},body={generator:{modelText:'pjs',outputTemplate:'html'},srcManifest:{'a.bin':{key:'expected',size:2}}};checkRefreshRequest(body,source,manifest);
  for(const change of [b=>{b.generator.modelText='wrong';},b=>{b.srcManifest={};},b=>{b.srcManifest['a.bin'].key='different';},b=>{b.srcManifest['a.bin'].size=1;}]){const value=structuredClone(body);change(value);assert.throws(()=>checkRefreshRequest(value,source,manifest),/refresh-request/);}
});
