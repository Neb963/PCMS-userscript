import { appendEvent } from '../state/journal.js';
import { requireThat } from '../shared/domain.js';

export const COORDINATOR_LOCK = 'pcms:coordinator:v1';

function interruptJobs(state) {
  for (const command of Object.values(state.commands || {})) if (command.phase === 'running') command.phase = 'unknown';
  for (const job of Object.values(state.jobs)) {
    if (job.phase !== 'dispatched') continue;
    job.phase = 'unknown';
    const generator = state.generators[job.generatorId];
    if (generator && !generator.holds.some(h => h.id === job.id)) generator.holds.push({ id: job.id, kind: job.kind === 'helper' ? 'helper-unknown' : 'native-unknown' });
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
      if (job.generatorId) requireThat(!Object.values(state.jobs).some(j => j.generatorId === job.generatorId && ['prepared', 'dispatched', 'unknown'].includes(j.phase)), 'generator-write-held');
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
          if (gen && !gen.holds.some(h => h.id === id)) gen.holds.push({ id, kind: job.kind === 'helper' ? 'helper-unknown' : 'native-unknown' });
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
      if (outcome === 'unknown') {
        const gen = state.generators[job.generatorId];
        if (gen && !gen.holds.some(h => h.id === job.id)) gen.holds.push({ id: job.id, kind: job.kind === 'helper' ? 'helper-unknown' : 'native-unknown' });
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
