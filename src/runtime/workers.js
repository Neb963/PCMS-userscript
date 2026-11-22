import { requireThat, slug } from '../shared/domain.js';
import { acceptCommand } from './coordinator.js';
import { STORE_KEY } from '../state/store.js';

export const WORKER_ROLES = Object.freeze(['refresher', 'utility', 'development']);

export function workerURL(worker, targetSlug) {
  slug(targetSlug);
  return `https://perchance.org/${targetSlug}?pcms_worker=${encodeURIComponent(worker.id)}#edit${worker.fork ? ':new' : ''}`;
}

export class WorkerPool {
  constructor({ store, openTab, uuid = () => crypto.randomUUID(), now = () => Date.now() }) {
    this.store = store;
    this.openTab = openTab;
    this.uuid = uuid;
    this.now = now;
    this.handles = new Map();
  }

  async open(role, targetSlug, generatorId = null, fork = false) {
    requireThat(WORKER_ROLES.includes(role), 'invalid-worker-role');
    slug(targetSlug);
    const id = this.uuid();
    const result = await this.store.transact(state => {
      const active = Object.values(state.workers).filter(w => w.role === role && w.slotReleased!==true && !['retained', 'released'].includes(w.phase) && (role === 'development' || w.phase !== 'lost'));
      requireThat(active.length < (role === 'development' ? 2 : 1), 'worker-capacity');
      state.workers[id] = { id, role, generatorId, fork, slug: targetSlug, phase: 'opening', documentId: null, selected: false, observedAt: this.now() };
      return structuredClone(state.workers[id]);
    });
    try {
      const handle = await this.openTab(workerURL(result.result, targetSlug), { active: false, insert: true });
      requireThat(handle, 'tab-open-unconfirmed');
      this.handles.set(id, handle);
      handle.onclose = () => this.lost(id).catch(() => {});
    } catch {
      await this.lost(id);
      throw new Error('worker-open-unknown');
    }
    return result.result;
  }

  async lost(id) {
    await this.store.transact(state => {
      const worker = state.workers[id];
      if (!worker) return;
      worker.phase = 'lost';
      for (const job of Object.values(state.jobs)) {
        if (job.workerId !== id || !['prepared', 'dispatched'].includes(job.phase)) continue;
        job.phase = 'unknown';
        const gen = state.generators[job.generatorId];
        if (gen && !gen.holds.some(h => h.id === job.id)) gen.holds.push({ id: job.id, kind: 'worker-lost' });
      }
    });
  }

  async send(command) {
    await this.store.transact(state => {
      const worker = state.workers[command.workerId];
      requireThat(worker && (worker.phase === 'idle'||worker.phase==='retained'&&command.operatorAction===true) && worker.documentId === command.documentId && (!worker.selected || command.operatorAction === true), 'worker-unavailable');
      requireThat(!worker.inbox, 'worker-busy');
      worker.inbox = command.id;
      worker.phase = 'busy';
    });
  }

  async consume(coordinator) {
    if (!coordinator.active) return;
    const state = await this.store.read();
    for (const worker of Object.values(state.workers)) {
      const reply = worker.outbox;
      const command = reply && state.jobs[reply.jobId];
      if (!command || command.phase !== 'dispatched' || command.term !== coordinator.term || reply.term !== command.term) continue;
      await coordinator.acceptResult(command, reply.outcome);
      await this.store.transact(current => {
        coordinator.assertOwner(current);
        const own = current.workers[worker.id];
        requireThat(own?.documentId === reply.documentId, 'stale-worker-reply');
        if (own.outbox?.data !== undefined) current.jobs[command.id].data = structuredClone(own.outbox.data);
        if(command.kind==='navigate'&&reply.outcome==='verified')own.navigation={slug:command.target.slug,generatorId:command.target.id||null,fork:command.fork===true,term:command.term,expiresAt:this.now()+15000};
        if(command.kind.startsWith('refresh-')){own.nativeVerified=reply.outcome==='verified'&&['prepared','confirmed','restored'].includes(own.outbox?.data?.kind)||reply.outcome==='verified'&&own.outbox?.data?.kind==='failed'&&own.outbox.data.reusable===true;if(own.nativeVerified)own.nativeProofId=command.id;}
        if(command.kind==='navigate')own.nativeVerified=false;
        delete own.outbox;
        own.phase = reply.outcome === 'unknown' ? (own.role === 'development' ? 'busy' : 'retained') : own.slotReleased===true?'retained':'idle';
      });
    }
  }

  // No new tab or navigation on Review/Open editor. VM handles normally cannot
  // activate an existing tab; the UI must then tell the operator its retained name.
  async activate(id, explicitlyRequested) {
    requireThat(explicitlyRequested === true, 'activation-requires-operator');
    const worker = (await this.store.read()).workers[id];
    requireThat(worker && worker.phase !== 'released', 'retained-tab-unavailable');
    const handle = this.handles.get(id);
    if (handle && !handle.closed && typeof handle.focus === 'function') {
      handle.focus();
      return { activated: true };
    }
    return { activated: false, label: `${worker.slug} · ${worker.role}`, reason: worker.phase === 'lost' ? 'retained-tab-lost' : 'switch-to-retained-tab' };
  }
}

export function watchProtectedStore(addListener, removeListener, callback) {
  const id = addListener(STORE_KEY, () => callback());
  return () => removeListener(id);
}

export class WorkerRuntime {
  constructor({ store, id, documentId, doc, execute, beforeNavigate=async()=>{}, navigate=null, now = () => Date.now() }) {
    Object.assign(this, { store, id, documentId, doc, execute, beforeNavigate, navigate, now });
    this.busy = false;
  }

  async register() {
    await this.store.transact(state => {
      const worker = state.workers[this.id];
      requireThat(worker && worker.phase === 'opening', 'unassigned-worker');
      worker.documentId = this.documentId;
      worker.nativeVerified = false;
      delete worker.nativeProofId;
      worker.phase = 'idle';
      worker.selected = this.doc.visibilityState === 'visible';
      worker.observedAt = this.now();worker.pulse=(worker.pulse||0)+1;
    });
  }

  async observe() {
    const latest=(await this.store.read()).workers[this.id];
    if(latest?.navigation&&this.navigate&&this.doc.visibilityState!=='visible'){
      await this.beforeNavigate();
      const result=await this.store.transact(state=>{
        const own=state.workers[this.id],intent=own?.navigation;
        requireThat(own?.documentId===this.documentId&&own.phase==='idle','navigation-worker-changed');
        if(!intent||intent.expiresAt<this.now()||intent.term!==state.coordinator.term){delete own.navigation;return null;}
        requireThat(this.doc.visibilityState!=='visible','operator-selected-tab');
        Object.assign(own,{slug:intent.slug,generatorId:intent.generatorId,fork:intent.fork,phase:'opening',documentId:null});delete own.navigation;return workerURL(own,own.slug);
      });
      if(result.result){await this.navigate(result.result);return;}
    }
    await this.store.transact(state => {
      const worker = state.workers[this.id];
      requireThat(worker && worker.documentId === this.documentId, 'stale-worker');
      worker.selected = this.doc.visibilityState === 'visible';
      worker.observedAt = this.now();worker.pulse=(worker.pulse||0)+1;
    });
  }

  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      const state = await this.store.read();
      const worker = state.workers[this.id];
      if (!worker?.inbox || worker.documentId !== this.documentId) return;
      const command = state.jobs[worker.inbox];
      if (!command || command.accepted || command.phase !== 'dispatched') return;
      const accepted = await acceptCommand(this.store, command, { id: this.id, documentId: this.documentId });
      let result;
      try {
        requireThat(this.doc.visibilityState !== 'visible' || command.operatorAction === true, 'operator-selected-tab');
        result = await this.execute(accepted.result);
        requireThat(result && ['verified', 'rejected', 'unknown'].includes(result.outcome), 'unverified-worker-result');
      } catch { result = { outcome: 'unknown', reason: 'worker-operation-unconfirmed' }; }
      await this.store.transact(current => {
        const own = current.workers[this.id];
        requireThat(own?.documentId === this.documentId, 'worker-document-changed');
        own.outbox = { jobId: command.id, term: command.term, documentId: this.documentId, outcome: result.outcome, reason: result.reason || null, ...(result.data !== undefined ? { data: structuredClone(result.data) } : {}) };
        delete own.inbox;
        // Coordinator accepts the result before this worker can run another job.
      });
    } finally { this.busy = false; }
  }
}
