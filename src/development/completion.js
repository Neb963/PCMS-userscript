import {requireThat,addHold,releaseHold} from '../shared/domain.js';
import {appendEvent} from '../state/journal.js';

export function canReview(record,worker){
  const t=record.terminal,o=record.observation;
  return record.phase==='running'&&record.admitted===true&&!!t&&t.attemptId===record.nativeAttemptId&&!t.errored&&!t.stopped&&t.delivery!=='cancelled'&&!record.stopRequested&&!record.stopObserved&&!record.streamError&&!record.streamGap&&!record.foreignTurn&&
    !!o&&o.settled===true&&o.terminalAttempt===record.nativeAttemptId&&o.nativeAttemptId===record.nativeAttemptId&&o.documentId===record.documentId&&o.draftId===record.draftId&&worker?.documentId===record.documentId&&['idle','busy'].includes(worker.phase)&&o.workerPulse===(worker.pulse??null);
}
export function developmentStatus(state,record,value){
  const id=record.id+'-status-'+value;record.statusPending=id;
  state.pending[id]||={id,generatorId:record.generatorId,slug:record.slug,repository:record.request.repository,baseCommit:record.statusCommit||record.request.commit,kind:'status',status:{...record.request.status,state:value},phase:'prepared',nativeVerified:true,requestId:record.id,developmentId:record.id};
}
export async function completeDevelopments(store,assertCurrent=()=>{}){
  const state=await store.read();
  for(const r of Object.values(state.development||{})){
    const worker=state.workers[r.workerId];
    if(canReview(r,worker))await store.transact(s=>{
      assertCurrent(s);const own=s.development[r.id],w=s.workers[own.workerId];if(!canReview(own,w))return;
      own.phase='review';w.phase='retained';const g=s.generators[own.generatorId];s.generators[g.id]=addHold({...releaseHold(g,own.id),retainedTab:w.id,status:{...own.request.status,state:'review'}},{id:own.id,kind:'review'});
      if(s.requestQueue?.[own.id])s.requestQueue[own.id].phase='review';developmentStatus(s,own,'review');appendEvent(s,{component:'helper',outcome:'review',nativeId:g.id});
    });
    else if(['starting','submitting','running'].includes(r.phase)&&worker&&(worker.phase==='lost'||worker.documentId&&r.documentId&&worker.documentId!==r.documentId||r.streamError||r.streamGap||r.foreignTurn||r.stopObserved||r.terminal?.errored||r.terminal?.stopped))await store.transact(s=>{
      assertCurrent(s);const own=s.development[r.id];if(['review','cancelled'].includes(own.phase))return;own.phase='unknown';const g=s.generators[own.generatorId];s.generators[g.id]=addHold({...g,retainedTab:own.workerId},{id:own.id,kind:'helper-unknown'});
    });
  }
}
export async function abandonDevelopment(store,id,confirmed,assertCurrent=()=>{}){
  requireThat(confirmed===true,'confirmation-required');
  return store.transact(s=>{
    assertCurrent(s);const r=s.development?.[id];requireThat(r&&(r.phase==='unknown'||r.stopRequested)&&!['review','cancelled'].includes(r.phase),'development-not-abandonable');
    r.phase='cancelled';r.abandoned=true;const worker=s.workers[r.workerId];if(worker)worker.phase='retained';
    for(const job of Object.values(s.jobs))if(job.workerId===r.workerId&&['prepared','dispatched','unknown'].includes(job.phase))job.locallyStopped=true;
    const g=s.generators[r.generatorId];s.generators[g.id]=addHold({...g,retainedTab:r.workerId},{id:r.id,kind:'helper-unknown'});developmentStatus(s,r,'blocked');
    if(s.requestQueue?.[id]){s.requestQueue[id].closed=true;s.requestQueue[id].phase='cancelled';}
    appendEvent(s,{component:'helper',outcome:'cancelled',nativeId:g.id});
  });
}
