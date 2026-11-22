import { appendEvent } from '../../state/journal.js';
import { GitHubWriter } from './writer.js';
import { requireThat } from '../../shared/domain.js';
import { GitHubReader } from './reader.js';

export class GitHubPoller {
  constructor({ store, request, now = () => Date.now() }) { Object.assign(this, { store, request, now }); this.nextAt = 0; this.busy = false; this.client = null; this.config = null; }

  writer({ locks, guard }) {
    requireThat(this.client, 'github-client-unavailable');
    return new GitHubWriter({ reader: this.client, store: this.store, locks, guard });
  }

  async check(scheduled = false) {
    if (this.busy) return false;
    const state = await this.store.read();
    const config = state.settings.github;
    if (!config || !state.settings.account.accountId) return false;
    const now = this.now();
    if(this.config!==null&&this.config!==JSON.stringify(config))this.nextAt=0;
    if(this.interval!==undefined&&this.interval!==state.settings.pollMinutes)this.nextAt=now+state.settings.pollMinutes*60000;
    this.interval=state.settings.pollMinutes;
    if (scheduled && now < this.nextAt) return false;
    if (scheduled) this.nextAt = now + state.settings.pollMinutes * 60000;
    this.busy = true;
    try {
      const key = JSON.stringify(config);
      if (key !== this.config) { this.client = new GitHubReader({ ...config, request: this.request }); this.config = key; }
      const snapshot = await this.client.snapshot();
      const requests = await this.client.requests(snapshot, state.settings.account.accountId);
      await this.store.transact(current => {
        if (JSON.stringify(current.settings.github) !== key) return;
        if (current.githubCheck?.commit !== snapshot.commit || current.githubCheck?.status === 'offline') appendEvent(current, { component: 'github', outcome: 'verified' });
        current.githubSnapshot = snapshot;
        current.requests = requests;
        current.githubCheck = { status: 'verified', at: now, commit: snapshot.commit };
      });
      return true;
    } catch {
      await this.store.transact(current => { if (JSON.stringify(current.settings.github) === JSON.stringify(config)) { if (current.githubCheck?.status !== 'offline') appendEvent(current, { component: 'github', outcome: 'offline' }); current.githubCheck = { ...current.githubCheck, status: 'offline', attemptedAt: now }; } });
      return false;
    } finally { this.busy = false; }
  }
}
