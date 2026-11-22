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
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// ==/UserScript==

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
  let consuming = false;
  const tick = async () => {
    if (consuming || !coordinator.active) return;
    consuming = true;
    try { await pool.consume(coordinator); } catch { /* Durable state retains the unresolved command. */ }
    finally { consuming = false; }
  };
  const unwatch = watchProtectedStore(GM_addValueChangeListener, GM_removeValueChangeListener, tick);
  coordinator.run(lifecycle.signal, async () => {
    if (ui) ui.update({ ...publicSnapshot(await store.read()), coordinator: 'Verified' });
    await tick();
  }).catch(() => { if (ui) ui.update({ restored: true, storageAvailable: store.available, coordinator: 'Unverified' }); });
  window.addEventListener('pagehide', () => { unwatch(); lifecycle.abort(); coordinator.stop(); }, { once: true });
  return { coordinator, pool };
}

async function startAssignedWorker() {
  const tab = await new Promise(resolve => GM_getTab(resolve));
  const requested = new URL(location.href).searchParams.get('pcms_worker');
  const id = tab.pcmsWorker || requested;
  if (!id) return;
  const store = new ProtectedStore({ get: GM_getValue, set: GM_setValue, locks: navigator.locks });
  const runtime = new WorkerRuntime({ store, id, documentId: crypto.randomUUID(), doc: document, execute: async () => ({ outcome: 'rejected', reason: 'capability-unavailable' }) });
  await runtime.register();
  GM_saveTab({ ...tab, pcmsWorker: id });
  const cleanURL = new URL(location.href);
  cleanURL.searchParams.delete('pcms_worker');
  history.replaceState(history.state, '', cleanURL);
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
  const store = new ProtectedStore({ get: GM_getValue, set: GM_setValue, locks: navigator.locks });
  const ui = mountShell(document, host, { onTheme: theme => store.transact(state => { state.settings.theme = theme; }) });
  store.read().then(state => { ui.update(publicSnapshot(state)); coordinate(store, ui); }).catch(() => ui.update({ restored: true, storageAvailable: false }));
  document.body.append(host);
} else {
  installLauncher(document, launch);
  startAssignedWorker().catch(() => { /* Never repeat an unconfirmed worker action. */ });
}
