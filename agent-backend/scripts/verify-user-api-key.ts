import './load-env.ts';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8787';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? 'admin123';

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

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body.token as string;
}

async function authFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  return { status: res.status, body };
}

async function main() {
  console.log(`User API key verify → ${BASE}\n`);

  const health = await fetch(`${BASE}/health`);
  if (!health.ok) {
    fail('health', `HTTP ${health.status}`);
    return summarize();
  }
  pass('health');

  let jwt = '';
  try {
    jwt = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    pass('admin_login');
  } catch (error) {
    fail('admin_login', error instanceof Error ? error.message : String(error));
    return summarize();
  }

  const create = await authFetch(jwt, '/api/user/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `verify-${Date.now()}` }),
  });
  if (create.status !== 201 || typeof create.body.key !== 'string') {
    fail('create_api_key', `HTTP ${create.status} ${JSON.stringify(create.body)}`);
    return summarize();
  }
  const apiKey = create.body.key;
  const keyId = (create.body.item as { id?: string })?.id;
  pass('create_api_key', apiKey.slice(0, 12) + '…');

  const rejectSession = await authFetch(apiKey, '/api/user/api-keys', { method: 'POST' });
  if (rejectSession.status !== 401) {
    fail('api_key_cannot_manage_keys', `expected 401, got ${rejectSession.status}`);
  } else {
    pass('api_key_cannot_manage_keys');
  }

  const me = await authFetch(apiKey, '/api/auth/me');
  if (me.status !== 200) {
    fail('api_key_auth_me', `HTTP ${me.status}`);
  } else {
    pass('api_key_auth_me', String((me.body.user as { email?: string })?.email ?? ''));
  }

  const listKb = await authFetch(apiKey, '/api/hybrid-search/knowledge-bases');
  if (listKb.status !== 200) {
    fail('api_key_hybrid_list_kb', `HTTP ${listKb.status} ${JSON.stringify(listKb.body)}`);
  } else {
    const count = Array.isArray(listKb.body.items) ? listKb.body.items.length : 0;
    pass('api_key_hybrid_list_kb', `${count} KB(s)`);
  }

  if (keyId) {
    const revoke = await authFetch(jwt, `/api/user/api-keys/${keyId}`, { method: 'DELETE' });
    if (revoke.status !== 200) {
      fail('revoke_api_key', `HTTP ${revoke.status}`);
    } else {
      pass('revoke_api_key');
    }

    const after = await authFetch(apiKey, '/api/auth/me');
    if (after.status === 401) {
      pass('revoked_key_rejected');
    } else {
      fail('revoked_key_rejected', `expected 401, got ${after.status}`);
    }
  }

  return summarize();
}

function summarize() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exit(1);
}

void main().finally(() => {
  // pool not used
});
