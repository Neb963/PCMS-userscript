export const WORKFLOW_STATES = Object.freeze(['ready', 'reserved', 'review', 'done', 'blocked']);
export const ACTIONS = Object.freeze(['develop', 'publish_from_github']);
export const LISTINGS = Object.freeze(['listed', 'unlisted', 'unknown']);
export const HOLD_KINDS = Object.freeze([
  'publication', 'edit', 'development', 'review', 'cancelled-draft', 'native-unknown', 'helper-unknown',
  'worker-lost', 'identity-mismatch', 'session', 'listing-mismatch', 'snapshot-failure',
  'source-drift', 'source-conflict', 'request-conflict', 'account-conflict', 'slug', 'rename',
]);

export function requireThat(condition, code) {
  if (!condition) throw new Error(code);
}

export function accountId(value) {
  requireThat(typeof value === 'string' && value.length > 0 && value.length <= 128 && value === value.trim() && !/[\x00-\x1f\x7f:]/.test(value), 'invalid-account');
  return value;
}

export function nativeId(value) {
  requireThat(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value), 'invalid-native-id');
  return value;
}

export function slug(value) {
  requireThat(typeof value === 'string' && value.length <= 128 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), 'invalid-slug');
  return value;
}

export function sourcePath(value) {
  requireThat(typeof value === 'string' && value.length <= 1024 && value.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part)), 'invalid-source-path');
  return value;
}

export function repository(value) {
  requireThat(value && typeof value.owner === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(value.owner) && typeof value.name === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(value.name), 'invalid-repository');
  return { owner: value.owner, name: value.name };
}

export function statusRecord(value) {
  requireThat(value && ACTIONS.includes(value.action) && WORKFLOW_STATES.includes(value.state), 'invalid-status');
  return { account: accountId(value.account), action: value.action, state: value.state };
}

export function parseStatus(text) {
  requireThat(typeof text === 'string', 'invalid-status-text');
  const result = Object.create(null);
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):[ \t]*(.*?)[ \t]*$/.exec(raw);
    requireThat(match, 'invalid-status-line');
    const [, key, value] = match;
    if (!['account', 'action', 'state'].includes(key)) continue;
    requireThat(!Object.hasOwn(result, key), 'duplicate-status-field');
    result[key] = value;
  }
  return statusRecord(result);
}

export function formatStatus(value) {
  const s = statusRecord(value);
  return `account: ${s.account}\naction: ${s.action}\nstate: ${s.state}\n`;
}

export function completeSource(value) {
  requireThat(value && typeof value.pjs === 'string' && typeof value.html === 'string' && value.files && typeof value.files === 'object' && !Array.isArray(value.files), 'incomplete-source');
  const files = Object.create(null);
  for (const path of Object.keys(value.files).sort()) {
    sourcePath(path);
    const bytes = value.files[path];
    requireThat((Array.isArray(bytes) || bytes instanceof Uint8Array) && [...bytes].every(b => Number.isInteger(b) && b >= 0 && b <= 255), 'invalid-source-bytes');
    files[path] = Array.from(bytes);
  }
  return { pjs: value.pjs, html: value.html, files };
}

export function sourceEqual(a, b) {
  return JSON.stringify(completeSource(a)) === JSON.stringify(completeSource(b));
}

export function generatorRecord(value) {
  requireThat(value && LISTINGS.includes(value.listing), 'invalid-listing');
  const status = value.status === null ? null : statusRecord(value.status);
  requireThat(Array.isArray(value.holds), 'invalid-holds');
  const ids = new Set();
  const holds = value.holds.map(h => {
    requireThat(h && typeof h.id === 'string' && h.id && !ids.has(h.id) && HOLD_KINDS.includes(h.kind), 'invalid-hold');
    ids.add(h.id);
    return { id: h.id, kind: h.kind };
  });
  return { id: nativeId(value.id), slug: slug(value.slug), listing: value.listing, status, holds, excluded: value.excluded === true, savedVerified: value.savedVerified === true };
}

export function addHold(generator, hold) {
  const next = { ...generator, holds: [...generator.holds.filter(h => h.id !== hold.id), hold] };
  generatorRecord(next);
  return next;
}

export function releaseHold(generator, holdId) {
  return { ...generator, holds: generator.holds.filter(h => h.id !== holdId) };
}

export function pendingUpdate(value) {
  requireThat(value && typeof value.id === 'string' && value.id && ['source', 'status'].includes(value.kind), 'invalid-pending-update');
  requireThat(typeof value.baseCommit === 'string' && /^[a-f0-9]{40}$/.test(value.baseCommit), 'invalid-base-commit');
  const result = { id: value.id, generatorId: nativeId(value.generatorId), slug: slug(value.slug), repository: repository(value.repository), baseCommit: value.baseCommit, kind: value.kind, status: statusRecord(value.status) };
  if (value.kind === 'source') result.source = completeSource(value.source);
  return result;
}

export function accountConfig(value) {
  requireThat(value && typeof value.locked === 'boolean' && typeof value.confirmed === 'boolean', 'invalid-account-config');
  return { accountId: value.accountId === '' ? '' : accountId(value.accountId), locked: value.locked, confirmed: value.confirmed };
}

export function requestIdentity(value) {
  requireThat(value && typeof value.commit === 'string' && /^[a-f0-9]{40}$/.test(value.commit), 'invalid-request-revision');
  return { repository: repository(value.repository), slug: slug(value.slug), commit: value.commit, status: statusRecord(value.status) };
}

export function isReadOnlyCommand(kind){return ['read-saved','inspect-target','native-capture','maintenance-capture','recovery-capture','approved-capture','edit-capture','helper-resolve'].includes(kind);}
