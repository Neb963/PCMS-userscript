import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { resolve } from 'node:path';
import { bundle } from '../../scripts/build.mjs';
import { openPCMS, APP_URL, isAppPage } from '../../src/runtime/launch.js';

test('deterministic isolated production build with strict metadata', async () => {
  const a = await bundle(resolve('src/entry.user.js'));
  assert.equal(a, await bundle(resolve('src/entry.user.js')));
  assert.match(a, /@inject-into\s+content/);
  assert.match(a, /@noframes/);
  assert.match(a, /@match\s+https:\/\/perchance.org\/\*/);
  assert.equal((a.match(/==UserScript==/g) || []).length, 1);
  assert.doesNotMatch(a, /SIMULATION|NAMES =|\beval\s*\(|new Function|^import /m);
  new vm.Script(a);
});
test('launcher reuses without reload and never hijacks another page', () => {
  let navigations = 0, focused = 0;
  const target = { location: { href: APP_URL, replace: () => navigations++ }, focus: () => focused++ };
  const win = { open: () => target };
  assert.equal(openPCMS(win).opened, true);
  assert.equal(openPCMS(win).opened, true);
  assert.equal(navigations, 0);
  assert.equal(focused, 2);
  target.location.href = 'https://example.org';
  assert.equal(openPCMS(win).opened, false);
  assert.equal(navigations, 0);
  assert.equal(openPCMS({ open: () => null }).reason, 'popup-blocked');
  assert.equal(isAppPage(new URL(APP_URL)), true);
  assert.equal(isAppPage(new URL('https://perchance.org/a#pcms')), false);
});
