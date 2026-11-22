import {requireThat,sourcePath,addHold,releaseHold,parseStatus} from '../shared/domain.js';
import {functionalFingerprint} from '../refresher/markers.js';
import {appendEvent} from '../state/journal.js';
import {requireLiveCapability} from '../adapters/perchance/session.js';

const instructions=(snapshot,slug)=>JSON.stringify(Object.values(snapshot.entries).filter(e=>e.type!=='tree'&&(e.path===slug+'/prompt.md'||e.path.startsWith(slug+'/scratch/'))).map(e=>[e.path,e.sha,e.mode]).sort());
export class Development {
  constructor({store,services,nativeFactory,guard=async()=>{},assertCurrent=()=>{},allowed=()=>requireLiveCapability('helper')}){Object.assign(this,{store,services,nativeFactory,guard,assertCurrent,allowed});this.busy=false;}
  async enqueue(request,id,reservation){
    await this.guard();const s=await this.store.read();if(s.development?.[id])return s.development[id];
    requireThat(reservation.phase==='reserved'&&reservation.steps.includes('identity checked'),'development-reservation-unverified');
    const {github}=await this.services(request.repository),snapshot=await github.snapshot(request.commit),current=await github.snapshot();
    requireThat(instructions(snapshot,request.slug)===instructions(current,request.slug),'request-changed');
    const status=parseStatus(await github.text(current,request.slug+'/status.md'));
    requireThat(status.account===request.status.account&&status.action==='develop'&&['ready','reserved'].includes(status.state),'request-changed');
    const history=await github.api('/commits?path='+encodeURIComponent(request.slug+'/status.md')+'&sha='+current.commit+'&per_page=1');
    requireThat([request.requestCommit,reservation.statusCommit].includes(history?.[0]?.sha),'request-changed');
    const prompt=await github.text(snapshot,request.slug+'/prompt.md');requireThat(prompt.trim(),'prompt-required');const scratch={};
    for(const entry of Object.values(snapshot.entries))if(entry.type!=='tree'&&entry.path.startsWith(request.slug+'/scratch/')){const path=sourcePath(entry.path.slice(request.slug.length+9));scratch[path]=Array.from(await github.bytes(snapshot,entry.path));}
    let baselineFingerprint=s.generators[reservation.generatorId]?.verifiedFingerprint||null;
    if(!baselineFingerprint&&!reservation.created)baselineFingerprint=await functionalFingerprint(await github.source(snapshot,request.slug));
    const result=await this.store.transact(state=>{
      this.assertCurrent(state);requireThat(!state.requestQueue?.[id]?.incoming,'request-changed');state.development||={};requireThat(!state.development[id],'development-already-enqueued');
      const g=state.generators[reservation.generatorId];requireThat(g&&g.holds.every(h=>h.id===id),'generator-held');
      state.development[id]={id,request:structuredClone(request),generatorId:g.id,slug:g.slug,created:reservation.created,originalListing:reservation.created?'unlisted':reservation.originalListing,statusCommit:reservation.statusCommit||null,baselineFingerprint,prompt,scratch,phase:'queued',workerId:null,documentId:null,sendInvoked:false};
      state.generators[g.id]=addHold(releaseHold(g,id),{id,kind:'development'});appendEvent(state,{component:'helper',outcome:'queued',nativeId:g.id});return state.development[id];
    });return result.result;
  }
  async tick(){
    if(this.busy)return;this.busy=true;
    try{
      await this.guard();this.allowed();const state=await this.store.read();if(!state.settings.account.confirmed)return;
      const record=Object.values(state.development||{}).find(r=>r.phase==='queued'&&!state.requestQueue?.[r.id]?.incoming);if(!record)return;
      if(Object.values(state.workers).filter(w=>w.role==='development'&&!['retained','released'].includes(w.phase)).length>=2)return;
      await this.store.transact(s=>{this.assertCurrent(s);const r=s.development[record.id];requireThat(r.phase==='queued'&&!s.requestQueue?.[r.id]?.incoming,'request-changed');r.phase='starting';});
      let native;
      try{
        native=await this.nativeFactory(record);
        const result=await native.startDevelopment({id:record.generatorId,slug:record.slug,account:record.request.status.account},record.id);
        await this.store.transact(s=>{this.assertCurrent(s);const r=s.development[record.id];r.workerId=native.workerId||r.workerId;r.phase=result.kind==='admitted'&&r.admitted?'running':'unknown';if(r.phase==='unknown')s.generators[r.generatorId]=addHold(s.generators[r.generatorId],{id:r.id,kind:'helper-unknown'});});
      }catch{
        await this.store.transact(s=>{this.assertCurrent(s);const r=s.development[record.id],job=s.jobs[r.id+'-helper-start'];r.workerId=native?.workerId||job?.workerId||r.workerId;r.documentId=job?.documentId||r.documentId;r.phase='unknown';s.generators[r.generatorId]=addHold({...s.generators[r.generatorId],retainedTab:r.workerId},{id:r.id,kind:'helper-unknown'});appendEvent(s,{component:'helper',outcome:'unknown',nativeId:r.generatorId});});
      }
    }finally{this.busy=false;}
  }
}
