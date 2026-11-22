import { el, button } from './dom.js';
import { CSS } from './styles.js';

export const MAIN_ROUTES = Object.freeze(['overview', 'generators', 'reviews', 'refresher']);
export const TITLES = Object.freeze({ overview: 'Overview', generators: 'Generators', reviews: 'Reviews', refresher: 'Refresher', settings: 'Settings', utility: 'Utility', sync: 'GitHub sync', import: 'Bulk Import' });

export function publicSnapshot(state) {
  return {
    accountId: state.settings.account.accountId,
    theme: state.settings.theme,
    restored: true,
    storageAvailable: true,
    generators: Object.values(state.generators).map(g => ({ id: g.id, slug: g.slug, listing: g.listing, status: g.status, holds: g.holds, excluded: g.excluded })),
    journalCount: state.journal.length,
    coordinator: 'Unverified',
  };
}

export function mountShell(doc, host, { snapshot = { restored: false }, onTheme = async () => {}, renderers = {} } = {}) {
  const root = host.attachShadow({ mode: 'closed' });
  const style = el(doc, 'style', {}, CSS);
  let route = 'overview';
  let model = snapshot;
  const shell = el(doc, 'div', { className: 'shell' });
  const nav = el(doc, 'nav', { className: 'topnav', 'aria-label': 'Main navigation' });
  const tools = el(doc, 'div', { className: 'tools' });
  const main = el(doc, 'main', { className: 'content' });
  const status = el(doc, 'span', { className: 'account-label' }, model.accountId || 'Setup required');
  const navigate = next => {
    if (!Object.hasOwn(TITLES, next)) return;
    route = next;
    for (const control of nav.children) control.setAttribute('aria-current', control.dataset.route === route ? 'page' : 'false');
    settings.setAttribute('aria-pressed', String(route === 'settings'));
    const heading = el(doc, 'h1', { tabindex: '-1' }, TITLES[route]);
    const actions = el(doc, 'div', { className: 'toolbar' });
    if (['utility', 'sync', 'import'].includes(route)) actions.append(button(doc, 'Back', () => navigate(route === 'import' ? 'generators' : 'overview')));
    const body = el(doc, 'div', { className: 'body' });
    main.replaceChildren(el(doc, 'header', { className: 'pagehead' }, heading, actions), body);
    if (renderers[route]) renderers[route]({ doc, root, body, actions, snapshot: model, navigate });
    else renderBase(body);
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
    const control = button(doc, TITLES[key], () => navigate(key), { 'data-route': key });
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
    update(next) { model = next; status.textContent = model.accountId || 'Setup required'; host.dataset.theme = model.theme || 'light'; navigate(route); },
    get route() { return route; },
  };
}
