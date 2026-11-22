import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Standard local/CI dependency; Work Mode can reuse its provided runtime copy.
let playwright;
try { playwright = await import('playwright'); }
catch {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw new Error('Install dev dependencies to run UI tests');
  playwright = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/loader.cjs')('playwright');
}
const browserType = process.env.PCMS_UI_BROWSER || 'chromium';
const browser = await playwright[browserType].launch({ headless: true, ...(process.env.PCMS_UI_EXECUTABLE ? { executablePath: process.env.PCMS_UI_EXECUTABLE } : {}) });
const script = await readFile(resolve('dist/PCMS.user.js'), 'utf8');
const errors = [];
try {
  for (const width of [1440, 1024, 530, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 768 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://perchance.org/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic Perchance</title><body><p id="native">Native fixture</p></body>' }));
    await page.addInitScript(() => {
      // Test instrumentation only: open roots for browser assertions. Production is closed.
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) { return attach.call(this, { ...options, mode: 'open' }); };
      const data = new Map();
      window.GM_registerMenuCommand = () => {};
      window.GM_openInTab = () => { throw new Error('UI smoke must not open workers'); };
      window.GM_addValueChangeListener = () => 1;
      window.GM_removeValueChangeListener = () => {};
      window.GM_getValue = async (key, fallback) => data.get(key) ?? fallback;
      window.GM_setValue = async (key, value) => data.set(key, value);
    });
    await page.goto('https://perchance.org/welcome#pcms');
    await page.addScriptTag({ content: script });
    const app = page.locator('#pcms-root');
    await app.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
    const baseline = await app.locator('.pagehead').boundingBox();
    for (const route of ['Generators', 'Reviews', 'Refresher']) {
      await app.getByRole('navigation').getByRole('button', { name: route, exact: true }).click();
      assert.equal(await app.getByRole('heading', { name: route, exact: true }).count(), 2);
      const box = await app.locator('.pagehead').boundingBox();
      assert.ok(Math.abs(box.x - baseline.x) <= 2 && Math.abs(box.y - baseline.y) <= 2 && Math.abs(box.height - baseline.height) <= 2);
    }
    await app.getByRole('button', { name: 'Settings', exact: true }).click();
    await app.getByRole('button', { name: 'Toggle theme' }).click();
    await page.waitForFunction(() => document.querySelector('#pcms-root').dataset.theme === 'dark');
    assert.equal(await app.locator('h1').evaluate(n => getComputedStyle(n).color), 'rgb(238, 242, 250)');
    await app.getByRole('navigation').getByRole('button', { name: 'Overview', exact: true }).click();
    await app.getByRole('button', { name: 'Open Publication' }).focus();
    await page.keyboard.press('Enter');
    await app.getByRole('heading', { name: 'Utility', exact: true }).first().waitFor();
    await app.getByRole('button', { name: 'Back', exact: true }).click();
    assert.equal(await app.getByRole('heading', { name: 'Overview', exact: true }).count(), 1);
    assert.equal(await page.locator('#native').textContent(), 'Native fixture');
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false);
    assert.equal(await app.locator('.shell').evaluate(n => n.scrollWidth > n.clientWidth), false);
    await page.screenshot({ path: `/tmp/pcms-shell-${width}.png` });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`UI shell PASS: ${browserType}, four widths, navigation, keyboard, theme, header stability and native page preservation`);
} finally { await browser.close(); }
