import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceEqual,parseStatus} from '../../src/shared/domain.js';
import {testStore} from '../fixtures/store.mjs';
import {Publication} from '../../src/workflows/publication.js';
import {Reservation} from '../../src/workflows/reservation.js';
import {EditorSource} from '../../src/adapters/perchance/editor.js';

async function fixture({created=false,listing='listed'}={}){
  const {store}=testStore(),repository={owner:'synthetic',name:'repo'},request={valid:true,slug:'target-slug',repository,commit:'a'.repeat(40),requestCommit:'a'.repeat(40),status:{account:'alpha',action:'publish_from_github',state:'ready'},instructions:[]};
  const source={pjs:'output\n  published',html:'<p>published</p>',files:{'new.bin':[0,255]}},previous={pjs:'output\n  previous',html:'<p>previous</p>',files:{'old.txt':[123]}};
  const live={id:'123',slug:'target-slug',listing:created?'unlisted':listing,source:previous,revision:{saveCount:1}},snapshot={repository,commit:request.commit,entries:{}};
  let status={...request.status,state:'reserved'},lastStatus='b'.repeat(40),offline=false;const calls=[];
  await store.transact(s=>{s.settings.account.accountId='alpha';s.settings.account.locked=true;s.generators['123']={id:'123',slug:'target-slug',listing:live.listing,status,holds:[{id:'publish',kind:'publication'}]};s.utility={publish:{id:'publish',request,phase:'reserved',generatorId:'123',created,originalListing:listing,nativeSlug:'target-slug',statusCommit:lastStatus,steps:['request checked','identity checked']}};});
  const github={snapshot:async at=>{if(offline)throw Error('offline');return {...snapshot,commit:at||lastStatus};},source:async()=>structuredClone(source),text:async()=>`account: ${status.account}\naction: ${status.action}\nstate: ${status.state}\n`,api:async()=>[{sha:lastStatus}]};
  const writer={write:async input=>{if(offline)throw Error('offline');calls.push('github-status');assert.deepEqual(Object.keys(input.changes),['target-slug/status.md']);status=parseStatus(new TextDecoder().decode(Uint8Array.from(input.changes['target-slug/status.md'])));return {verified:true,commit:'c'.repeat(40)};}};
  const gate={requireOwner:async()=>true},reader={saved:async()=>structuredClone(live)};
  const native={deploy:async(_t,pendingId)=>{const p=(await store.read()).pending[pendingId];assert.deepEqual(p.source,source);assert.deepEqual(p.previousSource,previous);calls.push('save');live.source=structuredClone(source);live.revision.saveCount++;},listing:async(_t,intent)=>{assert.deepEqual(live.source,source);calls.push(intent);live.listing=intent;}};
  const reservation=new Reservation({store,reader,gate,github,writer}),publication=new Publication({store,reader,gate,github,native,reservation,locks:{request:(_k,_o,run)=>run()}});
  return {store,source,previous,request,live,calls,native,github,publication,offline:()=>{offline=true;},assignment:value=>{status.account=value;}};
}
test('GitHub publication uses full same-revision source, status-only done and preserves existing Listing',async()=>{
  for(const listing of ['listed','unlisted']){const f=await fixture({listing});const r=await f.publication.run(f.request,'publish');assert.equal(r.phase,'done');assert.deepEqual(f.calls,['save','github-status']);assert.equal(f.live.listing,listing);assert.equal(f.live.source.files['old.txt'],undefined);const s=await f.store.read();assert.equal(s.generators['123'].savedVerified,true);assert.equal(s.generators['123'].holds.length,0);assert.equal(s.pending['publish-source'].phase,'synced');}
});
test('only newly created generator is Listed, and only after exact complete-source readback',async()=>{
  const f=await fixture({created:true});assert.equal((await f.publication.run(f.request,'publish')).phase,'done');assert.deepEqual(f.calls,['save','listed','github-status']);
});
test('native Save can finish while status remains tied to original repository offline',async()=>{
  const f=await fixture(),original=f.native.deploy;f.native.deploy=async(...args)=>{await original(...args);f.offline();};
  const r=await f.publication.run(f.request,'publish');assert.equal(r.phase,'sync-pending');const s=await f.store.read();assert.equal(s.generators['123'].localDone,true);assert.equal(s.generators['123'].holds.length,0);assert.deepEqual(s.pending['publish-source'].source,f.source);assert.deepEqual(s.pending['publish-source'].repository,f.request.repository);
});
test('uncertain Save reconciles exact same-ID source without another Save',async()=>{
  const f=await fixture(),original=f.native.deploy;f.native.deploy=async(...args)=>{await original(...args);throw Error('lost');};
  assert.equal((await f.publication.run(f.request,'publish')).phase,'unknown');assert.equal((await f.publication.run(f.request,'publish')).phase,'done');assert.equal(f.calls.filter(c=>c==='save').length,1);
});
test('unknown Save with old or mixed source stays held without replay',async()=>{
  const f=await fixture();f.native.deploy=async()=>{f.calls.push('save');throw Error('lost');};
  assert.equal((await f.publication.run(f.request,'publish')).phase,'unknown');assert.equal((await f.publication.run(f.request,'publish')).phase,'unknown');assert.deepEqual(f.calls,['save']);assert.equal((await f.store.read()).generators['123'].savedVerified,undefined);
});
test('lost Listing reply reconciles intended source and Listing without another change',async()=>{
  const f=await fixture({created:true}),original=f.native.listing;f.native.listing=async(...args)=>{await original(...args);throw Error('lost');};
  assert.equal((await f.publication.run(f.request,'publish')).phase,'unknown');assert.equal((await f.publication.run(f.request,'publish')).phase,'done');assert.equal(f.calls.filter(c=>c==='listed').length,1);
});
test('reassigned GitHub request, changed folder and source mismatch cannot publish or List',async()=>{
  const f=await fixture();f.assignment('another-account');assert.equal((await f.publication.run(f.request,'publish')).phase,'blocked');assert.deepEqual(f.calls,[]);assert.ok((await f.store.read()).generators['123'].holds.some(h=>h.kind==='account-conflict'));
  const g=await fixture({created:true});g.native.deploy=async()=>{g.calls.push('save');g.live.source={...g.source,html:'mixed'};};assert.equal((await g.publication.run(g.request,'publish')).phase,'unknown');assert.deepEqual(g.calls,['save']);assert.equal(g.live.listing,'unlisted');
});
function editorFixture(){
  const files={'obsolete.bin':[1]},page={perchanceSaveState:'saved',srcState:{idle:async()=>{},list:async()=>Object.fromEntries(Object.keys(files).map(p=>[p,{}])),readFile:async p=>files[p],deleteFile:async p=>{delete files[p];page.perchanceSaveState='unsaved';},writeFile:async(p,b)=>{files[p]=Array.from(b);page.perchanceSaveState='unsaved';},isDirty:()=>page.perchanceSaveState!=='saved',hasPending:()=>false}};
  for(const key of ['modelTextEditor','outputTemplateEditor']){let text=key;page[key]={getValue:()=>text,setValue:v=>{text=v;page.perchanceSaveState='unsaved';},isClean:()=>page.perchanceSaveState==='saved'};}
  const native={ready:async()=>({id:'123',slug:'target-slug',draftId:'draft'})},editor=new EditorSource({page,native});return {page,editor,native};
}
test('native source staging removes obsolete files, preserves exact zero/binary bytes and rechecks draft identity',async()=>{
  const f=editorFixture(),base=(await f.editor.capture({})).source,desired={pjs:'new',html:'<p>new</p>',files:{'zero.txt':[],'binary.bin':[0,255]}};
  assert.equal(sourceEqual((await f.editor.stage({},desired,base)).source,desired),true);assert.equal(f.page.srcState.isDirty(),true);
  await assert.rejects(f.editor.stage({},base,desired),/dirty-or-stale/);
  const g=editorFixture();g.page.srcState.readFile=async()=>null;await assert.rejects(g.editor.capture({}),/draft-file-unavailable/);
});
test('a snapshot storage failure cannot start native Save or Listing',async()=>{
  const f=await fixture({created:true});f.store.retainSource=async()=>{throw Error('quota');};assert.equal((await f.publication.run(f.request,'publish')).phase,'blocked');assert.deepEqual(f.calls,['github-status']);assert.equal((await f.store.read()).generators['123'].status.state,'blocked');assert.equal(f.live.listing,'unlisted');assert.deepEqual(f.live.source,f.previous);
});
test('an identical complete source needs no native Save but still verifies intended Listing',async()=>{
  const f=await fixture();f.live.source=structuredClone(f.source);assert.equal((await f.publication.run(f.request,'publish')).phase,'done');assert.deepEqual(f.calls,['github-status']);
});
test('late draft switch and mutated src during capture are rejected',async()=>{
  const f=editorFixture();let reads=0;f.native.ready=async()=>({draftId:++reads===1?'original':'different'});await assert.rejects(f.editor.capture({}),/draft-changed/);
});
test('same-generator GitHub changes before Save are held without staging source',async()=>{
  const f=await fixture(),original=f.github.snapshot;f.github.snapshot=async at=>{const s=structuredClone(await original(at));if(!at)s.entries['target-slug/main.pjs']={path:'target-slug/main.pjs',type:'blob',mode:'100644',sha:'f'.repeat(40)};return s;};assert.equal((await f.publication.run(f.request,'publish')).phase,'blocked');assert.deepEqual(f.calls,[]);
});
