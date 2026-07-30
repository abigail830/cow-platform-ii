import esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'api');
const publicDir = path.join(root, 'public');

mkdirSync(outDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });
writeFileSync(path.join(publicDir, '.gitkeep'), '');

// Native / optional deps that must not be bundled.
const external = [
  'pg-native',
  'cpu-features',
  'bufferutil',
  'utf-8-validate',
];

await esbuild.build({
  entryPoints: [path.join(root, 'scripts/vercel-entry.ts')],
  outfile: path.join(outDir, 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external,
  logLevel: 'info',
  banner: {
    js: "/* Vercel serverless bundle — do not add .ts files under api/ */",
  },
});

console.log('Vercel serverless bundle: api/index.js');
