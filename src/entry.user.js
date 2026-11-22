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

import { reviewPublicationDialog } from './ui/approval.js';
import { ApprovedPublication } from './workflows/approved-publication.js';
import { reviewsRenderer } from './ui/reviews.js';
import { DevelopmentActions,enqueueDevelopmentAction } from './development/actions.js';
import { Development } from './development/controller.js';
import { NativeHelper } from './development/native.js';
import { RefresherSettings } from './refresher/view.js';
import { refresherRenderer } from './ui/refresher.js';
import { PulseMonitor } from './runtime/health.js';
import { NativeRefresher } from './refresher/native.js';
import { RefresherController } from './refresher/controller.js';
import { guardNativeCommand } from './runtime/coordinator.js';
import { RefreshScheduler } from './refresher/scheduler.js';
import { Synchronizer, enqueueSyncAction } from './workflows/sync.js';
import { syncRenderer } from './ui/sync.js';
import { RequestRunner } from './runtime/requests.js';
import { Publication } from './workflows/publication.js';
import { utilityRenderer } from './ui/utility.js';
import { NativeActions } from './adapters/perchance/actions.js';
import { SlugReader } from './adapters/perchance/slugs.js';
import { Reservation } from './workflows/reservation.js';
import { NativeClient } from './runtime/native-client.js';
import { requireLiveCapability } from './adapters/perchance/session.js';
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
  const scheduler=new RefreshScheduler({store,bootId:coordinator.owner,available:state=>state.settings.account.confirmed&&Object.values(state.workers).some(w=>w.role==='refresher'&&w.phase==='idle'&&w.documentId&&!w.selected),guard:async()=>coordinator.assertOwner(await store.read()),assertCurrent:current=>coordinator.assertOwner(current)});
  const health=new PulseMonitor();
  let consuming = false;
  let lastPulse = 0;
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
    try { const session = await gate.observe(); const state = await store.read(); const pulse=health.observe('coordinator',JSON.stringify([state.coordinator.owner,state.coordinator.term,state.coordinator.pulse||0]));const verified = coordinator.active || pulse&&state.coordinator.pulse>0; ui.update(publicSnapshot(state, { session, coordinator: verified ? 'Verified' : 'Unverified' })); }
    catch { ui.update({ restored: true, storageAvailable: false, coordinator: 'Unverified' }); }
    finally { updating = false; }
  };
  const tick = async () => {
    if (consuming || !coordinator.active) return;
    consuming = true;
    try {
      if (performance.now()-lastPulse>=5000||performance.now()<lastPulse||!lastPulse) { await store.transact(state => { coordinator.assertOwner(state);state.coordinator.observedAt=Date.now();state.coordinator.pulse=(state.coordinator.pulse||0)+1;const input=scheduler.project(state),worker=Object.values(state.workers).find(w=>w.role==='refresher'&&!['retained','released','lost'].includes(w.phase));const workerFresh=worker&&health.observe('worker-'+worker.id,JSON.stringify([worker.documentId,worker.pulse||0,worker.nativeProofId||null]));state.refreshView={owner:coordinator.owner,term:coordinator.term,logicalAt:input.clock.logical,restartAt:input.clock.restartAt,observedAt:Date.now(),workerId:worker?.id||null,documentId:worker?.documentId||null,workerKnown:workerFresh&&worker.nativeVerified===true};}); lastPulse = performance.now(); }
      scheduler.reconcile().catch(()=>{});await pool.consume(coordinator);
      if(!requests.busy&&!commands.busy)commands.tick().then(()=>requests.tick()).catch(()=>{});
      publisher.tick().catch(()=>{});
      developmentActions.tick().catch(()=>{});
      development.tick().catch(()=>{});
      refresher.tick().catch(()=>{});synchronizer.tickCommands().catch(()=>{});synchronizer.tick().catch(()=>{});await poller.check(true);
    } catch { /* Durable state retains the unresolved command. */ }
    finally { consuming = false; }
  };
  const unwatch = watchProtectedStore(GM_addValueChangeListener, GM_removeValueChangeListener, () => { tick(); refresh(); });
  Promise.resolve().then(()=>coordinator.run(lifecycle.signal, async () => {
    await refresh();
    await tick();
  })).catch(() => { store.available = false; if (ui) ui.update({ restored: true, storageAvailable: false, coordinator: 'Unverified' }); });
  const timer = setInterval(tick, 1000);
  const viewTimer = ui ? setInterval(refresh, 5000) : null;
  window.addEventListener('pagehide', () => { clearInterval(timer); clearInterval(viewTimer); unwatch(); lifecycle.abort(); coordinator.stop(); }, { once: true });
  const reservationWorkflow=async request=>{
    // Preflight before opening any native worker. Live qualification is required.
    requireLiveCapability('create');requireLiveCapability('rename');requireLiveCapability('listing');requireGitHubWriteProof();
    const services=await importWorkflow({repository:request.repository});
    return new Reservation({store,reader:services.reader,gate,github:services.github,writer:services.writer,slugs:new SlugReader({request:(url,options)=>privilegedRequest(GM_xmlhttpRequest,url,options),reader:services.reader}),native:new NativeClient({store,pool,coordinator}),guard:services.guard,assertCurrent:current=>coordinator.assertOwner(current)});
  };
  const requests=new RequestRunner({store,coordinator,factory:async request=>{const reservation=await reservationWorkflow(request);if(request.status.action==='develop')return {run:async(request,id)=>{const reserved=await reservation.run(request,id);if(reserved.phase!=='reserved')return reserved;await development.enqueue(request,id,reserved);return {phase:'development',closed:false};}};return new Publication({reservation,store,github:reservation.github,native:reservation.native,reader:reservation.reader,gate,locks:navigator.locks,guard:reservation.guard,assertCurrent:current=>coordinator.assertOwner(current)});}});
  const development=new Development({store,services:async repository=>importWorkflow({repository}),nativeFactory:async record=>new NativeClient({store,pool,coordinator,role:'development',workerId:record.workerId}),guard:async()=>coordinator.assertOwner(await store.read()),assertCurrent:current=>coordinator.assertOwner(current)});
  const publisher=new ApprovedPublication({store,nativeFactory:async record=>new NativeClient({store,pool,coordinator,role:'development',workerId:record.workerId}),reader:new PerchanceReader({native:new NativePage(unsafeWindow),gate,request:(url,options)=>privilegedRequest(GM_xmlhttpRequest,url,options)}),gate,guard:async()=>coordinator.assertOwner(await store.read()),assertCurrent:current=>coordinator.assertOwner(current)});
  const developmentActions=new DevelopmentActions({store,publisher,nativeFactory:async record=>new NativeClient({store,pool,coordinator,role:'development',workerId:record.workerId}),guard:async()=>coordinator.assertOwner(await store.read()),assertCurrent:current=>coordinator.assertOwner(current)});
  const synchronizer=new Synchronizer({store,services:async repo=>{const service=await importWorkflow({repository:repo});return {github:service.github,writer:service.writer,reader:service.reader};},guard:async()=>coordinator.assertOwner(await store.read()),assertCurrent:current=>coordinator.assertOwner(current),importWorkflow});
  const refresher=new RefresherController({store,scheduler,nativeFactory:async()=>new NativeClient({store,pool,coordinator,role:'refresher'}),locks:navigator.locks,guard:async()=>coordinator.assertOwner(await store.read()),assertCurrent:current=>coordinator.assertOwner(current)});
  return { coordinator, pool, poller, importWorkflow, reservationWorkflow, requests, synchronizer, scheduler, refresher, development, developmentActions, publisher };
}

async function startAssignedWorker() {
  const requested = new URL(location.href).searchParams.get('pcms_worker');
  const retained = window.name.startsWith('PCMS_WORKER_') ? window.name.slice('PCMS_WORKER_'.length) : null;
  const id = requested || retained;
  if (!id) return;
  const store = createStore();
  const cleanNavigation=async()=>{if(unsafeWindow.perchanceSaveState!=='saved'||unsafeWindow.srcState?.isDirty?.()!==false)throw new Error('dirty-editor-navigation-blocked');};
  let helper=null;
  const runtime = new WorkerRuntime({ store, id, documentId: crypto.randomUUID(), doc: document, beforeNavigate:cleanNavigation,navigate:url=>location.assign(url), execute: async command => {
    const native = new NativePage(unsafeWindow);
    const gate = new SessionGate(store, native);
    const reader = new PerchanceReader({ native, gate, request: (url, options) => privilegedRequest(GM_xmlhttpRequest, url, options) });
    if(command.kind==='navigate'){await cleanNavigation();return {outcome:'verified'};}
    const actions=new NativeActions({page:unsafeWindow,native,gate,reader,doc:document,store,workerId:id,documentId:command.documentId,actionId:command.id,operatorAction:command.operatorAction===true,guard:async()=>guardNativeCommand(await store.read(),command,id),exporter:typeof exportFunction==='function'?exportFunction:null});
    if(command.kind==='approved-capture')return {outcome:'verified',data:await actions.captureApproved(command.target)};
    if(command.kind==='approved-save')return {outcome:'verified',data:await actions.saveApproved(command.target,command.payload.pendingId,command.payload.approvalId)};
    if(command.kind==='approved-listing'){requireLiveCapability('listing');return {outcome:'verified',data:await actions.listing(command.target,'listed')};}
    if(command.kind==='helper-stop'||command.kind==='helper-resolve'){const observed=new NativeHelper({actions,store,native,reader,gate});return {outcome:'verified',data:command.kind==='helper-stop'?await observed.stop(command.payload.developmentId):await observed.resolve(command.payload.developmentId)};}
    if(command.kind==='helper-start'){helper?.dispose();helper=new NativeHelper({actions,store,native,reader,gate});try{return {outcome:'verified',data:await helper.start(command.target,command.payload.developmentId)};}catch(error){helper.dispose();throw error;}}
    if(command.kind==='refresh-prepare'||command.kind==='refresh-save'||command.kind==='refresh-restore'){const refresher=new NativeRefresher({actions,store,native,gate,reader});return {outcome:'verified',data:command.kind==='refresh-prepare'?await refresher.prepare(command.target,command.payload.markerId):command.kind==='refresh-restore'?await refresher.abort(command.target,command.payload.markerId):await refresher.save(command.target,command.payload.markerId)};}
    if(command.kind==='native-deploy')return {outcome:'verified',data:await actions.deploy(command.target,command.payload.pendingId)};
    if(command.kind==='native-create')return {outcome:'verified',data:await actions.create(command.payload.actionId)};
    if(command.kind==='native-listing')return {outcome:'verified',data:await actions.listing(command.target,command.payload.intent)};
    if(command.kind==='native-rename')return {outcome:'verified',data:await actions.rename(command.target,command.payload.targetSlug)};
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
  let observing=false;
  const observe = async () => { if(observing)return;observing=true;try{await runtime.observe();if(helper){const state=await store.read(),record=Object.values(state.development||{}).find(r=>r.workerId===id&&r.documentId===runtime.documentId&&['starting','running','submitting'].includes(r.phase));if(record)await helper.inspect(record.id);else helper.dispose();}}catch{}finally{observing=false;} };
  document.addEventListener('visibilitychange', observe);
  const heartbeat = setInterval(observe, 5000);
  window.addEventListener('pagehide', () => { clearInterval(heartbeat); helper?.dispose(); unwatch(); document.removeEventListener('visibilitychange', observe); }, { once: true });
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
    renderers: { reviews:reviewsRenderer({action:(id,action,confirmed)=>enqueueDevelopmentAction(store,id,action,confirmed),activate:id=>runtime.pool.activate(id,true),publish:reviewPublicationDialog(store)}), refresher:refresherRenderer({controller:new RefresherSettings(store),project:state=>publicSnapshot(state,{coordinator:runtime?.coordinator.active?'Verified':'Unverified'})}), sync: syncRenderer({store,service:()=>({compare:id=>runtime.synchronizer.compare(id),syncOne:id=>enqueueSyncAction(store,'recheck',id),decide:(token,choice,confirmed)=>runtime.synchronizer.enqueueDecision(token,choice,confirmed),reassign:(id,confirmed)=>enqueueSyncAction(store,'reassign',id,{confirmed}),stop:(id,confirmed)=>enqueueSyncAction(store,'stop',id,{confirmed})}),project:state=>publicSnapshot(state,{coordinator:runtime?.coordinator.active?'Verified':'Unverified'})}), utility: utilityRenderer(), import: importRenderer({ store, workflow: () => runtime.importWorkflow() }), generators: inventoryRenderer({ controller: inventory, project: state => publicSnapshot(state, { coordinator: runtime?.coordinator.active ? 'Verified' : 'Unverified' }) }), overview: overviewRenderer({ activateRetained: id => runtime.pool.activate(id, true) }), settings: settingsRenderer({ store, controller, gate, poller,
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
