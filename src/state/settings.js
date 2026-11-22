import { appendEvent } from './journal.js';
import { requireThat } from '../shared/domain.js';
import { GitHubReader, parseRepositoryURL } from '../adapters/github/reader.js';

export function repositoryKey(repo) { return `${repo.owner}/${repo.name}`.toLowerCase(); }

export function pendingWork(state) {
  const work = [];
  for (const p of Object.values(state.pending)) if (p.phase !== 'synced' || (p.source && state.generators[p.generatorId]?.holds?.length)) work.push({ id: p.id, generatorId: p.generatorId, slug: p.slug, repository: p.repository, kind: 'sync' });
  for (const j of Object.values(state.jobs)) if (['prepared','dispatched','unknown'].includes(j.phase)) work.push({ id: j.id, generatorId: j.generatorId || null, slug: j.slug || null, repository: j.repository || state.settings.github?.repository || null, kind: j.kind });
  for (const g of Object.values(state.generators)) if (g.holds?.some(h => ['edit','development','review','cancelled-draft'].includes(h.kind))) work.push({ id: 'draft-' + g.id, generatorId: g.id, slug: g.slug, repository: g.repository || state.settings.github?.repository || null, kind: 'draft' });
  for (const command of Object.values(state.commands || {})) if (['queued','running','unknown','blocked'].includes(command.phase)) work.push({ id:command.id,generatorId:null,slug:null,repository:command.repository,kind:command.kind });
  return work.sort((a,b)=>a.id.localeCompare(b.id));
}

export class SettingsController {
  constructor({ store, request }) { Object.assign(this, { store, request }); this.draft = { repositoryURL: '', pat: '' }; this.revision = 0; this.tested = null; this.initialized = false; }

  initialize(state) {
    if (this.initialized) return;
    const config = state.settings.github;
    this.draft = { repositoryURL: config ? `https://github.com/${config.repository.owner}/${config.repository.name}` : '', pat: config?.pat || '' };
    this.initialized = true;
  }

  edit(field, value) {
    requireThat(['repositoryURL','pat'].includes(field) && typeof value === 'string', 'invalid-setting-field');
    this.draft[field] = value;
    this.revision++;
    this.tested = null;
  }

  async test() {
    const revision = this.revision;
    const candidate = { repository: parseRepositoryURL(this.draft.repositoryURL), pat: this.draft.pat };
    const reader = new GitHubReader({ ...candidate, request: this.request });
    await reader.snapshot();
    requireThat(revision === this.revision, 'candidate-changed-during-test');
    this.tested = { revision, candidate };
    return true;
  }

  async switchWork() {
    const state = await this.store.read(), current = state.settings.github, next = this.tested?.candidate;
    if (!current || !next || JSON.stringify(current) === JSON.stringify(next)) return [];
    return pendingWork(state);
  }

  async apply(acknowledgedWork = null) {
    requireThat(this.tested?.revision === this.revision, 'test-candidate-first');
    const candidate = structuredClone(this.tested.candidate), revision = this.revision;
    return this.store.transact(state => {
      requireThat(revision === this.revision && this.tested?.revision === revision, 'candidate-changed');
      const current = state.settings.github, changed = current && JSON.stringify(current) !== JSON.stringify(candidate);
      const work = changed ? pendingWork(state) : [];
      requireThat(work.length === 0 || JSON.stringify(work) === JSON.stringify(acknowledgedWork), 'pending-switch-confirmation-required');
      state.settings.repositoryCredentials ||= {};
      if (current && repositoryKey(current.repository) !== repositoryKey(candidate.repository) && work.some(w => w.repository && repositoryKey(w.repository) === repositoryKey(current.repository))) state.settings.repositoryCredentials[repositoryKey(current.repository)] = current.pat;
      state.settings.github = candidate;
      delete state.settings.repositoryCredentials[repositoryKey(candidate.repository)];
      state.githubCheck = { status: 'checking' };
      appendEvent(state, { component: 'settings', outcome: 'applied' });
    });
  }

  async credentialFor(repo) {
    const state = await this.store.read(), current = state.settings.github;
    if (current && repositoryKey(current.repository) === repositoryKey(repo)) return current.pat;
    const pat = state.settings.repositoryCredentials?.[repositoryKey(repo)];
    requireThat(pat, 'original-repository-access-unavailable');
    return pat;
  }

  async setPolling(value) {
    requireThat(Number.isInteger(value) && value >= 1 && value <= 1440, 'invalid-poll-interval');
    return this.store.transact(s => { s.settings.pollMinutes = value; });
  }
}
