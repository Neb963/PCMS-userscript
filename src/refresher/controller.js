import {requireThat,addHold} from '../shared/domain.js';
import {refreshPlan,finishRefresh,skipBeforeSend,pruneRefreshAttempts} from './scheduler.js';
import {appendEvent} from '../state/journal.js';
import {requireLiveCapability} from '../adapters/perchance/session.js';

export class RefresherController {
  constructor({store,scheduler,nativeFactory,locks,guard=async()=>{},assertCurrent=()=>{},writeAllowed=()=>requireLiveCapability('save'),uuid=()=>crypto.randomUUID()}){Object.assign(this,{store,scheduler,nativeFactory,locks,guard,assertCurrent,writeAllowed,uuid});this.busy=false;}
  async retainWorker(workerId){if(!workerId)return;await this.store.transact(s=>{this.assertCurrent(s);const w=s.workers[workerId];if(w&&w.role==='refresher'){w.phase='retained';for(const j of Object.values(s.jobs))if(j.workerId===workerId&&['prepared','dispatched'].includes(j.phase)){j.phase='unknown';const g=s.generators[j.generatorId];if(g)s.generators[j.generatorId]=addHold(g,{id:j.id,kind:j.kind==='refresh-prepare'?'edit':'native-unknown'});}}});}
  async hold(generatorId,holdId,kind,workerId=null){return this.store.transact(s=>{this.assertCurrent(s);const g=s.generators[generatorId];if(g)s.generators[generatorId]=addHold({...g,...(workerId?{retainedTab:workerId}:{})},{id:holdId,kind});});}
  async cancelUnaccepted(jobId){
    const result=await this.store.transact(s=>{this.assertCurrent(s);const job=s.jobs[jobId];if(!job)return true;if(job.accepted)return false;if(['prepared','dispatched','unknown'].includes(job.phase)){job.phase='cancelled';job.resolution='known-not-dispatched';return true;}return job.phase==='cancelled';});return result.result;
  }
  async result(generatorId,id,jobId,result){
    await this.guard();await this.store.transact(s=>{
      this.assertCurrent(s);const previous=s.attempts.find(a=>a.id===id);requireThat(previous,'refresh-attempt-unavailable');if(previous.recorded)return;
      const input=this.scheduler.project(s);
      if(result.kind==='skipped'&&result.notSent===true){const next=skipBeforeSend(s.attempts,s.fifo,input.eligible,id,true);s.attempts=next.attempts;s.fifo=next.fifo;}
      else s.attempts=finishRefresh(s.attempts,id,result.kind==='confirmed'?'confirmed':result.kind==='failed'?'failed':'unknown',input.clock.logical);
      s.attempts=pruneRefreshAttempts(s.attempts,input.clock.logical);s.refreshClock=input.clock;const attempt=s.attempts.find(a=>a.id===id);attempt.recorded=true;attempt.jobId=jobId;attempt.reason=['source-drift','listing-unconfirmed','dirty-or-stale-editor','refresh-preflight-unconfirmed','refresh-readback-unconfirmed','refresh-receipt-unconfirmed','native-rejected'].includes(result.reason)?result.reason:null;
      const job=s.jobs[jobId];if(job){job.remoteOutcome=result.kind;if(result.kind==='unknown')job.phase='unknown';}
      if(result.kind==='unknown'&&s.generators[generatorId])s.generators[generatorId]=addHold(s.generators[generatorId],{id:jobId,kind:'native-unknown'});
      if(result.hold&&s.generators[generatorId])s.generators[generatorId]=addHold(s.generators[generatorId],{id:jobId,kind:result.hold});
      if(result.kind==='skipped'&&s.generators[generatorId])s.generators[generatorId]=addHold(s.generators[generatorId],{id:jobId,kind:result.reason==='listing-unconfirmed'?'listing-mismatch':result.reason==='source-drift'?'source-drift':'edit'});
      appendEvent(s,{component:'refresher',outcome:result.kind==='confirmed'?'confirmed':result.kind==='failed'?'failed':result.kind==='skipped'?'held':'unknown',nativeId:generatorId,reason:result.kind==='unknown'?'native-result':'none',jobId});
      const draft=s.refreshDrafts?.[id];if(!result.reusable&&s.generators[generatorId]){const workerId=job?.workerId||draft?.workerId;if(workerId)s.generators[generatorId].retainedTab=workerId;}
      if(draft){draft.outcome=result.kind;if(['confirmed','failed'].includes(result.kind)&&result.reusable){draft.phase='resolved';delete draft.source;delete draft.previousSource;}}
    });
  }
  async recoverResults(){
    const state=await this.store.read();
    for(const attempt of state.attempts.filter(a=>a.outcome==='unknown'&&!a.recorded)){
      const jobId=attempt.id+'-save',job=state.jobs[jobId],draft=state.refreshDrafts?.[attempt.id];
      if(job?.phase==='dispatched'||job?.phase==='prepared')continue;
      const outcome=job?.data&&['confirmed','failed','skipped','unknown'].includes(job.data.kind)?job.data:!job&&draft?.phase==='staged'?{kind:'skipped',notSent:true,reason:'refresh-preflight-unconfirmed',reusable:false}:job?.phase==='unknown'?{kind:'unknown',reason:'refresh-preflight-unconfirmed',reusable:false}:null;
      if(outcome){await this.result(attempt.generatorId,attempt.id,jobId,outcome);if(!outcome.reusable)await this.retainWorker(draft?.workerId||job?.workerId);}
    }
  }
  async tick(){
    if(this.busy)return;this.busy=true;
    try{
      await this.guard();await this.recoverResults();this.writeAllowed();await this.scheduler.reconcile();
      const state=await this.store.read();if(state.settings.refreshPaused||!state.settings.account.confirmed)return;
      const workers=Object.values(state.workers).filter(w=>w.role==='refresher'&&!['retained','released','lost'].includes(w.phase));
      if(workers.some(w=>w.phase==='busy'||w.selected))return;
      const plan=refreshPlan({...this.scheduler.project(state),available:true});if(!plan.candidate)return;
      const generatorId=plan.candidate,id='refresh-'+this.uuid(),target={id:generatorId,slug:state.generators[generatorId].slug,account:state.settings.account.accountId};
      await this.locks.request('pcms:source:'+generatorId,{mode:'exclusive',ifAvailable:true},async lock=>{
        if(!lock)return;await this.guard();const fresh=await this.store.read(),current=refreshPlan({...this.scheduler.project(fresh),available:true});if(current.candidate!==generatorId||fresh.generators[generatorId]?.slug!==target.slug)return;
        const native=await this.nativeFactory();let counted=false;
        try{
          const prepared=await native.prepareRefresh(target,id);
          if(prepared.kind!=='prepared'){
            if(prepared.hold)await this.hold(generatorId,id+'-prepare',prepared.hold,prepared.retain?native.workerId:null);
            if(prepared.retain)await this.retainWorker(native.workerId);return;
          }
          await this.scheduler.claim(id,generatorId);counted=true;
          const outcome=await native.saveRefresh(target,id);
          await this.result(generatorId,id,id+'-save',outcome);
          if(!outcome.reusable)await this.retainWorker(native.workerId);
        }catch{
          const jobId=id+(counted?'-save':'-prepare');let retire=true;
          if(counted){
            const known=(await this.store.read()).jobs[jobId]?.data;
            if(known&&['confirmed','failed','skipped','unknown'].includes(known.kind)){await this.result(generatorId,id,jobId,known);retire=!known.reusable;}
            else{const knownNoSend=await this.cancelUnaccepted(jobId);await this.result(generatorId,id,jobId,{kind:knownNoSend?'skipped':'unknown',notSent:knownNoSend,reason:'refresh-preflight-unconfirmed',reusable:false});}
          }else if((await this.store.read()).jobs[jobId])await this.hold(generatorId,jobId,'edit',native.workerId);
          if(retire)await this.retainWorker(native.workerId);
        }
      });
    }finally{this.busy=false;}
  }
}
