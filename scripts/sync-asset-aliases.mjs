import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const groups = new Map();
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (/\.(png|jpe?g|webp|gif|avif)$/i.test(file)) {
      const hash = createHash('sha256').update(await readFile(file)).digest('hex');
      const group = groups.get(hash) ?? [];
      group.push(path.relative('public', file).split(path.sep).join('/'));
      groups.set(hash, group);
    }
  }
}
await scan('public/assets');
const aliases = {};
for (const group of groups.values()) {
  if (group.length < 2) continue;
  group.sort((a, b) => Number(!a.startsWith('assets/upload/')) - Number(!b.startsWith('assets/upload/'))
    || a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
  for (const alias of group.slice(1)) aliases[alias] = group[0];
}
const source = JSON.stringify(Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)), null, 2) + '\n';
const target = 'src/asset-aliases.json';
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== source) throw new Error('Asset aliases changed; run node scripts/sync-asset-aliases.mjs');
} else await writeFile(target, source);
console.log(`Verified ${Object.keys(aliases).length} identical raster aliases; original paths retained for saved canvases.`);
