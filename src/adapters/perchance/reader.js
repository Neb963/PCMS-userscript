import { requireThat, nativeId, slug, sourcePath, completeSource } from '../../shared/domain.js';

function identity(record, expectedSlug) {
  requireThat(record && record.name === expectedSlug && (typeof record.id === 'number' || typeof record.id === 'string') && typeof record.isPrivate === 'boolean', 'saved-identity-unavailable');
  return { id: nativeId(String(record.id)), slug: slug(record.name), listing: record.isPrivate ? 'unlisted' : 'listed', publicId: typeof record.publicId === 'string' ? record.publicId : null };
}

function manifest(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw new Error('invalid-src-manifest'); }
  }
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'missing-src-manifest');
  const result = Object.create(null);
  for (const path of Object.keys(value).sort()) {
    sourcePath(path);
    const entry = value[path];
    const key = typeof entry === 'string' ? entry : entry?.key;
    const size = typeof entry === 'object' ? entry.size : null;
    requireThat(typeof key === 'string' && /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?$/.test(key), 'invalid-src-key');
    requireThat(size === null || (Number.isSafeInteger(size) && size >= 0), 'invalid-src-size');
    result[path] = { key, size };
  }
  return result;
}

export class PerchanceReader {
  constructor({ request, native = null, gate = null }) { Object.assign(this, { request, native, gate }); }

  async metadata(targetSlug) {
    slug(targetSlug);
    const reply = await this.request('https://perchance.org/api/getGeneratorPageData', { method: 'POST', body: { generatorName: targetSlug }, type: 'json' });
    requireThat(reply?.status === 'success' && reply.generator && typeof reply.generator.modelText === 'string' && typeof reply.generator.outputTemplate === 'string' && Object.hasOwn(reply.generator, 'srcManifest'), 'saved-source-unavailable');
    const g = reply.generator;
    const target = identity(g, targetSlug);
    return { ...target, pjs: g.modelText, html: g.outputTemplate, manifest: manifest(g.srcManifest), revision: { lastEditTime: g.lastEditTime ?? null, saveCount: g.saveCount ?? null, editorPayloadRevision: g.editorPayloadRevision ?? null } };
  }

  async saved(targetSlug, expectedId = null) {
    const before = await this.metadata(targetSlug);
    if (expectedId !== null) requireThat(before.id === expectedId, 'saved-target-mismatch');
    const files = Object.create(null);
    for (const [path, entry] of Object.entries(before.manifest)) {
      const raw = await this.request('https://user.uploads.dev/file/' + entry.key, { type: 'bytes' });
      requireThat(raw instanceof Uint8Array || Array.isArray(raw), 'saved-file-unavailable');
      requireThat(entry.size === null || raw.length === entry.size, 'saved-file-size-mismatch');
      files[path] = Array.from(raw);
    }
    const after = await this.metadata(targetSlug);
    requireThat(JSON.stringify(before) === JSON.stringify(after), 'saved-source-changed-during-read');
    return { id: before.id, slug: before.slug, listing: before.listing, publicId: before.publicId, revision: before.revision, source: completeSource({ pjs: before.pjs, html: before.html, files }) };
  }

  async inventory() {
    const session = await this.gate.observe();
    requireThat(session.signedIn && session.confirmed, 'confirm-session-required');
    const reply = await this.native.ownerRequest('/api/getGeneratorsByUser');
    requireThat(reply?.status === 'success' && Array.isArray(reply.generators), 'inventory-unavailable');
    const seen = new Set(), ids = new Set(), rows = [];
    for (const entry of reply.generators) {
      slug(entry.name);
      requireThat(!seen.has(entry.name), 'duplicate-inventory-slug');
      seen.add(entry.name);
      try {
        requireThat(await this.native.ownership(entry.name), 'owner-mismatch');
        const data = await this.metadata(entry.name);
        requireThat(!ids.has(data.id), 'duplicate-inventory-id');
        ids.add(data.id);
        rows.push({ id: data.id, slug: data.slug, listing: data.listing, verified: true });
      } catch { rows.push({ id: null, slug: entry.name, listing: 'unknown', verified: false, reason: 'inventory-target-unconfirmed' }); }
    }
    return rows;
  }
}

export function reconcileInventory(known, observed) {
  return known.map(g => {
    const match = observed.find(row => row.verified && row.id === g.id);
    if (!match) return { ...g, observed: 'unknown' };
    if (match.slug !== g.slug) return { ...g, observed: 'renamed', observedSlug: match.slug };
    return { ...g, observed: 'verified', observedListing: match.listing };
  });
}
