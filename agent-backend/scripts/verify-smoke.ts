import './load-env.ts';
import { closePool } from '../src/infrastructure/db/pool.ts';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8787';
const EMAIL = process.env.SMOKE_EMAIL ?? 'user@example.com';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'user123';

type StepResult = { name: string; ok: boolean; detail?: string };

const results: StepResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ''}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}: ${detail}`);
}

async function main() {
  console.log(`Smoke test → ${BASE}\n`);

  const health = await fetch(`${BASE}/health`);
  if (!health.ok) {
    fail('health', `HTTP ${health.status}`);
    return summarize();
  }
  pass('health');

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginBody = await loginRes.json();
  if (!loginRes.ok) {
    fail('login', JSON.stringify(loginBody));
    return summarize();
  }
  pass('login', EMAIL);

  await summarize();
}

async function summarize() {
  await closePool();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
  if (failed.length > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
