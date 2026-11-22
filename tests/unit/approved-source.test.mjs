import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testStore} from '../fixtures/store.mjs';
import {ApprovedSource,beforeApprovedSave,bindApprovedDraft,approvedRecord} from '../../src/state/approved-source.js';
import {ProtectedStore} from '../../src/state/store.js';
import {NativeActions} from '../../src/adapters/perchance/actions.js';

async function fixture(){
  const {store,data}=testStore(),source={pjs:'approved',html:'<p>approved</p>',files:{'binary.bin':[0,255],'empty.txt':[]}};
  const current={id:'123',slug:'target-slug',draftId:'draft-1',workerId:'retained-1',documentId:'document-1',source,settled:true};
  const update={id:'approval-1',generatorId:'123',slug:'target-slug',repository:{owner:'synthetic',name:'original'},baseCommit:'a'.repeat(40),kind:'source',status:{account:'alpha',action:'develop',state:'done'},listingIntent:'unlisted',previousSource:{pjs:'previous',html:'<p>previous</p>',files:{'removed.bin':[5]}}};
  const service=new ApprovedSource({store,capture:async()=>structuredClone(current),now:()=>100});
  const candidate=await service.prepare(update,{id:'explicit-approval',kind:'review'});return {store,data,service,candidate,current,update};
}
test('approval captures complete immutable source, original repository and retained identities; restart verifies the same snapshot',async()=>{
  const f=await fixture();assert.equal((await f.store.read()).pending['approval-1'],undefined);
  await assert.rejects(f.service.confirm(f.candidate,false),/confirmation-required/);assert.equal((await f.store.read()).pending['approval-1'],undefined);
  const saved=await f.service.confirm(f.candidate,true);assert.deepEqual(saved.source.files['binary.bin'],[0,255]);assert.deepEqual(saved.source.files['empty.txt'],[]);assert.equal(saved.repository.name,'original');assert.equal(saved.approval.documentId,'document-1');
  const restarted=new ProtectedStore({get:async k=>f.data.get(k),set:async(k,v)=>{f.data.set(k,v);},locks:{request:(_k,_o,run)=>run()}});
  assert.deepEqual(await beforeApprovedSave(restarted,'approval-1',f.current,'explicit-approval',f.candidate),saved);
});
test('source, files, draft, tab, document and identity changes after approval cannot authorize Save',async()=>{
  for(const change of [c=>{c.source.html='changed';},c=>{delete c.source.files['empty.txt'];},c=>{c.source.files['binary.bin']=[0,254];},c=>{c.draftId='another-draft';},c=>{c.documentId='new-document';},c=>{c.workerId='another-tab';},c=>{c.id='456';},c=>{c.slug='another-slug';}]){
    const f=await fixture();change(f.current);await assert.rejects(f.service.confirm(f.candidate,true),/approved-(?:source|context)-changed/);assert.equal((await f.store.read()).pending['approval-1'],undefined);
  }
});
test('active, queued or unverified Helper state cannot authorize approved source',async()=>{
  const f=await fixture();f.current.settled=false;await assert.rejects(f.service.prepare(f.update,{id:'second',kind:'review'}),/not-settled/);await assert.rejects(f.service.confirm(f.candidate,true),/approved-source-changed/);
});
test('quota/readback failure retains prior live source and never returns a Save authorization',async()=>{
  const f=await fixture();f.store.set=async()=>{throw Error('quota');};await assert.rejects(f.service.confirm(f.candidate,true),/unconfirmed/);assert.equal((await f.store.read()).pending['approval-1'],undefined);
  const g=await fixture(),original=g.store.set;g.store.set=async(k,v)=>original(k,v+'broken');await assert.rejects(g.service.confirm(g.candidate,true),/unconfirmed/);assert.ok(g.data.get('PCMS_STORE_V1').endsWith('broken'));
});
test('a post-storage draft change keeps the confirmed source snapshot but prevents Save',async()=>{
  const f=await fixture();let reads=0;f.service.capture=async()=>{if(++reads===2)f.current.source.pjs='changed while persisting';return structuredClone(f.current);};await assert.rejects(f.service.confirm(f.candidate,true),/approved-source-changed/);
  const p=(await f.store.read()).pending['approval-1'];assert.equal(p.source.pjs,'approved');assert.equal(p.phase,'prepared');
});
test('stored original repository/Listing/approval cannot change between confirmation and Save',async()=>{
  const f=await fixture();await f.service.confirm(f.candidate,true);await f.store.transact(s=>{s.pending['approval-1'].repository.name='changed';});
  await assert.rejects(beforeApprovedSave(f.store,'approval-1',f.current,'explicit-approval',f.candidate),/snapshot-readback-mismatch/);
  assert.throws(()=>approvedRecord({...f.candidate,listingIntent:'unknown'}),/listing/);
  await assert.rejects(bindApprovedDraft(f.store,'approval-1',{...f.candidate.approval,id:'different'},f.current),/already-bound/);
});

async function deploymentFixture(){
  const f=await fixture(),files={'removed.bin':[5]},page={perchanceSaveState:'saved'};
  for(const [key,text] of [['modelTextEditor','previous'],['outputTemplateEditor','<p>previous</p>']]){let value=text;page[key]={getValue:()=>value,setValue:v=>{value=v;page.perchanceSaveState='unsaved';},isClean:()=>page.perchanceSaveState==='saved'};}
  page.srcState={idle:async()=>{},list:async()=>Object.fromEntries(Object.keys(files).map(p=>[p,{}])),readFile:async p=>files[p],writeFile:async(p,b)=>{files[p]=Array.from(b);},deleteFile:async p=>{delete files[p];},isDirty:()=>page.perchanceSaveState!=='saved',hasPending:()=>false};
  const target={id:'123',slug:'target-slug'};await f.store.retainSource({...f.update,source:f.current.source,draftId:null,retainedTab:null});
  const actions=new NativeActions({store:f.store,page,workerId:'utility',documentId:'doc',actionId:'save-once',doc:{visibilityState:'hidden'},capability:()=>{},gate:{requireOwner:async()=>{}},native:{ready:async()=>({...target,draftId:'native-draft'})}});let saves=0;
  actions.receipt=async()=>{saves++;return {status:'saved',name:target.slug};};return {...f,actions,target,page,saves:()=>saves};
}
test('Utility native deploy uses the same exact stored source proof immediately before its Save',async()=>{
  const f=await deploymentFixture();await f.actions.deploy(f.target,'approval-1');assert.equal(f.saves(),1);const p=(await f.store.read()).pending['approval-1'];assert.equal(p.approval.kind,'github');assert.equal(p.approval.workerId,'utility');assert.equal(p.approval.documentId,'doc');assert.equal(p.retainedTab,'utility');assert.deepEqual(p.source.files['empty.txt'],[]);
});
test('Utility snapshot proof write failure leaves staged draft and confirmed source recoverable without Save',async()=>{
  const f=await deploymentFixture();f.store.set=async()=>{throw Error('quota');};await assert.rejects(f.actions.deploy(f.target,'approval-1'),/unconfirmed/);assert.equal(f.saves(),0);assert.equal(f.page.modelTextEditor.getValue(),'approved');assert.equal((await f.store.read()).pending['approval-1'].source.pjs,'approved');
});
