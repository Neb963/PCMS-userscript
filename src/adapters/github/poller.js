import { GitHubReader } from './reader.js';

export class GitHubPoller {
  constructor({ store, request, now = () => Date.now() }) { Object.assign(this, { store, request, now }); this.nextAt = 0; this.busy = false; this.client = null; this.config = null; }

  async check(scheduled = false) {
    if (this.busy) return false;
    const state = await this.store.read();
    const config = state.settings.github;
    if (!config || !state.settings.account.accountId) return false;
    const now = this.now();
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
        current.githubSnapshot = snapshot;
        current.requests = requests;
        current.githubCheck = { status: 'verified', at: now, commit: snapshot.commit };
      });
      return true;
    } catch {
      await this.store.transact(current => { if (JSON.stringify(current.settings.github) === JSON.stringify(config)) current.githubCheck = { ...current.githubCheck, status: 'offline', attemptedAt: now }; });
      return false;
    } finally { this.busy = false; }
  }
}
