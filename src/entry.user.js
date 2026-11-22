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
// ==/UserScript==

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
  host.style.cssText = 'position:fixed;inset:0;background:#f7f8fb;color:#202938;z-index:2147483647;padding:28px;font:14px system-ui';
  const root = host.attachShadow({ mode: 'closed' });
  const heading = document.createElement('h1');
  heading.textContent = 'PCMS';
  const message = document.createElement('p');
  message.textContent = 'Setup required. Management capabilities are being implemented.';
  root.append(heading, message);
  document.body.append(host);
} else {
  installLauncher(document, launch);
}
