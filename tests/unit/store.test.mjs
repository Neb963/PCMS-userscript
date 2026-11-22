import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProtectedStore, STORE_KEY } from '../../src/state/store.js';
import { accountConfig, requestIdentity } from '../../src/shared/domain.js';

function fixture() {
  const data = new Map();
  let chain = Promise.resolve(), counter = 0;
  const locks = { request: (_key, _options, run) => {
    const result = chain.then(run);
    chain = result.catch(() => {});
    return result;
  } };
  const api = { get: async k => data.get(k) ?? null, set: async (k, v) => data.set(k, v), locks, uuid: () => 'write-' + ++counter };
  return { data, api, store: new ProtectedStore(api) };
}
const update = { id: 'snapshot-1', generatorId: '123', slug: 'synthetic-generator', repository: { owner: 'synthetic', name: 'repo' }, baseCommit: 'a'.repeat(40), kind: 'source', status: { account: 'alpha', action: 'develop', state: 'done' }, source: { pjs: 'output\n  test', html: '<b>test</b>', files: { 'a.bin': [0, 255] } }, listingIntent: 'listed', draftId: 'draft-1', retainedTab: 'tab-1' };
test('protected snapshot and unresolved action survive restart with independent holds', async () => {
  const f = fixture();
  await f.store.retainSource(update);
  await f.store.transact(s => { s.generators['123'] = { holds: [{ id: 'edit-1', kind: 'edit' }] }; });
  await f.store.prepareAction({ id: 'save-1', kind: 'save', generatorId: '123' });
  await f.store.markDispatched('save-1');
  const restarted = new ProtectedStore(f.api);
  await restarted.recoverInterrupted();
  const s = await restarted.read();
  assert.deepEqual(s.pending['snapshot-1'].source.files['a.bin'], [0, 255]);
  assert.equal(s.jobs['save-1'].phase, 'unknown');
  assert.equal(s.generators['123'].holds.length, 2);
  await assert.rejects(restarted.markDispatched('save-1'), /not-prepared/);
  await assert.rejects(restarted.prepareAction({ id: 'save-1', kind: 'save' }), /duplicate/);
});
test('quota failure and mismatching readback cannot authorize Save', async () => {
  const f = fixture();
  const store = new ProtectedStore({ ...f.api, set: async () => { throw new Error('quota'); } });
  await assert.rejects(store.retainSource(update), /unconfirmed/);
  assert.equal(store.available, false);
  const corrupt = new ProtectedStore({ ...f.api, set: async (key, raw) => f.data.set(key, raw + 'x') });
  await assert.rejects(corrupt.retainSource(update), /unconfirmed/);
  await assert.rejects(corrupt.read(), /storage-unavailable/);
  assert.ok(f.data.get(STORE_KEY).endsWith('x'));
});
test('serialized transactions retain both independent edits', async () => {
  const { store } = fixture();
  await Promise.all([store.transact(s => { s.fifo.push('one'); }), store.transact(s => { s.fifo.push('two'); })]);
  assert.deepEqual((await store.read()).fifo, ['one', 'two']);
  assert.equal((await store.read()).revision, 2);
});
test('unsupported schema is preserved and never reset on failure', async () => {
  const f = fixture();
  const old = '{"schema":99,"pending":{"important":"keep"}}';
  f.data.set(STORE_KEY, old);
  await assert.rejects(f.store.transact(s => { s.fifo = []; }), /storage-unavailable/);
  assert.equal(f.data.get(STORE_KEY), old);
  await assert.rejects(new ProtectedStore({ ...f.api, locks: null }).transact(() => {}), /lock-unavailable/);
});
test('manual binding and claimed request validation are explicit', () => {
  assert.deepEqual(accountConfig({ accountId: 'alpha', locked: true, confirmed: false }), { accountId: 'alpha', locked: true, confirmed: false });
  assert.throws(() => accountConfig({ accountId: 'alpha', locked: 'true' }));
  assert.throws(() => requestIdentity({ commit: 'bad' }));
});
