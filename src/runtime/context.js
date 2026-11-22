import { OPERATOR_TEST } from './build-mode.js';

// In the test build this is explicit operator authorization, not qualification proof.
export const INTEGRATION_PROOF = Object.freeze({ githubWrite: OPERATOR_TEST });

export function isolatedManager(info) {
  return info?.scriptHandler === 'Violentmonkey' && info.injectInto === 'content';
}

export function requireGitHubWriteProof() {
  if (!INTEGRATION_PROOF.githubWrite) throw new Error('github-write-not-live-verified');
}
