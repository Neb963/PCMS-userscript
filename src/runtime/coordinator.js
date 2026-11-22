import { appendEvent } from '../state/journal.js';
import { requireThat, isReadOnlyCommand } from '../shared/domain.js';

export const COORDINATOR_LOCK = 'pcms:coordinator:v1';

function interruptJobs(state) {
  for (const request of Object.values(state.requestQueue || {})) if(request.phase==='running')request.phase='unknown';
  for (const command of Object.values(state.commands || {})) if (command.phase === 'running') command.phase = 'unknown';
  for (const job of Object.values(state.jobs)) {
    if (job.phase !== 'dispatched') continue;
    job.phase = 'unknown';
    const worker=state.workers[job.workerId];if(worker&&worker.role!=='development')worker.phase='retained';
    const generator = state.generators[job.generatorId];
    if(generator&&worker)generator.retainedTab=worker.id;
    if (!isReadOnlyCommand(job.kind)&&generator && !generator.holds.some(h => h.id === job.id)) generator.holds.push({ id: job.id, kind: job.kind === 'helper' ? 'helper-unknown' : 'native-unknown' });
  }
}

export class Coordinator {
  constructor({ store, locks, owner }) {
    this.store = store;
    this.locks = locks;
    this.owner = owner;
    this.term = null;
    this.active = false;
    this.release = null;
  }

  async run(signal, onActive = () => {}) {
    requireThat(this.locks?.request, 'coordinator-lock-unavailable');
    return this.locks.request(COORDINATOR_LOCK, { mode: 'exclusive', signal }, async () => {
      const stop = () => this.stop();
      try {
        if (signal.aborted) return;
        if (this.store.acquireAuthority) await this.store.acquireAuthority();
        if (signal.aborted) return;
        const claim = await this.store.transact(state => {
          interruptJobs(state);
          state.coordinator = { term: state.coordinator.term + 1, owner: this.owner };
          appendEvent(state, { component: 'coordinator', outcome: 'verified' });
          return state.coordinator.term;
        });
        this.term = claim.result;
        this.active = true;
        const stopped = new Promise(resolve => { this.release = resolve; });
        signal.addEventListener('abort', stop, { once: true });
        if (signal.aborted) this.stop();
        await onActive(this);
        await stopped;
      } finally {
        this.active = false;
        signal.removeEventListener('abort', stop);
        if (this.store.releaseAuthority) await this.store.releaseAuthority();
        this.release = null;
      }
    });
  }

  stop() {
    this.active = false;
    this.release?.();
  }

  assertOwner(state) {
    requireThat(this.active && state.coordinator.owner === this.owner && state.coordinator.term === this.term, 'stale-coordinator');
  }

  async claim(job) {
    requireThat(job && typeof job.id === 'string' && job.id && typeof job.workerId === 'string' && job.workerId && typeof job.documentId === 'string' && job.documentId, 'invalid-command');
    return this.store.transact(state => {
      this.assertOwner(state);
      requireThat(!Object.hasOwn(state.jobs, job.id), 'duplicate-job');
      if (job.generatorId&&!['read-saved','inspect-target','native-capture','maintenance-capture','recovery-capture','helper-stop','helper-resolve','approved-capture','edit-capture'].includes(job.kind)) requireThat(!Object.values(state.jobs).some(j => !['read-saved','inspect-target','native-capture','maintenance-capture','recovery-capture','helper-stop','helper-resolve','approved-capture','edit-capture'].includes(j.kind)&&j.generatorId === job.generatorId && j.id !== job.parentId && ['prepared', 'dispatched', 'unknown'].includes(j.phase)), 'generator-write-held');
      state.jobs[job.id] = { ...structuredClone(job), owner: this.owner, term: this.term, phase: 'prepared', accepted: false };
      return structuredClone(state.jobs[job.id]);
    });
  }

  async dispatch(id, send) {
    const result = await this.store.transact(state => {
      this.assertOwner(state);
      const job = state.jobs[id];
      requireThat(job?.phase === 'prepared' && job.term === this.term && job.owner === this.owner, 'job-not-dispatchable');
      job.phase = 'dispatched';
      return structuredClone(job);
    });
    try {
      requireThat(this.active, 'coordinator-stopped');
      await send(result.result);
    } catch {
      await this.store.transact(state => {
        const job = state.jobs[id];
        if (job?.phase === 'dispatched') {
          job.phase = 'unknown';
          const gen = state.generators[job.generatorId];
          if (!isReadOnlyCommand(job.kind)&&gen && !gen.holds.some(h => h.id === id)) gen.holds.push({ id, kind: job.kind === 'helper' ? 'helper-unknown' : 'native-unknown' });
        }
      });
      throw new Error('dispatch-unknown');
    }
  }

  async acceptResult(command, outcome) {
    requireThat(['verified', 'rejected', 'unknown'].includes(outcome), 'invalid-outcome');
    return this.store.transact(state => {
      this.assertOwner(state);
      const job = state.jobs[command.id];
      requireThat(job?.phase === 'dispatched' && job.accepted && job.term === this.term && job.workerId === command.workerId && job.documentId === command.documentId, 'stale-result');
      job.phase = outcome;
      if (outcome === 'unknown'&&!isReadOnlyCommand(job.kind)) {
        const gen = state.generators[job.generatorId];
        if (!isReadOnlyCommand(job.kind)&&gen && !gen.holds.some(h => h.id === job.id)) gen.holds.push({ id: job.id, kind: job.kind === 'helper' ? 'helper-unknown' : 'native-unknown' });
      }
    });
  }
}

// Runs in the isolated userscript worker, before invoking native code. No page event
// is trusted as a command. Persist acceptance before returning permission to act.
export async function acceptCommand(store, command, worker) {
  return store.transact(state => {
    const job = state.jobs[command.id];
    requireThat(job && job.phase === 'dispatched' && !job.accepted && job.term === command.term && state.coordinator.term === command.term && state.coordinator.owner === command.owner, 'stale-or-duplicate-command');
    requireThat(job.workerId === worker.id && job.documentId === worker.documentId && command.workerId === worker.id && command.documentId === worker.documentId, 'wrong-worker-document');
    job.accepted = true;
    return structuredClone(job);
  });
}

export function guardNativeCommand(state,command,workerId){
  const job=state.jobs[command.id],worker=state.workers[workerId],parent=command.payload?.actionId&&state.jobs[command.payload.actionId],request=parent?.requestId&&state.utility?.[parent.requestId];
  requireThat(job?.phase==='dispatched'&&job.accepted===true&&job.workerId===workerId&&job.documentId===command.documentId&&job.term===command.term&&job.owner===command.owner&&!job.locallyStopped&&!parent?.locallyStopped&&state.coordinator.term===command.term&&state.coordinator.owner===command.owner&&worker?.documentId===command.documentId&&worker.phase==='busy','stale-native-command');
  requireThat(!request?.stopped&&!request?.stopRequested&&!state.generators[command.target?.id]?.stopRequested&&!state.pending[command.payload?.pendingId]?.stopRequested,'request-stopped');
  if(command.kind.startsWith('refresh-'))requireThat(worker.role==='refresher','wrong-native-worker-role');
  const development=command.payload?.developmentId&&state.development?.[command.payload.developmentId];
  if(command.kind.startsWith('helper-')||command.kind.startsWith('approved-'))requireThat(worker.role==='development'&&development&&development.generatorId===command.target.id&&(!development.workerId||development.workerId===workerId)&&(command.kind==='helper-start'?!development.stopRequested&&!state.requestQueue?.[development.id]?.incoming:['approved-save','approved-listing'].includes(command.kind)?!development.stopRequested&&['publishing','publication-unknown'].includes(development.phase):true),'helper-context-changed');
  const edit=command.payload?.editId&&state.edits?.[command.payload.editId];
  if(command.kind.startsWith('edit-'))requireThat(worker.role==='manual'&&edit&&edit.workerId===workerId&&(!edit.documentId||edit.documentId===command.documentId)&&edit.generatorId===command.target.id&&(command.kind!=='edit-save'||!edit.stopRequested&&['publishing','publication-unknown'].includes(edit.phase)),'edit-context-changed');
  if(command.kind==='edit-save'){const pending=state.pending[command.payload.pendingId];requireThat(edit.approvedPending===pending?.id&&pending.editId===edit.id&&pending.retainedTab===workerId&&pending.approval?.documentId===command.documentId,'approved-context-changed');}
  if(['approved-save','approved-listing'].includes(command.kind)){const pending=state.pending[command.payload.pendingId];requireThat(development?.approvedPending===pending?.id&&pending?.generatorId===command.target.id&&pending.retainedTab===workerId&&pending.approval?.documentId===command.documentId&&(command.kind!=='approved-listing'||development.created&&pending.listingIntent==='listed'),'approved-context-changed');}
  if(command.target?.id){
    const generator=state.generators[command.target.id],allowed=new Set([command.id,parent?.id,request?.id].filter(Boolean));
    if(edit)allowed.add(edit.id);
    const recovery=command.payload?.recoveryId&&state.recovery?.[command.payload.recoveryId];if(recovery){requireThat(recovery.generatorId===command.target.id&&!['done','stopped'].includes(recovery.phase),'recovery-context-changed');allowed.add(recovery.id);if(command.kind==='recovery-capture')for(const h of generator.holds)allowed.add(h.id);if(command.kind==='native-deploy')for(const h of recovery.holds)if(h.kind==='source-drift')allowed.add(h.id);if(command.kind==='native-listing')for(const h of recovery.holds)if(h.kind==='listing-mismatch')allowed.add(h.id);}
    const maintenance=command.payload?.maintenanceId&&state.maintenance?.[command.payload.maintenanceId];if(maintenance){requireThat(worker.role==='utility'&&maintenance.generatorId===command.target.id&&!['done','failed','stopped'].includes(maintenance.phase),'maintenance-context-changed');allowed.add(maintenance.id);}
    if(development){allowed.add(development.id);if(command.kind==='helper-resolve')for(const suffix of ['-helper-start','-helper-stop'])allowed.add(development.id+suffix);}
    const previous=request?.request.replacesPendingId&&state.pending[request.request.replacesPendingId];if(previous?.phase==='publication-queued'&&previous.decision?.successorRequest===request.id)allowed.add('sync-'+previous.id);
    requireThat(generator&&generator.slug===command.target.slug&&(['helper-resolve','helper-stop','approved-capture','edit-capture'].includes(command.kind)||generator.holds.every(h=>allowed.has(h.id))),'generator-source-held');
  }
}
