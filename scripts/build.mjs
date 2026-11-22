import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Deliberately small ES-module subset: local named imports and named declarations.
// Reject unsupported module syntax rather than producing a partly bundled script.
export async function bundle(entry, sourceRoot = resolve(root, 'src')) {
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
    if (file === resolve(entry)) {
      const match = source.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m);
      if (!match) throw new Error('Userscript metadata missing');
      metadata = match[0];
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
  return `${metadata}\n\n(() => {\n'use strict';\nconst modules = Object.create(null);\n${[...modules.values()].join('\n\n')}\n})();\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await bundle(resolve(root, 'src/entry.user.js'));
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(resolve(root, 'dist/PCMS.user.js'), output);
  console.log('Built dist/PCMS.user.js');
}
