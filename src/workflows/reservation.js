import { requireThat, slug, nativeId, generatorRecord, addHold, releaseHold } from '../shared/domain.js';
import { folderVersion, statusChanges } from '../adapters/github/writer.js';

export class Reservation {
  constructor({store,slugs,reader,native,gate,github,writer,guard=async()=>{},assertCurrent=()=>{}}) {Object.assign(this,{store,slugs,reader,native,gate,github,writer,guard,assertCurrent});}
  async update(id,change){await this.guard();return this.store.transact(s=>{this.assertCurrent(s);const r=s.utility?.[id];requireThat(r,'reservation-not-found');return change(r,s);});}
  async current(id){return (await this.store.read()).utility[id];}

  async verify(target) {
    nativeId(target.id);slug(target.slug);
    await this.gate.requireOwner({...target,account:target.account});
    const saved=await this.reader.metadata(target.slug);
    requireThat(saved.id===target.id&&saved.slug===target.slug,'native-target-mismatch');return saved;
  }

  async effect(id,step,perform,recheck) {
    const actionId=id+'-'+step;const job=(await this.store.read()).jobs[actionId];
    if(job){
      if(job.phase==='verified')return job.data;
      if(job.phase!=='prepared'){
        const result=await recheck();
        requireThat(result,'reservation-result-unknown');
        await this.update(id,(_r,s)=>{s.jobs[actionId].phase='verified';s.jobs[actionId].data=structuredClone(result);const child=s.jobs[actionId+'-worker'];if(child&&['dispatched','unknown'].includes(child.phase)){child.phase='verified';child.data=structuredClone(result);}});return result;
      }
    }else await this.store.prepareAction({id:actionId,kind:'native-'+step,generatorId:(await this.current(id)).generatorId,requestId:id});
    await this.guard();await this.store.markDispatched(actionId);
    try{
      const result=await perform(actionId);
      await this.update(id,(_r,s)=>{s.jobs[actionId].phase='verified';s.jobs[actionId].data=structuredClone(result);const child=s.jobs[actionId+'-worker'];if(child&&['dispatched','unknown'].includes(child.phase)){child.phase='verified';child.data=structuredClone(result);}});return result;
    }catch(error){await this.update(id,(r,s)=>{s.jobs[actionId].phase='unknown';r.reason='reservation-result-unknown';});throw error;}
  }

  async adopt(id,target,created){
    nativeId(target.id);slug(target.slug);
    await this.update(id,(r,s)=>{
      requireThat(!r.generatorId||r.generatorId===target.id,'reservation-identity-changed');
      const existing=s.generators[target.id];
      requireThat(!existing||existing.slug===target.slug,'managed-identity-conflict');
      requireThat(!existing||!existing.holds.some(h=>h.id!==id),'generator-held');
      r.generatorId=target.id;r.nativeSlug=target.slug;r.created=created;r.originalListing=target.listing;
      s.settings.account.locked=true;
      s.generators[target.id]=addHold(existing||{...generatorRecord({id:target.id,slug:target.slug,listing:target.listing||'unknown',status:r.request.status,holds:[]}),repository:r.request.repository}, {id,kind:'publication'});
      s.generators[target.id].reservationId=id;
    });
  }

  async status(id,state){
    const r=await this.current(id),status={...r.request.status,state};
    await this.update(id,record=>{record.pendingStatus={status,repository:r.request.repository,baseCommit:r.request.commit};});
    try{
      const baseline=await this.github.snapshot(r.request.commit);
      const receipt=await this.writer.write({id:id+'-status-'+state,targetSlug:r.request.slug,baseline,changes:statusChanges(r.request.slug,status),operation:'status'});
      requireThat(receipt.verified&&!receipt.superseded,'github-status-unconfirmed');
      await this.update(id,(record,s)=>{record.statusCommit=receipt.commit;record.pendingStatus=null;if(record.generatorId)s.generators[record.generatorId].status=status;});return true;
    }catch{return false;}
  }

  async run(request,id){
    slug(request.slug);requireThat(request.valid&&['ready','reserved'].includes(request.status.state),'reservation-request-invalid');
    requireThat(/^[A-Za-z0-9_-]{1,90}$/.test(id),'invalid-reservation-id');
    await this.guard();
    await this.store.transact(s=>{this.assertCurrent(s);requireThat(s.settings.account.accountId===request.status.account,'account-assignment-mismatch');s.utility||={};requireThat(!Object.values(s.utility).some(other=>other.id!==id&&other.request.slug===request.slug&&JSON.stringify(other.request.repository)===JSON.stringify(request.repository)&&!other.closed),'reservation-already-active');if(!s.utility[id])s.utility[id]={id,request:structuredClone(request),phase:'checking',generatorId:null,created:false,steps:['request checked']};else requireThat(JSON.stringify(s.utility[id].request)===JSON.stringify(request),'reservation-request-changed');});
    let r=await this.current(id);
    if(['reserved','blocked'].includes(r.phase))return r;
    try{
      if(!r.generatorId){
        const previous=(await this.store.read()).jobs[id+'-create'];
        if(previous){
          requireThat(previous.phase==='verified'&&previous.data?.id,'creation-result-unknown');
          await this.adopt(id,previous.data,true);
        }else{
          await this.gate.requireSession(request.status.account);
          const baseline=await this.github.snapshot(request.commit),current=await this.github.snapshot();
          requireThat(folderVersion(baseline,request.slug)===folderVersion(current,request.slug),'request-changed');
          const observed=await this.slugs.check(request.slug);
          await this.update(id,record=>{record.classification=observed.classification;record.steps.push('slug checked');});
          if(observed.classification==='Taken'){
            requireThat(observed.saved,'slug-unverified');await this.verify({...observed.saved,account:request.status.account});await this.adopt(id,observed.saved,false);
          }else{
            requireThat(observed.classification==='Available','slug-'+observed.classification.toLowerCase());
            // Availability is not a reservation; repeat it immediately before create.
            requireThat((await this.slugs.check(request.slug)).classification==='Available','slug-no-longer-available');
            const created=await this.effect(id,'create',actionId=>this.native.create(actionId),async()=>null);
            await this.adopt(id,created,true);
          }
        }
      }
      r=await this.current(id);
      let target={id:r.generatorId,slug:r.nativeSlug,account:request.status.account};
      const renameJob=(await this.store.read()).jobs[id+'-rename'];
      if(renameJob&&renameJob.phase!=='prepared'&&target.slug!==request.slug){
        const renamed=await this.effect(id,'rename',async()=>{throw Error('rename-not-replayable');},async()=>{try{return await this.verify({...target,slug:request.slug});}catch{return null;}});
        requireThat(renamed.id===target.id,'rename-unconfirmed');
        await this.update(id,(record,s)=>{record.nativeSlug=request.slug;s.generators[target.id].slug=request.slug;});target={...target,slug:request.slug};
      }
      let saved=await this.verify(target);
      if(r.created){
        await this.effect(id,'unlist',async actionId=>{if(saved.listing!=='unlisted')await this.native.listing(target,'unlisted',actionId);const current=await this.verify(target);requireThat(current.listing==='unlisted','listing-unconfirmed');return current;},async()=>{const current=await this.verify(target);return current.listing==='unlisted'?current:null;});
        await this.update(id,(record,s)=>{record.steps.push('new generator Unlisted');s.generators[target.id].listing='unlisted';});
        if(target.slug!==request.slug){
          const prior=(await this.store.read()).jobs[id+'-rename'];
          if(!prior)requireThat((await this.slugs.check(request.slug)).classification==='Available','slug-no-longer-available');
          const renamed=await this.effect(id,'rename',async actionId=>{await this.native.rename(target,request.slug,actionId);return this.verify({...target,slug:request.slug});},async()=>{try{return await this.verify({...target,slug:request.slug});}catch{return null;}});
          requireThat(renamed.id===target.id&&renamed.slug===request.slug,'rename-unconfirmed');
          await this.update(id,(record,s)=>{record.nativeSlug=request.slug;s.generators[target.id].slug=request.slug;});
          target={...target,slug:request.slug};
        }
      }
      saved=await this.verify(target);requireThat(target.slug===request.slug&&(!r.created||saved.listing==='unlisted'),'reservation-unconfirmed');
      await this.update(id,(record,s)=>{record.phase='reserved';record.steps.push('identity checked');s.generators[target.id]=addHold({...s.generators[target.id],ownerVerified:true,listing:saved.listing},{id,kind:'publication'});});
      const synced=await this.status(id,'reserved');
      if(synced)await this.update(id,record=>record.steps.push('GitHub reserved confirmed'));
      return this.current(id);
    }catch(error){
      const jobs=Object.values((await this.store.read()).jobs).filter(j=>j.requestId===id);
      const unknown=jobs.some(j=>['dispatched','unknown'].includes(j.phase));
      await this.update(id,(record,s)=>{
        record.phase=unknown?'unknown':'blocked';record.closed=!unknown;
        record.reason=unknown?'reservation-result-unknown':['slug-available','slug-taken','slug-reserved','slug-unknown','slug-no-longer-available','owner-mismatch','sign-in-required','confirm-session-required','generator-held'].includes(error.message)?error.message:'reservation-unconfirmed';
        if(record.generatorId){const g=s.generators[record.generatorId];s.generators[record.generatorId]=addHold(releaseHold(g,id),{id,kind:unknown?'native-unknown':'slug'});}
      });
      if(!unknown)await this.status(id,'blocked');
      return this.current(id);
    }
  }
}
