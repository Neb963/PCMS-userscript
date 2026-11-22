import { requireThat, completeSource, sourceEqual, pendingUpdate } from '../shared/domain.js';

export const STORE_KEY = 'PCMS_STORE_V1';
export const STORE_LOCK = 'pcms:store:v1';

export function emptyState() {
  return {
    schema: 1, revision: 0, writeId: '',
    settings: { account: { accountId: '', locked: false, confirmed: false }, github: null, pollMinutes: 10, theme: 'light', refreshCap: 30, refreshPaused: true },
    coordinator: { term: 0, owner: null },
    generators: {}, jobs: {}, pending: {}, workers: {}, commands: {},
    fifo: [], attempts: [], journal: [], journalSequence: 0,
  };
}

export function validateState(value) {
  requireThat(value && value.schema === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0 && typeof value.writeId === 'string', 'unsupported-store');
  for (const key of ['settings', 'coordinator', 'generators', 'jobs', 'pending', 'workers']) requireThat(value[key] && typeof value[key] === 'object' && !Array.isArray(value[key]), 'invalid-store');
  for (const key of ['fifo', 'attempts', 'journal']) requireThat(Array.isArray(value[key]), 'invalid-store');
  requireThat(Number.isSafeInteger(value.coordinator.term) && value.coordinator.term >= 0, 'invalid-coordinator-term');
  for (const p of Object.values(value.pending)) {
    pendingUpdate(p);
    if (p.kind === 'source') completeSource(p.source);
  }
  for (const [key, job] of Object.entries(value.jobs)) requireThat(job && job.id === key && ['prepared', 'dispatched', 'unknown', 'verified', 'rejected', 'cancelled'].includes(job.phase), 'invalid-job');
  return value;
}

export class ProtectedStore {
  constructor({ get, set, locks, uuid = () => crypto.randomUUID() }) {
    this.get = get;
    this.set = set;
    this.locks = locks;
    this.uuid = uuid;
    this.available = false;
  }

  async read() {
    try {
      const raw = await this.get(STORE_KEY, null);
      const value = raw === null ? emptyState() : validateState(JSON.parse(raw));
      this.available = true;
      return structuredClone(value);
    } catch {
      this.available = false;
      throw new Error('storage-unavailable');
    }
  }

  async transact(change) {
    requireThat(this.locks?.request, 'storage-lock-unavailable');
    return this.locks.request(STORE_LOCK, { mode: 'exclusive' }, async () => {
      const current = await this.read();
      const next = structuredClone(current);
      const result = change(next);
      requireThat(!result?.then, 'async-storage-mutation');
      next.revision = current.revision + 1;
      next.writeId = this.uuid();
      const raw = JSON.stringify(validateState(next));
      try {
        await this.set(STORE_KEY, raw);
        const actual = await this.get(STORE_KEY, null);
        requireThat(actual === raw, 'storage-readback-mismatch');
      } catch {
        this.available = false;
        throw new Error('storage-write-unconfirmed');
      }
      this.available = true;
      return { state: structuredClone(next), result: structuredClone(result) };
    });
  }

  async retainSource(update, prepare = () => {}) {
    const canonical = pendingUpdate(update);
    requireThat(canonical.kind === 'source', 'snapshot-required');
    await this.transact(state => {
      requireThat(!Object.hasOwn(state.pending, canonical.id), 'snapshot-already-exists');
      prepare(state);
      state.pending[canonical.id] = { ...canonical, phase: 'prepared', listingIntent: update.listingIntent, draftId: update.draftId, retainedTab: update.retainedTab };
    });
    const saved = (await this.read()).pending[canonical.id];
    requireThat(saved && sourceEqual(saved.source, canonical.source) && JSON.stringify(saved.repository) === JSON.stringify(canonical.repository), 'snapshot-readback-mismatch');
    return saved;
  }

  async prepareAction(job) {
    requireThat(job && typeof job.id === 'string' && job.id && typeof job.kind === 'string', 'invalid-action');
    await this.transact(state => {
      requireThat(!Object.hasOwn(state.jobs, job.id), 'duplicate-action');
      state.jobs[job.id] = { ...structuredClone(job), phase: 'prepared' };
    });
  }

  // This acknowledgement is durable before callers send the external action.
  async markDispatched(id) {
    await this.transact(state => {
      requireThat(state.jobs[id]?.phase === 'prepared', 'action-not-prepared');
      state.jobs[id].phase = 'dispatched';
    });
  }

  async recoverInterrupted() {
    return this.transact(state => {
      for (const job of Object.values(state.jobs)) {
        if (job.phase !== 'dispatched') continue;
        job.phase = 'unknown';
        const generator = state.generators[job.generatorId];
        if (generator && !generator.holds.some(h => h.id === job.id)) generator.holds.push({ id: job.id, kind: job.kind === 'helper' ? 'helper-unknown' : 'native-unknown' });
      }
    });
  }
}
