// ==UserScript==
// @name         PCMS
// @namespace    https://github.com/Neb963/PCMS-userscript
// @version      0.1.0
// @description  Perchance account management with protected local state.
// @match        https://perchance.org/*
// @run-at       document-end
// @noframes
// @inject-into  content
// @grant        GM_registerMenuCommand
// @connect      perchance.org
// @connect      user.uploads.dev
// @connect      api.github.com
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// ==/UserScript==

import { SettingsController } from './state/settings.js';
import { settingsRenderer } from './ui/settings.js';
import { GitHubPoller } from './adapters/github/poller.js';
import { privilegedRequest } from './adapters/http.js';
import { PerchanceReader } from './adapters/perchance/reader.js';
import { NativePage, SessionGate } from './adapters/perchance/session.js';
import { WorkerPool, WorkerRuntime, watchProtectedStore } from './runtime/workers.js';
import { Coordinator } from './runtime/coordinator.js';
import { ProtectedStore } from './state/store.js';
import { mountShell, publicSnapshot } from './ui/shell.js';
import { isAppPage, openPCMS, installLauncher, APP_NAME } from './runtime/launch.js';

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
  const tick = async () => {
    if (consuming || !coordinator.active) return;
    consuming = true;
    try { await pool.consume(coordinator); await poller.check(true); } catch { /* Durable state retains the unresolved command. */ }
    finally { consuming = false; }
  };
  const unwatch = watchProtectedStore(GM_addValueChangeListener, GM_removeValueChangeListener, tick);
  coordinator.run(lifecycle.signal, async () => {
    if (ui) ui.update({ ...publicSnapshot(await store.read()), coordinator: 'Verified' });
    await tick();
  }).catch(() => { if (ui) ui.update({ restored: true, storageAvailable: store.available, coordinator: 'Unverified' }); });
  const timer = setInterval(tick, 1000);
  window.addEventListener('pagehide', () => { clearInterval(timer); unwatch(); lifecycle.abort(); coordinator.stop(); }, { once: true });
  return { coordinator, pool, poller };
}

async function startAssignedWorker() {
  const requested = new URL(location.href).searchParams.get('pcms_worker');
  const retained = window.name.startsWith('PCMS_WORKER_') ? window.name.slice('PCMS_WORKER_'.length) : null;
  const id = requested || retained;
  if (!id) return;
  const store = new ProtectedStore({ get: (key, fallback) => GM.getValue(key, fallback), set: (key, value) => GM.setValue(key, value), locks: navigator.locks });
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
  window.addEventListener('pagehide', () => { unwatch(); document.removeEventListener('visibilitychange', observe); }, { once: true });
  await runtime.pump();
}

GM_registerMenuCommand('Open PCMS', launch);
if (isAppPage(location)) {
  window.name = APP_NAME;
  document.title = 'PCMS';
  const host = document.createElement('div');
  host.id = 'pcms-root';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow:hidden;display:block;isolation:isolate';
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  const store = new ProtectedStore({ get: (key, fallback) => GM.getValue(key, fallback), set: (key, value) => GM.setValue(key, value), locks: navigator.locks });
  const request = (url, options) => privilegedRequest(GM_xmlhttpRequest, url, options);
  const native = new NativePage(unsafeWindow);
  const gate = new SessionGate(store, native);
  const controller = new SettingsController({ store, request });
  const poller = new GitHubPoller({ store, request });
  const ui = mountShell(document, host, {
    onTheme: theme => store.transact(state => { state.settings.theme = theme; }),
    renderers: { settings: settingsRenderer({ store, controller, gate, poller,
      requestCredential: () => window.prompt('GitHub PAT — stored only in Violentmonkey. Leave blank to clear the candidate.', ''),
      signIn: () => GM_openInTab('https://perchance.org/welcome?pcms_sign_in=1', { active: true }),
    }) },
  });
  store.read().then(state => { controller.initialize(state); ui.update(publicSnapshot(state)); coordinate(store, ui); }).catch(() => ui.update({ restored: true, storageAvailable: false }));
  document.body.append(host);
} else {
  installLauncher(document, launch);
  if (new URL(location.href).searchParams.get('pcms_sign_in') === '1') {
    const signIn = () => { const control = document.querySelector('[data-ref="loginButton"]'); if (control) { control.click(); return true; } return false; };
    if (!signIn()) { const observer = new MutationObserver(() => { if (signIn()) observer.disconnect(); }); observer.observe(document.documentElement, { childList: true, subtree: true }); setTimeout(() => observer.disconnect(), 15000); }
  }
  startAssignedWorker().catch(() => { /* Never repeat an unconfirmed worker action. */ });
}
