import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './load-env.ts';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flueArgs = process.argv.slice(2);

if (flueArgs.length === 0) {
  console.error('Usage: tsx scripts/flue-with-env.ts <flue-args...>');
  process.exit(1);
}

const child = spawn('flue', flueArgs, {
  cwd: backendRoot,
  env: process.env,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
