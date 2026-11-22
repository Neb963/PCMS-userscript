import {functionalFingerprint} from '../refresher/markers.js';
import {requireThat,sourceEqual,releaseHold,addHold,parseStatus} from '../shared/domain.js';
import {appendEvent} from '../state/journal.js';

function files(snapshot,targetSlug){return JSON.stringify(Object.values(snapshot.entries).filter(e=>e.type!=='tree'&&e.path.startsWith(targetSlug+'/')&&e.path!==targetSlug+'/status.md').map(e=>[e.path,e.sha,e.mode,e.type]).sort((a,b)=>a[0].localeCompare(b[0])));}

export class Publication {
  constructor({reservation,store,github,native,reader,gate,locks,guard=async()=>{},assertCurrent=()=>{}}){Object.assign(this,{reservation,store,github,native,reader,gate,locks,guard,assertCurrent});}
  async requestCurrent(request,id){
    await this.guard();const local=await this.store.read(),r=local.utility?.[id],generator=r?.generatorId&&local.generators[r.generatorId],allowed=new Set([id]);
    for(const job of Object.values(local.jobs))if(job.requestId===id){allowed.add(job.id);allowed.add(job.id+'-worker');}
    if(request.replacesPendingId)allowed.add('sync-'+request.replacesPendingId);
    requireThat(!generator||generator.holds.every(h=>allowed.has(h.id)),'generator-source-held');
    const original=await this.github.snapshot(request.commit),current=await this.github.snapshot();
    requireThat(files(original,request.slug)===files(current,request.slug),'github-source-or-instructions-changed');
    const status= parseStatus(await this.github.text(current,request.slug+'/status.md'));
    requireThat(status.account===request.status.account,'account-assignment-mismatch');
    requireThat(status.action===request.status.action&&['ready','reserved'].includes(status.state),'request-changed');
    const history=await this.github.api('/commits?path='+encodeURIComponent(request.slug+'/status.md')+'&sha='+current.commit+'&per_page=1');
    requireThat(Array.isArray(history)&&[request.requestCommit,r?.statusCommit].includes(history[0]?.sha),'request-changed');
    return current;
  }
  async hold(id,kind,reason,closed=false){return this.reservation.update(id,(r,s)=>{r.phase=kind==='native-unknown'?'unknown':'blocked';r.reason=reason;r.closed=closed;if(r.generatorId)s.generators[r.generatorId]=addHold(s.generators[r.generatorId],{id,kind});});}
  async run(request,id){
    requireThat(request.status.action==='publish_from_github','publication-action-invalid');
    const state=await this.store.read(),existing=state.utility?.[id],retained=state.pending[id+'-source'];
    const source=retained?.kind==='source'?retained.source:await this.github.source(await this.github.snapshot(request.commit),request.slug);
    const r=existing?.localDone||existing?.steps.includes('identity checked')?existing:await this.reservation.run(request,id);
    if(!r.localDone&&!r.steps.includes('identity checked'))return r;
    requireThat(JSON.stringify(r.request)===JSON.stringify(request),'publication-request-changed');
    if(r.steps[0]==='request checked')await this.reservation.update(id,record=>{record.steps[0]='request/source checked';});
    return this.locks.request('pcms:source:'+r.generatorId,{mode:'exclusive'},async()=>{
      const target={id:r.generatorId,slug:request.slug,account:request.status.account},pendingId=id+'-source';
      try{
        if(!r.localDone){
          const priorSave=(await this.store.read()).jobs[id+'-save'];
          if(!priorSave)await this.requestCurrent(request,id);await this.gate.requireOwner(target);
          let live=await this.reader.saved(target.slug,target.id);let pending=(await this.store.read()).pending[pendingId];
          if(!pending){
            await this.store.retainSource({id:pendingId,generatorId:target.id,slug:target.slug,repository:request.repository,baseCommit:r.statusCommit||request.commit,kind:'source',source,previousSource:live.source,requestId:id,status:{...request.status,state:'done'},listingIntent:r.created?'listed':r.originalListing,draftId:null,retainedTab:null},s=>{this.assertCurrent(s);});
            pending=(await this.store.read()).pending[pendingId];
          }
          requireThat(sourceEqual(pending.source,source),'publication-snapshot-changed');
          if(!sourceEqual(live.source,source)){
            await this.requestCurrent(request,id);
            await this.reservation.effect(id,'save',async actionId=>{
              requireThat(sourceEqual(live.source,pending.previousSource),'saved-source-drift');
              await this.native.deploy(target,pendingId,actionId);const saved=await this.reader.saved(target.slug,target.id);
              requireThat(sourceEqual(saved.source,source),'saved-source-mismatch');return {id:target.id,slug:target.slug,revision:saved.revision};
            },async()=>{const saved=await this.reader.saved(target.slug,target.id);return sourceEqual(saved.source,source)?{id:target.id,slug:target.slug,revision:saved.revision}:null;});
          }else{
            const prior=(await this.store.read()).jobs[id+'-save'];
            if(prior&&prior.phase!=='verified')await this.reservation.effect(id,'save',async()=>{throw Error('save-not-replayable');},async()=>({id:target.id,slug:target.slug,revision:live.revision}));
          }
          live=await this.reader.saved(target.slug,target.id);requireThat(sourceEqual(live.source,source),'saved-source-mismatch');
          await this.reservation.update(id,(record,s)=>{if(!record.steps.includes('saved source checked'))record.steps.push('saved source checked');s.pending[pendingId].phase='source-verified';});
          if(r.created){
            await this.reservation.effect(id,'list',async actionId=>{if(live.listing!=='listed')await this.native.listing(target,'listed',actionId);const saved=await this.reader.saved(target.slug,target.id);requireThat(saved.listing==='listed'&&sourceEqual(saved.source,source),'listing-or-source-unconfirmed');return {id:target.id,slug:target.slug,listing:'listed'};},async()=>{const saved=await this.reader.saved(target.slug,target.id);return saved.listing==='listed'&&sourceEqual(saved.source,source)?{id:target.id,slug:target.slug,listing:'listed'}:null;});
          }
          live=await this.reader.saved(target.slug,target.id);await this.gate.requireOwner(target);
          requireThat(sourceEqual(live.source,source),'saved-source-mismatch');requireThat(live.listing===pending.listingIntent,'intended-listing-unconfirmed');
          const verifiedFingerprint=await functionalFingerprint(live.source);
          await this.reservation.update(id,(record,s)=>{
            record.localDone=true;record.closed=true;record.phase='done';record.steps.push('intended Listing confirmed');
            const g=s.generators[target.id];s.generators[target.id]={...releaseHold(g,id),listing:live.listing,localDone:true,localApproved:false,savedVerified:true,verifiedFingerprint,ownerVerified:true};
            const superseded=request.replacesPendingId&&s.pending[request.replacesPendingId];
            if(superseded){requireThat(superseded.decision?.successorRequest===id,'source-handoff-changed');superseded.phase='superseded';superseded.successorId=pendingId;superseded.decision.phase='done';s.generators[target.id]=releaseHold(s.generators[target.id],'sync-'+superseded.id);}
            s.pending[pendingId].phase='local-done';s.pending[pendingId].nativeVerified=true;appendEvent(s,{component:'utility',outcome:'verified',nativeId:target.id});
          });
        }
        const synced=await this.reservation.status(id,'done');
        await this.reservation.update(id,(record,s)=>{record.phase=synced?'done':'sync-pending';const p=s.pending[pendingId];if(p){p.phase=synced?'synced':'local-done';if(synced){p.kind='status';delete p.source;delete p.previousSource;delete p.approval;}}if(synced){record.steps.push('GitHub done committed');s.generators[target.id].githubCommit=record.statusCommit;}});
        return this.reservation.current(id);
      }catch(error){
        const jobs=Object.values((await this.store.read()).jobs).filter(j=>j.requestId===id&&['dispatched','unknown'].includes(j.phase));
        const reason=['account-assignment-mismatch','request-changed','github-source-or-instructions-changed','intended-listing-unconfirmed','saved-source-mismatch','saved-source-drift','publication-snapshot-changed'].includes(error.message)?error.message:'publication-unconfirmed';
        const conflict=['account-assignment-mismatch','request-changed','github-source-or-instructions-changed'].includes(reason);
        await this.hold(id,jobs.length?'native-unknown':reason==='intended-listing-unconfirmed'?'listing-mismatch':reason==='account-assignment-mismatch'?'account-conflict':reason.includes('changed')?'request-conflict':'source-drift',reason,!jobs.length&&!conflict);
        if(!jobs.length&&!conflict)await this.reservation.status(id,'blocked');
        return this.reservation.current(id);
      }
    });
  }
}
