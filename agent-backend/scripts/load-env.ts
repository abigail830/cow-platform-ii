import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

config({ path: path.join(backendRoot, '.env') });

const localPath = path.join(backendRoot, '.env.local');
if (existsSync(localPath)) {
  config({ path: localPath, override: true });
}
