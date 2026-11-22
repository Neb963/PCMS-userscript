import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const path = new URL('../references/PCMS-authoritative-specification-v1.4.md', import.meta.url);
const spec = readFileSync(path, 'utf8');
const discovery = readFileSync(new URL('../references/perchance-discovery.md', import.meta.url), 'utf8');
const plan = readFileSync(new URL('../to-do.md', import.meta.url), 'utf8');

test('product reference retains fixed foundational decisions', () => {
  for (const expected of ['account_id', 'publish_from_github', 'Refresher', '## 8. Accepted UI/UX']) {
    assert.ok(spec.includes(expected), `missing: ${expected}`);
  }
});
test('discovery identifies native save and full source', () => {
  assert.match(discovery, /\/api\/save/);
  assert.match(discovery, /srcManifest/);
});
test('phase plan starts with bootstrap and ends with release', () => {
  assert.match(plan, /### P00 — Repository bootstrap/);
  assert.match(plan, /### P31 — Release/);
});
