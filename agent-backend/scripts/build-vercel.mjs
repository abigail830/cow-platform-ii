import esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'api');
mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'api/entry.ts')],
  outfile: path.join(outDir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  logLevel: 'info',
});

console.log('Vercel serverless bundle: api/index.mjs');
