import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Coordinator, acceptCommand } from '../../src/runtime/coordinator.js';
import { ProtectedStore } from '../../src/state/store.js';

function fixture() {
  const tails = new Map();
  const locks = { request: (key, options, run) => {
    const before = tails.get(key) || Promise.resolve();
    const current = before.catch(() => {}).then(() => {
      if (options.signal?.aborted) throw new Error('aborted');
      return run();
    });
    tails.set(key, current.catch(() => {}));
    return current;
  } };
  const data = new Map();
  const store = new ProtectedStore({ get: async k => data.get(k) ?? null, set: async (k,v) => data.set(k,v), locks });
  return { store, locks };
}
function started(coordinator, signal) {
  let ready;
  const acquired = new Promise(resolve => { ready = resolve; });
  const done = coordinator.run(signal, () => ready());
  return { acquired, done };
}
const worker = { id: 'worker-1', documentId: 'document-1' };
const job = { id: 'save-1', kind: 'save', workerId: worker.id, documentId: worker.documentId, generatorId: '123' };
test('one cooperative coordinator, durable takeover and no redispatch after owner loss', async () => {
  const f = fixture();
  await f.store.transact(s => { s.generators['123'] = { holds: [] }; });
  const a = new Coordinator({ ...f, owner: 'a' }), b = new Coordinator({ ...f, owner: 'b' });
  const abortA = new AbortController(), abortB = new AbortController();
  const first = started(a, abortA.signal);
  await first.acquired;
  const second = started(b, abortB.signal);
  assert.equal(a.active, true);
  assert.equal(b.active, false);
  await a.claim(job);
  let sent;
  await a.dispatch(job.id, async command => { sent = command; });
  await acceptCommand(f.store, sent, worker);
  await assert.rejects(acceptCommand(f.store, sent, worker), /duplicate/);
  abortA.abort();
  await first.done;
  await second.acquired;
  assert.equal(b.term, 2);
  assert.equal((await f.store.read()).jobs[job.id].phase, 'unknown');
  assert.equal((await f.store.read()).generators['123'].holds[0].kind, 'native-unknown');
  await assert.rejects(acceptCommand(f.store, sent, worker), /stale/);
  await assert.rejects(b.claim({ ...job, id: 'save-2' }), /held/);
  await assert.rejects(a.acceptResult(sent, 'verified'), /stale/);
  abortB.abort(); await second.done;
});
test('duplicate dispatch, wrong document and unknown transport cannot repeat effect', async () => {
  const f = fixture(), c = new Coordinator({ ...f, owner: 'a' }), abort = new AbortController();
  const run = started(c, abort.signal); await run.acquired;
  await c.claim(job);
  let sent;
  await c.dispatch(job.id, async command => { sent = command; });
  await assert.rejects(acceptCommand(f.store, sent, { ...worker, documentId: 'wrong' }), /wrong-worker/);
  await acceptCommand(f.store, sent, worker);
  await c.acceptResult(sent, 'verified');
  await assert.rejects(c.dispatch(job.id, () => {}), /not-dispatchable/);
  await c.claim({ ...job, id: 'save-2' });
  await assert.rejects(c.dispatch('save-2', () => { throw new Error('lost'); }), /unknown/);
  assert.equal((await f.store.read()).jobs['save-2'].phase, 'unknown');
  await assert.rejects(c.dispatch('save-2', () => {}), /not-dispatchable/);
  abort.abort(); await run.done;
});
