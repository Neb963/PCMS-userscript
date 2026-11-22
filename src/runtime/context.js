export const INTEGRATION_PROOF = Object.freeze({ githubWrite: false });

export function isolatedManager(info) {
  return info?.scriptHandler === 'Violentmonkey' && info.injectInto === 'content';
}

export function requireGitHubWriteProof() {
  if (!INTEGRATION_PROOF.githubWrite) throw new Error('github-write-not-live-verified');
}
