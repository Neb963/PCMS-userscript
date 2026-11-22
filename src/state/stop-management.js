import {requireThat} from '../shared/domain.js';
import {appendEvent} from './journal.js';
export function requireStoppable(s,id){
 requireThat(!Object.values(s.development||{}).some(r=>r.generatorId===id&&['starting','submitting','running','unknown'].includes(r.phase)&&!r.abandoned),'resolve-development-before-stop');
 requireThat(!Object.values(s.workers).some(w=>w.generatorId===id&&w.role==='development'&&['opening','busy','lost'].includes(w.phase)&&!Object.values(s.development||{}).some(r=>r.workerId===w.id&&r.abandoned)),'resolve-development-before-stop');
}
// Local terminal disposition only. Preserve remote requests, native tabs, drafts,
// snapshots and unknown outcomes; none of those imply deletion or remote Stop.
export function stopManagement(s,id){
 requireStoppable(s,id);const g=s.generators[id];requireThat(g,'generator-not-found');s.stoppedGenerators||={};s.stoppedGenerators[id]={...structuredClone(g),stoppedAt:Date.now()};
 const requestIds=new Set();
 for(const r of Object.values(s.utility||{}))if(r.generatorId===id){r.stopRequested=true;r.stopped=true;r.closed=true;r.phase='stopped';if(r.pendingStatus){r.pendingStatus.phase='stopped';r.pendingStatus.stopRequested=true;}requestIds.add(r.id);}
 for(const p of Object.values(s.pending))if(p.generatorId===id){p.phase='stopped';p.stopRequested=true;p.reason='operator-stopped';if(p.requestId)requestIds.add(p.requestId);}
 for(const r of Object.values(s.maintenance||{}))if(r.generatorId===id){r.phase='stopped';requestIds.add(r.id);}
 for(const r of Object.values(s.recovery||{}))if(r.generatorId===id)r.phase='stopped';
 for(const r of Object.values(s.development||{}))if(r.generatorId===id){r.stopRequested=true;r.managementStopped=true;if(!['done','resolved'].includes(r.phase))r.phase='resolved';requestIds.add(r.id);}
 for(const r of Object.values(s.edits||{}))if(r.generatorId===id){r.managementStopped=true;r.stopRequested=true;r.phase='ended';}
 for(const q of Object.values(s.requestQueue||{}))if(requestIds.has(q.id)||q.request.slug===g.slug&&JSON.stringify(q.request.repository)===JSON.stringify(g.repository)){q.stopRequested=true;q.closed=true;q.phase='stopped';}
 for(const c of Object.values(s.commands||{}))if(c.id===g.importCommand||c.generatorId===id||requestIds.has(c.operationId)){if(['queued','running','unknown'].includes(c.phase))c.phase='stopped';}
 for(const j of Object.values(s.jobs))if(j.generatorId===id||requestIds.has(j.requestId)||j.kind==='github'&&j.slug===g.slug&&JSON.stringify(j.repository)===JSON.stringify(g.repository)){j.locallyStopped=true;if(['dispatched','unknown'].includes(j.phase)){j.phase='unknown';j.remoteOutcome='unknown';}else if(j.phase==='prepared'){j.phase='cancelled';j.resolution='known-not-dispatched';}}
 for(const w of Object.values(s.workers))if(w.generatorId===id){w.phase='retained';w.slotReleased=true;}
 s.fifo=s.fifo.filter(x=>x!==id);delete s.generators[id];appendEvent(s,{component:'recovery',outcome:'cancelled',nativeId:id});
}
