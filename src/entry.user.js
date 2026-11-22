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
// ==/UserScript==

import { ProtectedStore } from './state/store.js';
import { mountShell, publicSnapshot } from './ui/shell.js';
import { isAppPage, openPCMS, installLauncher, APP_NAME } from './runtime/launch.js';

function launch() {
  const result = openPCMS(window);
  if (!result.opened) window.alert('PCMS could not activate its tab. Allow popups or switch to the existing PCMS tab.');
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
  store.read().then(state => ui.update(publicSnapshot(state))).catch(() => ui.update({ restored: true, storageAvailable: false }));
  document.body.append(host);
} else {
  installLauncher(document, launch);
}
