import { syncRecords, approvedLocal } from '../workflows/sync.js';
import { el, button } from './dom.js';
import { inventoryRows, generatorStates } from '../state/inventory.js';
import { actionCases, operationRows } from './overview-model.js';
import { exportJournal } from '../state/journal.js';
import { CSS, SETTINGS_CSS, OVERVIEW_CSS, INVENTORY_CSS, IMPORT_CSS, SYNC_CSS } from './styles.js';

export const MAIN_ROUTES = Object.freeze(['overview', 'generators', 'reviews', 'refresher']);
export const TITLES = Object.freeze({ overview: 'Overview', generators: 'Generators', reviews: 'Reviews', refresher: 'Refresher', settings: 'Settings', utility: 'Utility', sync: 'GitHub sync', import: 'Bulk Import' });

export function publicSnapshot(state, { session = null, coordinator = 'Unverified' } = {}) {
  return {
    accountId: state.settings.account.accountId,
    repositoryLabel: state.settings.github?.repository?state.settings.github.repository.owner+'/'+state.settings.github.repository.name:'Setup required',
    syncJobs:syncRecords(state).map(p=>{const g=state.generators[p.generatorId],terminal=['synced','stopped','reassigned','superseded'].includes(p.phase),writeUnknown=Object.values(state.jobs).some(j=>j.kind==='github'&&JSON.stringify(j.repository)===JSON.stringify(p.repository)&&j.slug===p.slug&&(['dispatched','unknown'].includes(j.phase)||j.remoteOutcome==='unknown'));const lastAction=Object.values(state.commands||{}).filter(c=>c.kind==='sync-action'&&c.pendingId===p.id).at(-1);return {actionBusy:['queued','running'].includes(lastAction?.phase),actionStatus:lastAction?.phase||null,actionReason:lastAction?.reason||null,id:p.id,generatorId:p.generatorId||null,slug:p.slug,repositoryLabel:p.repository.owner+'/'+p.repository.name,oldRepository:!!state.settings.github?.repository&&JSON.stringify(p.repository)!==JSON.stringify(state.settings.github.repository),phase:p.phase,terminal,writeUnknown,local:g?.localDone&&g?.savedVerified?'Verified':p.phase==='stopped'?'Stopped':'Unverified',refresher:g?generatorStates({...g,managed:true},state).refresher:'Not managed',hasSource:p.kind==='source',nativeVerified:p.nativeVerified===true,baseCommit:p.baseCommit,canCompare:p.phase==='source-conflict'&&approvedLocal(p,g)&&!writeUnknown,approvalLabel:p.approval?.id||'Unverified',requestConflict:['request-conflict','account-conflict'].includes(p.phase),destination:p.status.action==='develop'&&g?.holds?.some(h=>['review','development'].includes(h.kind))?'reviews':'utility'};}),
    theme: state.settings.theme,
    restored: true,
    storageAvailable: true,
    generators: inventoryRows(state).map(g => ({ id:g.id, slug:g.slug, listing:g.listing, status:g.status, holds:g.holds, excluded:g.excluded, managed:g.managed, ownerVerified:g.ownerVerified===true, savedVerified:g.savedVerified===true, localDone:g.localDone===true, localApproved:g.localApproved===true, states:generatorStates(g,state) })),
    utility: Object.values(state.requestQueue||{}).map(job=>{const r=state.utility?.[job.id];return {id:job.id,slug:job.request.slug,action:job.request.status.action,phase:r?.phase||job.phase,reason:job.reason||r?.reason||null,generatorId:r?.generatorId||null,steps:r?.steps||[]};}),
    utilityWorker: Object.values(state.workers).find(w=>w.role==='utility'&&!['released','lost','retained'].includes(w.phase))?.phase||'Unknown',
    journalCount: state.journal.length,
    coordinator,
    casesKnown: coordinator === 'Verified',
    cases: actionCases(state, { session }),
    operations: operationRows(state, coordinator, session),
    journal: exportJournal(state.journal),
  };
}

export function mountShell(doc, host, { snapshot = { restored: false }, onTheme = async () => {}, renderers = {} } = {}) {
  const root = host.attachShadow({ mode: 'closed' });
  const style = el(doc, 'style', {}, CSS + SETTINGS_CSS + OVERVIEW_CSS + INVENTORY_CSS + IMPORT_CSS + SYNC_CSS);
  let route = 'overview';
  let model = snapshot;
  let view = null;
  const shell = el(doc, 'div', { className: 'shell' });
  const nav = el(doc, 'nav', { className: 'topnav', 'aria-label': 'Main navigation' });
  const tools = el(doc, 'div', { className: 'tools' });
  const main = el(doc, 'main', { className: 'content' });
  const status = el(doc, 'span', { className: 'account-label' }, model.accountId || 'Setup required');
  const navigate = (next, params = {}) => {
    if (!Object.hasOwn(TITLES, next)) return;
    view?.dispose?.();
    route = next;
    for (const control of nav.children) control.setAttribute('aria-current', control.dataset.route === route ? 'page' : 'false');
    settings.setAttribute('aria-pressed', String(route === 'settings'));
    const heading = el(doc, 'h1', { tabindex: '-1' }, TITLES[route]);
    const actions = el(doc, 'div', { className: 'toolbar' });
    if (['utility', 'sync', 'import'].includes(route)) actions.append(button(doc, 'Back', () => navigate(route === 'import' ? 'generators' : 'overview')));
    const body = el(doc, 'div', { className: 'body' });
    main.replaceChildren(el(doc, 'header', { className: 'pagehead' }, heading, actions), body);
    if (renderers[route]) view = renderers[route]({ doc, root, body, actions, snapshot: model, navigate, params });
    else { view = null; renderBase(body); }
  };
  function panel(title, content) {
    return el(doc, 'section', { className: 'panel', 'aria-label': title }, el(doc, 'header', {}, el(doc, 'h2', {}, title)), el(doc, 'div', { className: 'scroll' }, content));
  }
  function renderBase(body) {
    if (route === 'overview') {
      const action = !model.restored ? 'Checking saved state…' : model.storageAvailable === false ? 'Storage unavailable' : model.accountId ? 'Session confirmation required' : 'Setup required';
      const operations = el(doc, 'div');
      for (const [name, destination] of [['Refresher', 'refresher'], ['AI Helper', 'reviews'], ['Publication', 'utility'], ['GitHub sync', 'sync']]) {
        operations.append(el(doc, 'div', { className: 'row' }, el(doc, 'div', {}, el(doc, 'strong', {}, name), el(doc, 'p', {}, 'Unknown')), button(doc, 'Open', () => navigate(destination), { className: 'link', 'aria-label': 'Open ' + name })));
      }
      const operationPanel = panel('Operations', operations);
      operationPanel.querySelector('header').append(el(doc, 'span', { className: 'statusline' }, 'Coordinator ' + (model.coordinator || 'Checking')));
      body.append(el(doc, 'div', { className: 'columns overview' },
        panel('Requires action', el(doc, 'div', { className: 'row' }, el(doc, 'div', {}, el(doc, 'strong', {}, action)), button(doc, 'Settings', () => navigate('settings')))),
        operationPanel,
        panel('Recent activity', el(doc, 'p', { className: 'empty' }, !model.restored ? 'Checking saved events…' : model.storageAvailable === false ? 'Journal unavailable' : model.journalCount === 0 ? 'No activity recorded' : 'Checking saved events…')),
      ));
    } else {
      const messages = { generators: 'No verified inventory loaded.', reviews: 'No verified development records loaded.', refresher: 'Worker Unknown. Queue unavailable.', utility: 'No verified publication records loaded.', sync: 'No verified synchronization records loaded.', settings: 'Configure this profile before starting native operations.' };
      body.append(panel(TITLES[route], el(doc, 'p', { className: 'empty' }, messages[route])));
    }
  }
  for (const key of MAIN_ROUTES) {
    const control = button(doc, TITLES[key], () => navigate(key), { 'data-route': key, 'aria-label': TITLES[key] });
    if (key === 'overview') control.append(el(doc, 'span', { className: 'tag', 'data-action-count': '', 'aria-hidden': 'true' }, model.restored && model.casesKnown && model.cases ? String(model.cases.length) : '—'));
    nav.append(control);
  }
  const settings = button(doc, '⚙', () => navigate('settings'), { className: 'icon', 'aria-label': 'Settings' });
  const theme = button(doc, '◐', async () => {
    theme.disabled = true;
    const next = host.dataset.theme === 'dark' ? 'light' : 'dark';
    try { await onTheme(next); host.dataset.theme = next; model = { ...model, theme: next }; }
    catch { theme.title = 'Theme could not be saved. Check storage in Settings.'; }
    finally { theme.disabled = false; }
  }, { className: 'icon', 'aria-label': 'Toggle theme' });
  tools.append(status, settings, theme);
  shell.append(el(doc, 'header', { className: 'topbar' }, el(doc, 'div', { className: 'brand' }, el(doc, 'span', { className: 'brand-mark', 'aria-hidden': 'true' }, '◇'), 'PCMS'), nav, tools), main);
  root.append(style, shell);
  host.dataset.theme = model.theme || 'light';
  navigate('overview');
  return {
    navigate,
    update(next) { model = next; const counter = nav.querySelector('[data-action-count]'); counter.textContent = model.restored && model.casesKnown && model.cases ? String(model.cases.length) : '—'; status.textContent = model.accountId || 'Setup required'; host.dataset.theme = model.theme || 'light'; if (view?.update) view.update(model); else navigate(route); },
    get route() { return route; },
  };
}
