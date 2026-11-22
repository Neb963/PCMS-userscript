import { requireThat, accountId, nativeId, slug } from '../../shared/domain.js';

export const LIVE_CAPABILITIES = Object.freeze({ save: false, create: false, rename: false, listing: false, helper: false });

export function requireLiveCapability(name) {
  requireThat(LIVE_CAPABILITIES[name] === true, 'native-capability-not-live-verified');
}

export class NativePage {
  constructor(page, { timeout = 15000 } = {}) {
    this.page = page;
    this.timeout = timeout;
  }

  async session() {
    const user = this.page.app?.store?.data?.user;
    if (user?.loggedIn !== true || typeof user.email !== 'string' || !user.email || typeof user.sessionToken !== 'string' || !user.sessionToken) return { signedIn: false, stamp: null };
    // Opaque change detector, never an automatically inferred account_id.
    const data = new TextEncoder().encode(user.email + '\0' + user.sessionToken);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return { signedIn: true, stamp: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') };
  }

  async ownerRequest(path, body = {}) {
    requireThat(['/api/checkGeneratorOwnership', '/api/getGeneratorsByUser'].includes(path), 'unsupported-owner-read');
    const user = this.page.app?.store?.data?.user;
    requireThat((await this.session()).signedIn, 'sign-in-required');
    const response = await this.page.fetch('https://perchance.org' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, email: user.email, sessionToken: user.sessionToken }),
      signal: AbortSignal.timeout(this.timeout), credentials: 'same-origin',
    });
    requireThat(response.ok, 'native-read-unavailable');
    try { return await response.json(); } catch { throw new Error('native-invalid-response'); }
  }

  async ownership(targetSlug) {
    slug(targetSlug);
    const result = await this.ownerRequest('/api/checkGeneratorOwnership', { generatorName: targetSlug });
    const status = typeof result === 'string' ? result : result.status;
    if (status === 'session-token-error') throw new Error('sign-in-required');
    requireThat(['is-owner', 'is-not-owner'].includes(status), 'ownership-unknown');
    return status === 'is-owner';
  }

  identity() {
    const generator = this.page.app?.data?.generator;
    requireThat(generator && (typeof generator.id === 'number' || typeof generator.id === 'string'), 'native-identity-unavailable');
    return { id: nativeId(String(generator.id)), slug: slug(generator.name), publicId: typeof generator.publicId === 'string' ? generator.publicId : null };
  }

  async ready(expected,{allowSaving=false}={}) {
    const p = this.page;
    requireThat(p.app && p.modelTextEditor?.getValue && p.outputTemplateEditor?.getValue && p.srcState?.ready, 'editor-unavailable');
    requireThat(p.__editorReady !== false && p.__draftChoiceSettled !== false && p.currentInterfaceMode === 'edit' && (allowSaving||p.perchanceSaveState !== 'saving'), 'editor-not-settled');
    let timer;
    try {
      await Promise.race([Promise.resolve(p.srcState.ready()), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('editor-readiness-timeout')), this.timeout);
        timer.unref?.();
      })]);
    } finally { clearTimeout(timer); }
    const identity = this.identity();
    requireThat(identity.id === expected.id && identity.slug === expected.slug, 'native-target-mismatch');
    requireThat(p.__draftChoiceSettled !== false && (allowSaving||p.perchanceSaveState !== 'saving'), 'editor-not-settled');
    const draftId = p.srcState.getDraftId?.() || p.srcState.getWorkspaceId?.();
    requireThat(typeof draftId === 'string' && draftId, 'draft-identity-unavailable');
    return { ...identity, draftId };
  }
}

export class SessionGate {
  constructor(store, native) { this.store = store; this.native = native; }

  async bind(value) {
    accountId(value);
    return this.store.transact(state => {
      requireThat(!state.settings.account.locked && Object.keys(state.generators).length === 0, 'account-id-locked');
      state.settings.account = { accountId: value, locked: false, confirmed: false };
    });
  }

  async observe() {
    const session = await this.native.session();
    const account = (await this.store.read()).settings.account;
    if ((!session.signedIn || session.stamp !== account.sessionStamp) && account.confirmed) await this.store.transact(state => { state.settings.account.confirmed = false; });
    return { signedIn: session.signedIn, confirmed: !!(session.signedIn && account.confirmed && session.stamp === account.sessionStamp), configured: !!account.accountId };
  }

  async confirm(explicit) {
    requireThat(explicit === true, 'manual-confirmation-required');
    const session = await this.native.session();
    requireThat(session.signedIn, 'sign-in-required');
    return this.store.transact(state => {
      accountId(state.settings.account.accountId);
      state.settings.account.confirmed = true;
      state.settings.account.sessionStamp = session.stamp;
    });
  }

  async requireSession(expectedAccount) {
    const session = await this.observe();
    requireThat(session.signedIn, 'sign-in-required');
    requireThat(session.configured && session.confirmed, 'confirm-session-required');
    requireThat((await this.store.read()).settings.account.accountId === expectedAccount, 'account-assignment-mismatch');
  }

  async requireOwner(target) {
    const session = await this.observe();
    requireThat(session.signedIn, 'sign-in-required');
    requireThat(session.configured && session.confirmed, 'confirm-session-required');
    const state = await this.store.read();
    if (target.account !== undefined) requireThat(target.account === state.settings.account.accountId, 'account-assignment-mismatch');
    let owns;
    try { owns = await this.native.ownership(target.slug); }
    catch (error) {
      if (error.message === 'sign-in-required') await this.store.transact(current => { current.settings.account.confirmed = false; });
      throw error;
    }
    if (!owns) {
      await this.store.transact(current => { current.settings.account.confirmed = false; });
      throw new Error('owner-mismatch');
    }
    // Session could change during the ownership request.
    const recheck = await this.observe();
    requireThat(recheck.confirmed, 'confirm-session-required');
    return true;
  }
}
