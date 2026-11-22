import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicSnapshot } from '../../src/ui/shell.js';
import { emptyState } from '../../src/state/store.js';

test('UI projection does not expose credentials, raw source or session data', () => {
  const s = emptyState();
  s.settings.github = { pat: 'synthetic-secret', repository: 'synthetic-private-repository' };
  s.generators['123'] = { id: '123', slug: 'synthetic-generator', listing: 'listed', holds: [], source: 'synthetic-private-source', session: 'synthetic-session' };
  s.recovery={private:{generatorId:'123',phase:'compared',canonical:{pjs:'synthetic-private-source'},live:{source:'synthetic-private-source'}}};
  s.stoppedGenerators={old:{source:'synthetic-private-source'}};
  const snapshot = JSON.stringify(publicSnapshot(s));
  for (const secret of ['synthetic-secret', 'synthetic-private-source', 'synthetic-session', 'synthetic-private-repository']) assert.equal(snapshot.includes(secret), false);
});
