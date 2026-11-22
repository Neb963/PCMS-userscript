import { requireThat, slug, completeSource, formatStatus } from '../../shared/domain.js';
import { blobHash, bytesToBase64, commitSha } from './reader.js';

export function folderVersion(snapshot, targetSlug) {
  slug(targetSlug);
  return JSON.stringify(Object.values(snapshot.entries).filter(e => e.path.startsWith(targetSlug + '/') && e.type !== 'tree').map(e => [e.path, e.sha, e.mode, e.type]).sort((a,b) => a[0].localeCompare(b[0])));
}

export function sourceChanges(snapshot, targetSlug, source, status) {
  slug(targetSlug); const value = completeSource(source), changes = Object.create(null);
  const encode = text => Array.from(new TextEncoder().encode(text));
  changes[targetSlug + '/main.pjs'] = encode(value.pjs);
  changes[targetSlug + '/main.html'] = encode(value.html);
  changes[targetSlug + '/status.md'] = encode(formatStatus(status));
  const prefix = targetSlug + '/src/';
  for (const entry of Object.values(snapshot.entries)) {
    if (!entry.path.startsWith(prefix) || entry.type === 'tree') continue;
    requireThat(entry.type === 'blob' && entry.mode === '100644', 'unsupported-existing-source-file');
    if (!Object.hasOwn(value.files, entry.path.slice(prefix.length))) changes[entry.path] = null;
  }
  for (const [path, bytes] of Object.entries(value.files)) changes[prefix + path] = bytes;
  return changes;
}

export function statusChanges(targetSlug, status) {
  slug(targetSlug);
  return { [targetSlug + '/status.md']: Array.from(new TextEncoder().encode(formatStatus(status))) };
}

export async function folderMoveChanges(reader,snapshot,from,to){
  slug(from);slug(to);requireThat(from!==to,'rename-target-unchanged');
  requireThat(!snapshot.entries[to]&&!Object.keys(snapshot.entries).some(p=>p.startsWith(to+'/')),'github-destination-conflict');
  const changes=Object.create(null);
  for(const entry of Object.values(snapshot.entries).filter(e=>e.path.startsWith(from+'/')&&e.type!=='tree')){
    requireThat(entry.type==='blob'&&entry.mode==='100644','unsupported-move-file');
    changes[entry.path]=null;changes[to+entry.path.slice(from.length)]=Array.from(await reader.bytes(snapshot,entry.path));
  }
  requireThat(Object.keys(changes).length,'github-folder-missing');return changes;
}

export class GitHubWriter {
  constructor({ reader, store, locks, guard }) { Object.assign(this, { reader, store, locks, guard }); }

  async write({ id, targetSlug, destinationSlug = null, baseline, changes, operation = 'source', check = async()=>{} }) {
    requireThat(/^[A-Za-z0-9_-]{1,128}$/.test(id) && ['source', 'status', 'rename', 'rollback', 'import'].includes(operation), 'invalid-github-write');
    slug(targetSlug);
    if(operation==='rename')requireThat(slug(destinationSlug)!==targetSlug,'rename-target-unchanged');else requireThat(destinationSlug===null,'unexpected-destination');
    const beforeWrite=async()=>{await this.guard();await check();};
    return this.locks.request('pcms:github-writes:v1', { mode: 'exclusive' }, async () => {
      await beforeWrite();
      const prepared=(await this.store.read()).jobs[id];
      if(prepared&&prepared.phase!=='prepared')return this.reconcile(id);
      requireThat(JSON.stringify(baseline.repository) === JSON.stringify(this.reader.repository), 'github-repository-changed');
      const current = await this.reader.snapshot();
      requireThat(folderVersion(current, targetSlug) === folderVersion(baseline, targetSlug), 'github-generator-conflict');
      if(destinationSlug)requireThat(!current.entries[destinationSlug]&&!Object.keys(current.entries).some(p=>p.startsWith(destinationSlug+'/'))&&!baseline.entries[destinationSlug]&&!Object.keys(baseline.entries).some(p=>p.startsWith(destinationSlug+'/')),'github-destination-conflict');
      const intended = Object.create(null);
      for (const [path, bytes] of Object.entries(changes)) {
        requireThat((path.startsWith(targetSlug + '/') || destinationSlug&&path.startsWith(destinationSlug+'/')) && !/[\\\x00-\x1f]/.test(path) && path.split('/').every(p => p && p !== '.' && p !== '..'), 'github-write-path-invalid');
        intended[path] = bytes === null ? null : await blobHash(Uint8Array.from(bytes));
      }
      requireThat(Object.keys(intended).length > 0, 'empty-github-write');
      if(destinationSlug){
        const files=Object.values(baseline.entries).filter(e=>e.path.startsWith(targetSlug+'/')&&e.type!=='tree');
        requireThat(files.length>0&&Object.keys(intended).length===files.length*2&&files.every(e=>e.type==='blob'&&e.mode==='100644'&&intended[e.path]===null&&intended[destinationSlug+e.path.slice(targetSlug.length)]===e.sha),'incomplete-folder-move');
      }
      if(prepared){
        requireThat(prepared.kind==='github'&&prepared.stage==='objects'&&prepared.slug===targetSlug&&(prepared.destinationSlug||null)===destinationSlug&&prepared.operation===operation&&JSON.stringify(prepared.repository)===JSON.stringify(this.reader.repository)&&JSON.stringify(prepared.intended)===JSON.stringify(intended),'github-prepared-write-changed');
        await this.store.transact(s=>{requireThat(s.jobs[id].phase==='prepared','github-action-changed');s.jobs[id].baseCommit=current.commit;});
      }else await this.store.prepareAction({ id, kind: 'github', repository: this.reader.repository, slug: targetSlug, destinationSlug, baseCommit: current.commit, intended, stage: 'objects', operation });
      await this.store.markDispatched(id);
      try {
        const tree = [];
        for (const [path, bytes] of Object.entries(changes)) {
          if (bytes === null) tree.push({ path, mode: '100644', type: 'blob', sha: null });
          else {
            await beforeWrite();
            const blob = await this.reader.api('/git/blobs', { method: 'POST', body: { content: bytesToBase64(bytes), encoding: 'base64' } });
            requireThat(blob.sha === intended[path], 'github-created-blob-mismatch');
            tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
          }
        }
        await beforeWrite();
        const createdTree = await this.reader.api('/git/trees', { method: 'POST', body: { base_tree: current.treeSha, tree } });
        const treeSha = commitSha(createdTree.sha);
        await this.store.transact(s => { s.jobs[id].treeSha = treeSha; s.jobs[id].stage = 'commit'; });
        await beforeWrite();
        const commit = await this.reader.api('/git/commits', { method: 'POST', body: { message: `PCMS ${operation} [${id}]`, tree: treeSha, parents: [current.commit] } });
        const sha = commitSha(commit.sha);
        await this.store.transact(s => { s.jobs[id].commitSha = sha; s.jobs[id].stage = 'ref'; });
        await beforeWrite();
        requireThat(await this.reader.head() === current.commit, 'github-head-changed');
        await this.reader.api('/git/refs/heads/main', { method: 'PATCH', body: { sha, force: false } });
        return await this.reconcile(id);
      } catch (error) {
        await this.store.transact(s => { s.jobs[id].phase = ['http-conflict', 'github-head-changed'].includes(error.message) ? 'rejected' : 'unknown'; });
        throw new Error(['http-conflict', 'github-head-changed'].includes(error.message) ? 'github-head-conflict' : 'github-write-unknown');
      }
    });
  }

  async reconcile(id,{fresh=false}={}) {
    const job = (await this.store.read()).jobs[id];
    requireThat(job?.kind === 'github' && JSON.stringify(job.repository) === JSON.stringify(this.reader.repository), 'github-write-not-found');
    if (job.phase === 'verified'&&!fresh) return { verified: true, commit: job.commitSha, superseded:job.superseded===true };
    const current = await this.reader.snapshot();
    const matches = Object.entries(job.intended).every(([path, sha]) => sha === null ? !current.entries[path] : current.entries[path]?.sha === sha);
    if(job.phase==='verified'){await this.store.transact(s=>{s.jobs[id].superseded=!matches;});return {verified:true,commit:job.commitSha,superseded:!matches};}
    const history = await this.reader.api('/commits?sha=' + current.commit + '&per_page=100');
    requireThat(Array.isArray(history), 'github-history-unavailable');
    const landed = history.find(c => (job.commitSha ? c.sha === job.commitSha : c.commit?.message === `PCMS ${job.operation} [${id}]`) && c.commit?.tree?.sha === job.treeSha);
    if (!landed) {
      await this.store.transact(s => { s.jobs[id].phase = 'unknown'; });
      return { verified: false, unknown: true };
    }
    await this.store.transact(s => { s.jobs[id].phase = 'verified'; s.jobs[id].commitSha = landed.sha; s.jobs[id].superseded = !matches; });
    return { verified: true, commit: landed.sha, superseded: !matches };
  }
}
