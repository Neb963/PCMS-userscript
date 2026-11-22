import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatus, formatStatus, sourcePath, completeSource, sourceEqual, generatorRecord, addHold, releaseHold, pendingUpdate, accountId } from '../../src/shared/domain.js';

const state = 'account: alpha\naction: develop\nstate: ready\n';
const gen = { id: '123', slug: 'synthetic-generator', listing: 'listed', status: parseStatus(state), holds: [] };
test('status has exactly three canonical fields and tolerates optional fields', () => {
  assert.equal(formatStatus(parseStatus(state + 'note: optional\n')), state);
  for (const bad of [state + 'state: done', state.replace('develop','refresh'), state.replace('ready','editing'), state.replace('account: alpha\n',''), '---\n'+state, state.replace('alpha', '')]) assert.throws(() => parseStatus(bad));
  assert.throws(() => accountId('alpha\nstate: done'));
});
test('independent holds survive individual resolution', () => {
  let g = generatorRecord(gen);
  g = addHold(g, { id: 'edit-1', kind: 'edit' });
  g = addHold(g, { id: 'write-1', kind: 'native-unknown' });
  g = releaseHold(g, 'edit-1');
  assert.deepEqual(g.holds, [{ id: 'write-1', kind: 'native-unknown' }]);
  assert.throws(() => generatorRecord({ ...g, listing: 'public' }));
  assert.throws(() => generatorRecord({ ...g, id: '' }));
  assert.throws(() => addHold(g, { id: 'x', kind: 'invented' }));
});
test('complete source preserves exact bytes, panel text and empty file trees', () => {
  const a = { pjs: '', html: '<p>test</p>\r\n', files: { 'assets/a.bin': new Uint8Array([0, 255]) } };
  const b = completeSource(a);
  assert.equal(sourceEqual(a, b), true);
  assert.equal(sourceEqual(a, { ...b, files: {} }), false);
  assert.equal(sourceEqual(b, { ...b, html: '<p>test</p>\n' }), false);
  for (const bad of ['../x', '/x', 'a/../x', 'a\\b', 'a//b', '.hidden', 'x?y']) assert.throws(() => sourcePath(bad));
  assert.throws(() => completeSource({ pjs: '', files: {} }));
  assert.throws(() => completeSource({ ...a, files: { 'x.bin': [256] } }));
  assert.deepEqual(Object.keys(completeSource({ pjs: '', html: '', files: {} }).files), []);
});
test('pending source requires identity, original repository, status and complete snapshot', () => {
  const base = { id: 'p1', generatorId: '123', slug: gen.slug, repository: { owner: 'synthetic', name: 'repo' }, baseCommit: 'a'.repeat(40), status: gen.status, kind: 'source' };
  assert.throws(() => pendingUpdate(base));
  const valid = pendingUpdate({ ...base, source: { pjs: 'a', html: 'b', files: {} } });
  assert.equal(valid.repository.name, 'repo');
  assert.throws(() => pendingUpdate({ ...base, kind: 'refresh' }));
});
