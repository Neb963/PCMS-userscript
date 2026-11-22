import { requireThat, repository, accountId, slug, sourcePath, parseStatus, completeSource } from '../../shared/domain.js';

export function parseRepositoryURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('invalid-repository-url'); }
  requireThat(url.protocol === 'https:' && url.hostname === 'github.com' && !url.port && !url.username && !url.password && !url.search && !url.hash, 'invalid-repository-url');
  const parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
  requireThat(parts.length === 2, 'invalid-repository-url');
  return repository({ owner: parts[0], name: parts[1].replace(/\.git$/, '') });
}

export function bytesToBase64(value) {
  const bytes = Uint8Array.from(value);
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

export function base64ToBytes(text) {
  requireThat(typeof text === 'string' && /^[A-Za-z0-9+/=\r\n]*$/.test(text), 'invalid-blob-base64');
  try { return Uint8Array.from(atob(text.replace(/[\r\n]/g, '')), c => c.charCodeAt(0)); }
  catch { throw new Error('invalid-blob-base64'); }
}

export async function blobHash(bytes) {
  const prefix = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const data = new Uint8Array(prefix.length + bytes.length);
  data.set(prefix); data.set(bytes, prefix.length);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', data)), b => b.toString(16).padStart(2, '0')).join('');
}

export function commitSha(value) {
  requireThat(typeof value === 'string' && /^[a-f0-9]{40}$/.test(value), 'invalid-github-sha');
  return value;
}

export class GitHubReader {
  #pat;
  constructor({ repository: repo, pat, request }) {
    this.repository = repository(repo);
    requireThat(typeof pat === 'string' && pat.length > 0 && !/[\s\x00-\x1f\x7f]/.test(pat), 'invalid-github-credential');
    this.#pat = pat;
    this.request = request;
    this.blobs = new Map();
    this.cached = null;
  }

  api(path, options = {}) {
    requireThat(/^\/(?:git\/|commits(?:\?|\/|$)|$)/.test(path), 'unsupported-github-api');
    const { owner, name } = this.repository;
    const url = `https://api.github.com/repos/${owner}/${name}${path}`;
    return this.request(url, { ...options, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + this.#pat, 'X-GitHub-Api-Version': '2022-11-28' } });
  }

  async head() {
    const reply = await this.api('/git/ref/heads/main');
    requireThat(reply?.object?.type === 'commit', 'github-main-unavailable');
    return commitSha(reply.object.sha);
  }

  async snapshot(at = null) {
    const commit = at === null ? await this.head() : commitSha(at);
    if (this.cached?.commit === commit) return structuredClone(this.cached);
    const record = await this.api('/git/commits/' + commit);
    requireThat(record.sha === commit, 'github-commit-mismatch');
    const treeSha = commitSha(record.tree?.sha);
    const reply = await this.api('/git/trees/' + treeSha + '?recursive=1');
    requireThat(reply.sha === treeSha && reply.truncated === false && Array.isArray(reply.tree), 'github-tree-incomplete');
    const entries = Object.create(null);
    for (const file of reply.tree) {
      requireThat(typeof file.path === 'string' && !/[\\\x00-\x1f]/.test(file.path) && file.path.split('/').every(p => p && p !== '.' && p !== '..') && !Object.hasOwn(entries, file.path), 'github-path-invalid');
      requireThat(['tree', 'blob', 'commit'].includes(file.type), 'github-entry-invalid');
      entries[file.path] = { path: file.path, sha: commitSha(file.sha), type: file.type, mode: file.mode };
    }
    const result = { repository: this.repository, commit, treeSha, entries };
    this.cached = structuredClone(result);
    return result;
  }

  async bytes(snapshot, path) {
    requireThat(JSON.stringify(snapshot.repository) === JSON.stringify(this.repository), 'github-repository-changed');
    const entry = snapshot.entries[path];
    requireThat(entry?.type === 'blob' && entry.mode === '100644', 'github-file-missing-or-unsupported');
    if (this.blobs.has(entry.sha)) return Uint8Array.from(this.blobs.get(entry.sha));
    const reply = await this.api('/git/blobs/' + entry.sha);
    requireThat(reply.sha === entry.sha && reply.encoding === 'base64', 'github-blob-invalid');
    const bytes = base64ToBytes(reply.content);
    requireThat(reply.size === bytes.length && await blobHash(bytes) === entry.sha, 'github-blob-corrupt');
    this.blobs.set(entry.sha, Array.from(bytes));
    return bytes;
  }

  async text(snapshot, path) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(await this.bytes(snapshot, path)); }
    catch { throw new Error('github-text-unavailable'); }
  }

  async source(snapshot, targetSlug) {
    slug(targetSlug);
    const files = Object.create(null), prefix = targetSlug + '/src/';
    for (const [path, entry] of Object.entries(snapshot.entries)) {
      if (!path.startsWith(prefix) || entry.type === 'tree') continue;
      const relative = sourcePath(path.slice(prefix.length));
      files[relative] = Array.from(await this.bytes(snapshot, path));
    }
    return completeSource({ pjs: await this.text(snapshot, targetSlug + '/main.pjs'), html: await this.text(snapshot, targetSlug + '/main.html'), files });
  }

  async requests(snapshot, account) {
    accountId(account);
    const results = [];
    for (const path of Object.keys(snapshot.entries).filter(p => /^[^/]+\/status\.md$/.test(p)).sort()) {
      const targetSlug = path.split('/')[0];
      try {
        slug(targetSlug);
        const status = parseStatus(await this.text(snapshot, path));
        if (status.account !== account) continue;
        const commits = await this.api('/commits?path=' + encodeURIComponent(path) + '&sha=' + snapshot.commit + '&per_page=1');
        requireThat(Array.isArray(commits) && commits.length === 1, 'request-history-unavailable');
        const requestCommit = commitSha(commits[0].sha);
        const instructions = Object.values(snapshot.entries).filter(e => e.path === targetSlug + '/prompt.md' || e.path.startsWith(targetSlug + '/scratch/')).map(e => [e.path, e.sha]);
        let readyTransition = false;
        if (status.state === 'ready') {
          const parent = commits[0].parents?.[0]?.sha;
          if (parent) {
            const previous = await this.snapshot(commitSha(parent));
            if (!previous.entries[path]) readyTransition = true;
            else readyTransition = ['done', 'blocked'].includes(parseStatus(await this.text(previous, path)).state);
          } else if (Array.isArray(commits[0].parents) && commits[0].parents.length === 0) readyTransition = true;
        }
        const record = { slug: targetSlug, repository: this.repository, commit: snapshot.commit, requestCommit, readyTransition, status, instructions, valid: true };
        if (status.action === 'publish_from_github' && ['ready', 'reserved'].includes(status.state)) await this.source(snapshot, targetSlug);
        if (status.action === 'develop' && ['ready', 'reserved'].includes(status.state)) requireThat((await this.text(snapshot, targetSlug + '/prompt.md')).trim(), 'prompt-required');
        results.push(record);
      } catch { results.push({ slug: targetSlug, repository: this.repository, commit: snapshot.commit, valid: false, reason: 'request-invalid-or-incomplete' }); }
    }
    return results;
  }
}

export function requestDisposition(incoming, prior) {
  if (!incoming.valid) return 'blocked';
  if (!['ready', 'reserved'].includes(incoming.status.state)) return 'inactive';
  if (!prior) return 'queue';
  if (JSON.stringify(prior.repository) !== JSON.stringify(incoming.repository)) return 'repository-conflict';
  if (prior.status.account !== incoming.status.account) return 'account-conflict';
  if (prior.requestCommit === incoming.requestCommit) {
    if (prior.closed) return 'stale';
    return JSON.stringify(prior.instructions) === JSON.stringify(incoming.instructions) ? 'resume' : 'request-conflict';
  }
  if (!prior.closed) return 'request-conflict';
  return incoming.status.state === 'ready' && incoming.readyTransition === true ? 'queue' : 'stale';
}
