import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo-relative backend root — on Vercel, .env files are not shipped; use task cwd. */
const backendRoot = process.env.VERCEL
  ? process.cwd()
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

config({ path: path.join(backendRoot, '.env'), override: true });

const localPath = path.join(backendRoot, '.env.local');
if (existsSync(localPath)) {
  config({ path: localPath, override: true });
}
