import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

async function check(dir) {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${file.name}`;
    if (file.isDirectory()) await check(path);
    else if (/\.(?:js|mjs)$/.test(path)) {
      const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
    }
  }
}
for (const dir of ['src', 'scripts', 'tests', 'dist']) await check(dir);
console.log('JavaScript syntax OK');
