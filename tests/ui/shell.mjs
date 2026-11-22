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
    await page.addInitScript(artifact => {
      // Test instrumentation only: open roots for browser assertions. Production is closed.
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) { return attach.call(this, { ...options, mode: 'open' }); };
      const gm = window === window.top ? { data: new Map(), listeners: new Map(), sequence: 0 } : window.top.__syntheticGM;
      window.__syntheticGM = gm;
      const data = gm.data;
      window.GM_registerMenuCommand = () => {};
      window.GM_openInTab = () => { throw new Error('UI smoke must not open workers'); };
      window.GM_addValueChangeListener = (key, callback) => { const id = ++gm.sequence; gm.listeners.set(id, { key, callback }); return id; };
      window.GM_removeValueChangeListener = id => gm.listeners.delete(id);
      window.GM_getValue = async (key, fallback) => data.get(key) ?? fallback;
      window.GM_setValue = async (key, value) => { const old = data.get(key); data.set(key, value); queueMicrotask(() => { for (const listener of gm.listeners.values()) if (listener.key === key) listener.callback(key, old, value, true); }); };
      window.unsafeWindow = { app: { store: { data: { user: { loggedIn: false } } } } };
      window.GM = { getValue: window.GM_getValue, setValue: window.GM_setValue, deleteValue: async key => data.delete(key) };
      if (window !== window.top && new URL(location.href).searchParams.has('pcms_store_probe')) {
        // Simulate manager injection inside the document. The probe intentionally
        // removes itself after its GM reply, so a protocol evaluation cannot await it.
        document.addEventListener('DOMContentLoaded', () => {
          const injected = document.createElement('script'); injected.textContent = artifact; document.documentElement.append(injected);
        }, { once: true });
      }
    }, script);
    await page.goto('https://perchance.org/welcome#pcms');
    await page.addScriptTag({ content: script });
    const app = page.locator('#pcms-root');
    await app.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
    try { await app.getByText('Coordinator Verified', { exact: true }).waitFor(); }
    catch(error) {
      console.log(JSON.stringify({browser:browserType,width,errors,coordinatorText:await app.locator('.statusline').allTextContents(),probeFrames:await page.locator('iframe[src*=pcms_store_probe]').count()}));
      throw error;
    }
    await page.waitForFunction(() => document.querySelectorAll('iframe[src*=pcms_store_probe]').length === 0);
    const baseline = await app.locator('.pagehead').boundingBox();
    for (const route of ['Generators', 'Reviews', 'Refresher']) {
      await app.getByRole('navigation').getByRole('button', { name: route, exact: true }).click();
      assert.equal(await app.getByRole('heading', { name: route, exact: true }).count(), 2);
      const box = await app.locator('.pagehead').boundingBox();
      assert.ok(Math.abs(box.x - baseline.x) <= 2 && Math.abs(box.y - baseline.y) <= 2 && Math.abs(box.height - baseline.height) <= 2);
    }
    await app.getByRole('button', { name: 'Settings', exact: true }).click();
    await app.getByLabel('Account ID', { exact: true }).fill('synthetic-account');
    await app.getByLabel('Repository URL', { exact: true }).fill('https://github.com/synthetic/staged-repository');
    await app.getByRole('navigation').getByRole('button', { name: 'Generators', exact: true }).click();
    await app.getByRole('button', { name: 'Settings', exact: true }).click();
    assert.equal(await app.getByLabel('Account ID', { exact: true }).inputValue(), 'synthetic-account');
    assert.equal(await app.getByLabel('Repository URL', { exact: true }).inputValue(), 'https://github.com/synthetic/staged-repository');
    page.once('dialog', d => d.accept('synthetic-secret-never-in-dom'));
    await app.getByRole('button', { name: 'Set PAT', exact: true }).click();
    assert.equal((await app.textContent()).includes('synthetic-secret-never-in-dom'), false);
    if (width <= 760) await app.getByRole('button', { name: 'Controls & system', exact: true }).click();
    await app.getByLabel('Polling interval (minutes)', { exact: true }).fill('0');
    await app.locator('.checks-card').getByRole('button', { name: 'Apply', exact: true }).click();
    await app.getByRole('status').filter({ hasText: 'Use an integer from 1 to 1440.' }).waitFor();
    assert.equal(await page.evaluate(async () => JSON.parse(await window.GM.getValue('PCMS_STORE_V1')).settings.pollMinutes), 10);
    await app.getByRole('button', { name: 'Toggle theme' }).click();
    await page.waitForFunction(() => document.querySelector('#pcms-root').dataset.theme === 'dark');
    assert.equal(await app.locator('h1').evaluate(n => getComputedStyle(n).color), 'rgb(238, 242, 250)');
    await app.getByRole('navigation').getByRole('button', { name: 'Overview', exact: true }).click();
    await app.getByRole('button', { name: 'Open Publication' }).focus();
    await page.keyboard.press('Enter');
    await app.getByRole('heading', { name: 'Utility', exact: true }).first().waitFor();
    await app.getByRole('button', { name: 'Back', exact: true }).click();
    assert.equal(await app.getByRole('heading', { name: 'Overview', exact: true }).count(), 1);
    await app.getByRole('button', { name: 'Show all', exact: true }).click();
    await app.getByRole('searchbox', { name: 'Search activity', exact: true }).fill('coordinator');
    const journalRow = app.getByRole('button', { name: 'Coordinator · verified', exact: true }).first();
    await journalRow.click();
    await app.getByRole('dialog', { name: 'Event details', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await app.getByRole('dialog').count(), 0);
    assert.equal(await journalRow.evaluate(n => n.getRootNode().activeElement === n), true);

    assert.equal(await page.locator('#native').textContent(), 'Native fixture');
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false);
    assert.equal(await app.locator('.shell').evaluate(n => n.scrollWidth > n.clientWidth), false);
    await page.screenshot({ path: `/tmp/pcms-shell-${width}.png` });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`UI shell PASS: ${browserType}, four widths, navigation, keyboard, theme, header stability and native page preservation`);
} finally { await browser.close(); }
