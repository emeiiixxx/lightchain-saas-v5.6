import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const suites = [
  'tests/flow-local-centering.test.ts',
  'tests/canvas-layout-groups.test.ts',
  'tests/video-layout-groups.test.ts',
];
// Keep the bundle beside node_modules for external package resolution.
const outfile = `.flow-layout-${randomUUID()}.mjs`;
try {
  await build({
    stdin: { contents: suites.map(file => `import './${file}';`).join('\n'), resolveDir: process.cwd() },
    outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
    loader: { '.css': 'empty', '.svg': 'text' }, define: { 'import.meta.env.BASE_URL': '"/"' },
  });
  const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm(outfile, { force: true }); }
