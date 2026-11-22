import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Deliberately small ES-module subset: local named imports and named declarations.
// Reject unsupported module syntax rather than producing a partly bundled script.
export async function bundle(entry, sourceRoot = resolve(root, 'src'), { profile = 'inspection' } = {}) {
  if (!['inspection', 'operator-test'].includes(profile)) throw new Error('Unknown build profile: ' + profile);
  const modules = new Map();
  const visiting = new Set();
  let metadata = '';
  async function visit(file) {
    file = resolve(file);
    const id = relative(sourceRoot, file).replaceAll('\\', '/');
    if (id.startsWith('../') || id === '..') throw new Error('Import outside src');
    if (visiting.has(id)) throw new Error('Cyclic import: ' + id);
    if (modules.has(id)) return id;
    visiting.add(id);
    let source = await readFile(file, 'utf8');
    if (id === 'runtime/build-mode.js') {
      const declaration = "export const BUILD_MODE = 'inspection';";
      if (source.split(declaration).length !== 2) throw new Error('Build policy declaration changed');
      source = source.replace(declaration, `export const BUILD_MODE = ${JSON.stringify(profile)};`);
    }
    if (file === resolve(entry)) {
      const match = source.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m);
      if (!match) throw new Error('Userscript metadata missing');
      metadata = match[0];
      if (profile === 'operator-test') metadata = metadata.replace(/^\/\/ @description\s+.*$/m, '// @description  Operator testing build: real writes enabled; live qualification pending.');
      source = source.replace(match[0], '');
    }
    const imports = [...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm)];
    for (const match of imports) {
      if (!match[2].startsWith('./') && !match[2].startsWith('../')) throw new Error('External import');
      const bindings = match[1].trim().split(',').map(s => s.trim());
      if (bindings.some(s => !/^[A-Za-z_$][\w$]*$/.test(s))) throw new Error('Unsupported import binding');
      const dep = await visit(resolve(dirname(file), match[2]));
      source = source.replace(match[0], `const { ${bindings.join(', ')} } = modules[${JSON.stringify(dep)}];`);
    }
    const names = [...source.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)/gm)].map(m => m[1]);
    source = source.replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let)\s)/gm, '');
    if (/^(?:import|export)\s/m.test(source)) throw new Error('Unsupported module syntax in ' + id);
    modules.set(id, `modules[${JSON.stringify(id)}] = (() => {\n${source.trim()}\nreturn { ${names.join(', ')} };\n})();`);
    visiting.delete(id);
    return id;
  }
  await visit(entry);
  if (profile === 'operator-test' && !modules.has('runtime/build-mode.js')) throw new Error('Operator-test build has no policy module');
  return `${metadata}\n\n// PCMS build profile: ${profile}\n(() => {\n'use strict';\nconst modules = Object.create(null);\n${[...modules.values()].join('\n\n')}\n})();\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => !arg.startsWith('--profile=')) || args.length > 1) throw new Error('Usage: build.mjs [--profile=inspection|operator-test]');
  const profile = args[0]?.slice('--profile='.length) || 'inspection';
  const output = await bundle(resolve(root, 'src/entry.user.js'), resolve(root, 'src'), { profile });
  await mkdir(resolve(root, 'dist'), { recursive: true });
  const name = profile === 'operator-test' ? 'PCMS-operator-test.user.js' : 'PCMS.user.js';
  await writeFile(resolve(root, 'dist', name), output);
  console.log('Built dist/' + name + ' (' + profile + ')');
}
