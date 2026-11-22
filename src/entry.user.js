// ==UserScript==
// @name         PCMS
// @namespace    https://github.com/Neb963/PCMS-userscript
// @version      0.1.0
// @description  Perchance account management with protected local state.
// @match        https://perchance.org/*
// @run-at       document-end
// @inject-into  content
// @grant        GM_info
// @grant        GM_registerMenuCommand
// @connect      perchance.org
// @connect      user.uploads.dev
// @connect      api.github.com
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// ==/UserScript==

import { CommandRunner } from './runtime/commands.js';
import { BulkImport } from './workflows/import.js';
import { GitHubReader } from './adapters/github/reader.js';
import { GitHubWriter } from './adapters/github/writer.js';
import { isolatedManager, requireGitHubWriteProof } from './runtime/context.js';
import { importRenderer } from './ui/import.js';
import { InventoryController } from './state/inventory.js';
import { inventoryRenderer } from './ui/inventory.js';
import { overviewRenderer } from './ui/overview.js';
import { SettingsController } from './state/settings.js';
import { settingsRenderer } from './ui/settings.js';
import { GitHubPoller } from './adapters/github/poller.js';
import { privilegedRequest } from './adapters/http.js';
import { PerchanceReader } from './adapters/perchance/reader.js';
import { NativePage, SessionGate } from './adapters/perchance/session.js';
import { WorkerPool, WorkerRuntime, watchProtectedStore } from './runtime/workers.js';
import { Coordinator } from './runtime/coordinator.js';
import { CoherentStore, freshStoreProbe, serveStoreProbe } from './state/coherent-store.js';
import { mountShell, publicSnapshot } from './ui/shell.js';
import { isAppPage, openPCMS, installLauncher, APP_NAME } from './runtime/launch.js';

function createStore(probeHost = document.body) {
  const api = { get: (key, fallback) => GM.getValue(key, fallback), set: (key, value) => GM.setValue(key, value), addListener: GM_addValueChangeListener, removeListener: GM_removeValueChangeListener };
  return new CoherentStore({ ...api, clearProbe: () => GM.deleteValue('PCMS_STORE_PROBE_V1'), locks: navigator.locks, probe: freshStoreProbe({ doc: document, host: probeHost, ...api }) });
}

function launch() {
  const result = openPCMS(window);
  if (!result.opened) window.alert('PCMS could not activate its tab. Allow popups or switch to the existing PCMS tab.');
}

function coordinate(store, ui = null) {
  const lifecycle = new AbortController();
  const coordinator = new Coordinator({ store, locks: navigator.locks, owner: crypto.randomUUID() });
  const pool = new WorkerPool({ store, openTab: GM_openInTab });
  const poller = new GitHubPoller({ store, request: (url, options) => privilegedRequest(GM_xmlhttpRequest, url, options) });
  let consuming = false;
  let lastPulse = 0;
  const mountedAt = Date.now();
  const gate = new SessionGate(store, new NativePage(unsafeWindow));
  const importWorkflow = async command => {
    const state = await store.read();
    const repo = command?.repository || state.settings.github?.repository;
    if (!repo) throw new Error('github-setup-required');
    const credentials = new SettingsController({ store, request: null });
    const request = async (url, options) => privilegedRequest(GM_xmlhttpRequest, url, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + await credentials.credentialFor(repo) } });
    const github = new GitHubReader({ repository: repo, pat: await credentials.credentialFor(repo), request });
    const native = new NativePage(unsafeWindow);
    const guard = async () => coordinator.assertOwner(await store.read());
    const writer = new GitHubWriter({ reader: github, store, locks: navigator.locks, guard: async () => { await guard(); requireGitHubWriteProof(); } });
    return new BulkImport({ store, reader: new PerchanceReader({ native, gate, request: (url, options) => privilegedRequest(GM_xmlhttpRequest, url, options) }), github, writer, gate, guard, assertCurrent: current => coordinator.assertOwner(current), writeAllowed: requireGitHubWriteProof });
  };
  const commands = new CommandRunner({ store, coordinator, importWorkflow });
  let updating = false;
  const refresh = async () => {
    if (!ui || updating) return;
    updating = true;
    try { const state = await store.read(); const session = await gate.observe(); const verified = coordinator.active || (state.coordinator.observedAt >= mountedAt && Date.now() - state.coordinator.observedAt < 15000); ui.update(publicSnapshot(state, { session, coordinator: verified ? 'Verified' : 'Unverified' })); }
    catch { ui.update({ restored: true, storageAvailable: false, coordinator: 'Unverified' }); }
    finally { updating = false; }
  };
  const tick = async () => {
    if (consuming || !coordinator.active) return;
    consuming = true;
    try {
      if (Date.now() - lastPulse >= 5000) { await store.transact(state => { coordinator.assertOwner(state); state.coordinator.observedAt = Date.now(); }); lastPulse = Date.now(); }
      await pool.consume(coordinator); commands.tick().catch(() => {}); await poller.check(true);
    } catch { /* Durable state retains the unresolved command. */ }
    finally { consuming = false; }
  };
  const unwatch = watchProtectedStore(GM_addValueChangeListener, GM_removeValueChangeListener, () => { tick(); refresh(); });
  coordinator.run(lifecycle.signal, async () => {
    await refresh();
    await tick();
  }).catch(() => { store.available = false; if (ui) ui.update({ restored: true, storageAvailable: false, coordinator: 'Unverified' }); });
  const timer = setInterval(tick, 1000);
  const viewTimer = ui ? setInterval(refresh, 5000) : null;
  window.addEventListener('pagehide', () => { clearInterval(timer); clearInterval(viewTimer); unwatch(); lifecycle.abort(); coordinator.stop(); }, { once: true });
  return { coordinator, pool, poller, importWorkflow };
}

async function startAssignedWorker() {
  const requested = new URL(location.href).searchParams.get('pcms_worker');
  const retained = window.name.startsWith('PCMS_WORKER_') ? window.name.slice('PCMS_WORKER_'.length) : null;
  const id = requested || retained;
  if (!id) return;
  const store = createStore();
  const runtime = new WorkerRuntime({ store, id, documentId: crypto.randomUUID(), doc: document, execute: async command => {
    const native = new NativePage(unsafeWindow);
    const gate = new SessionGate(store, native);
    const reader = new PerchanceReader({ native, gate, request: (url, options) => privilegedRequest(GM_xmlhttpRequest, url, options) });
    if (command.kind === 'read-saved') {
      await gate.requireOwner(command.target);
      return { outcome: 'verified', data: await reader.saved(command.target.slug, command.target.id) };
    }
    if (command.kind !== 'inspect-target') return { outcome: 'rejected', reason: 'capability-unavailable' };
    await gate.requireOwner(command.target);
    await native.ready(command.target);
    return { outcome: 'verified' };
  } });
  try { await runtime.register(); }
  catch { await new WorkerPool({ store, openTab: GM_openInTab }).lost(id); return; }
  window.name = 'PCMS_WORKER_' + id;
  coordinate(store);
  const unwatch = watchProtectedStore(GM_addValueChangeListener, GM_removeValueChangeListener, () => { runtime.pump().catch(() => {}); });
  const observe = () => { runtime.observe().catch(() => {}); };
  document.addEventListener('visibilitychange', observe);
  const heartbeat = setInterval(observe, 5000);
  window.addEventListener('pagehide', () => { clearInterval(heartbeat); unwatch(); document.removeEventListener('visibilitychange', observe); }, { once: true });
  await runtime.pump();
}

if (!isolatedManager(typeof GM_info === 'undefined' ? null : GM_info)) {
  if (window.top === window.self) GM_registerMenuCommand('Open PCMS', () => window.alert('PCMS requires Violentmonkey isolated content execution before it can access protected settings.'));
} else if (window.top !== window.self) {
  const nonce = new URL(location.href).searchParams.get('pcms_store_probe');
  if (nonce) serveStoreProbe({ get: (key, fallback) => GM.getValue(key, fallback), set: (key, value) => GM.setValue(key, value), nonce }).catch(() => {});
} else {
GM_registerMenuCommand('Open PCMS', launch);
if (isAppPage(location)) {
  window.name = APP_NAME;
  document.title = 'PCMS';
  const host = document.createElement('div');
  host.id = 'pcms-root';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow:hidden;display:block;isolation:isolate';
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  const store = createStore();
  const request = (url, options) => privilegedRequest(GM_xmlhttpRequest, url, options);
  const native = new NativePage(unsafeWindow);
  const gate = new SessionGate(store, native);
  const inventory = new InventoryController({ store, native, gate, reader: new PerchanceReader({ native, gate, request }) });
  const controller = new SettingsController({ store, request });
  const poller = new GitHubPoller({ store, request });
  let runtime;
  const ui = mountShell(document, host, {
    onTheme: theme => store.transact(state => { state.settings.theme = theme; }),
    renderers: { import: importRenderer({ store, workflow: () => runtime.importWorkflow() }), generators: inventoryRenderer({ controller: inventory, project: state => publicSnapshot(state, { coordinator: runtime?.coordinator.active ? 'Verified' : 'Unverified' }) }), overview: overviewRenderer({ activateRetained: id => runtime.pool.activate(id, true) }), settings: settingsRenderer({ store, controller, gate, poller,
      requestCredential: () => window.prompt('GitHub PAT — stored only in Violentmonkey. Leave blank to clear the candidate.', ''),
      signIn: () => GM_openInTab('https://perchance.org/welcome?pcms_sign_in=1', { active: true }),
    }) },
  });
  store.read().then(state => { controller.initialize(state); ui.update(publicSnapshot(state)); runtime = coordinate(store, ui); }).catch(() => ui.update({ restored: true, storageAvailable: false }));
  document.body.append(host);
} else {
  installLauncher(document, launch);
  if (new URL(location.href).searchParams.get('pcms_sign_in') === '1') {
    const signIn = () => { const control = document.querySelector('[data-ref="loginButton"]'); if (control) { control.click(); return true; } return false; };
    if (!signIn()) { const observer = new MutationObserver(() => { if (signIn()) observer.disconnect(); }); observer.observe(document.documentElement, { childList: true, subtree: true }); setTimeout(() => observer.disconnect(), 15000); }
  }
  startAssignedWorker().catch(() => { /* Never repeat an unconfirmed worker action. */ });
}

}
