import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'README.md','AGENTS.md','ARCHITECTURE.md','to-do.md','todo.md',
  'memory.md','learned.md','ci-guidelines.md','TESTING.md','HANDOFF.md',
  'docs/agent-development.md','references/README.md',
  'references/PCMS-authoritative-specification-v1.4.md',
  'references/perchance-discovery.md',
  'references/ui/PCMS-UI-Mockup-v2.0.0.user.txt',
  '.github/workflows/ci.yml'
];
const missing = required.filter(p => !existsSync(resolve(root, p)));
if (missing.length) throw new Error('Required files missing: ' + missing.join(', '));

const plan = readFileSync(resolve(root, 'to-do.md'), 'utf8');
const ids = [...plan.matchAll(/^### (P\d{2}) — /gm)].map(m=>m[1]);
if (ids.length !== 32 || ids.some((id,i)=>id!==`P${String(i).padStart(2,'0')}`)) {
  throw new Error('Expected exactly the ordered phases P00 through P31');
}
for (const id of ids) {
  const match = plan.match(new RegExp(`^### ${id} — [^\\n]+\\n([\\s\\S]*?)(?=^### P\\d{2} — |^## Completion rule)`, 'm'));
  if (!match || (match[1].match(/^- \[[ x]\] /gm)||[]).length < 4 || !match[1].includes('**Accept:**')) {
    throw new Error(`${id} lacks explicit tasks or an acceptance check`);
  }
}
const current = readFileSync(resolve(root, 'todo.md'), 'utf8');
if (!/^\*\*Current phase:\*\* P\d{2} — /m.test(current)) throw new Error('todo.md has no current phase');
const refManifest = readFileSync(resolve(root, 'references/SHA256SUMS'), 'utf8').trim();
let checked = 0;
for (const line of refManifest.split('\n')) {
  const match = /^([a-f0-9]{64})  (references\/[a-zA-Z0-9_./-]+)$/.exec(line);
  if (!match) throw new Error('Invalid hash manifest entry: '+line);
  const [, expected, rel] = match;
  if (rel.includes('..')) throw new Error('Unsafe manifest path');
  const file = resolve(root, rel);
  if (!existsSync(file)) throw new Error('Missing reference: '+rel);
  const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (expected !== actual) throw new Error('Reference differs from approved snapshot: '+rel);
  checked++;
}
if (checked < 3) throw new Error('Not enough reference files in manifest');
const script = readFileSync(resolve(root, 'references/ui/PCMS-UI-Mockup-v2.0.0.user.txt'), 'utf8');
if (!/@version\s+2\.0\.0/.test(script) || !/SIMULATION ONLY/.test(script)) {
  throw new Error('UI reference is not the approved simulation');
}
if (!readFileSync(resolve(root, '.gitignore'), 'utf8').includes('operator-only/')) {
  throw new Error('Operator-only source exclusion missing');
}
console.log(`Bootstrap OK: ${ids.length} phases, ${checked} verified reference files, required docs present.`);
