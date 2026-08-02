import './load-env.ts';
import { getPool, closePool } from '../src/db/pool.ts';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8787';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? 'admin123';
const USER_EMAIL = process.env.SMOKE_KM_EMAIL ?? 'km@example.com';
const USER_PASSWORD = process.env.SMOKE_KM_PASSWORD ?? 'km123';

type StepResult = { name: string; ok: boolean; detail?: string };

const results: StepResult[] = [];
let adminToken = '';
let userToken = '';
let userId = '';
let channelId = '';
let kbId = '';

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ''}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}: ${detail}`);
}

async function login(email: string, password: string): Promise<{ token: string; userId?: string }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return { token: body.token as string, userId: body.user?.id as string | undefined };
}

async function authJson(
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
  console.log(`Resource access verify → ${BASE}\n`);

  const health = await fetch(`${BASE}/health`);
  if (!health.ok) {
    fail('health', `HTTP ${health.status}`);
    return summarize();
  }
  pass('health');

  try {
    const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    adminToken = admin.token;
    pass('admin_login', ADMIN_EMAIL);
  } catch (error) {
    fail('admin_login', error instanceof Error ? error.message : String(error));
    return summarize();
  }

  const createChannel = await authJson(adminToken, '/api/document-channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `ACL Verify ${Date.now()}` }),
  });
  if (createChannel.status !== 201) {
    fail('create_channel', JSON.stringify(createChannel.body));
    return summarize();
  }
  channelId = createChannel.body.id as string;
  pass('create_channel', channelId);

  const channelAccess = await authJson(adminToken, `/api/document-channels/${channelId}/access`);
  if (channelAccess.status !== 200) {
    fail('get_channel_access', JSON.stringify(channelAccess.body));
  } else {
    const myAccess = channelAccess.body.my_access as { manage?: boolean } | undefined;
    if (myAccess?.manage) pass('get_channel_access', 'owner manage');
    else fail('get_channel_access', 'owner should have manage');
  }

  const createKb = await authJson(adminToken, '/api/knowledge-bases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `ACL KB ${Date.now()}`, type: 'page_index' }),
  });
  if (createKb.status !== 201) {
    fail('create_kb', JSON.stringify(createKb.body));
  } else {
    kbId = createKb.body.id as string;
    pass('create_kb', kbId);
  }

  if (kbId) {
    const kbAccess = await authJson(adminToken, `/api/knowledge-bases/${kbId}/access`);
    if (kbAccess.status === 200) pass('get_kb_access');
    else fail('get_kb_access', JSON.stringify(kbAccess.body));
  }

  try {
    const user = await login(USER_EMAIL, USER_PASSWORD);
    userToken = user.token;
    userId = user.userId ?? '';
    pass('user_login', USER_EMAIL);
  } catch (error) {
    fail('user_login', error instanceof Error ? error.message : String(error));
    return summarize();
  }

  if (!userId) {
    const me = await authJson(userToken, '/api/auth/me');
    userId = (me.body.id as string) ?? '';
  }

  const userChannelForbidden = await authJson(userToken, `/api/document-channels/${channelId}`);
  if (userChannelForbidden.status === 403) pass('user_channel_forbidden_before_share');
  else fail('user_channel_forbidden_before_share', `expected 403, got ${userChannelForbidden.status}`);

  if (userId) {
    const shareChannel = await authJson(adminToken, `/api/document-channels/${channelId}/access`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        others: { read: false, write: false, manage: false },
        users: [{ userId, read: true, write: false, manage: false }],
      }),
    });
    if (shareChannel.status === 200) pass('share_channel_read_with_user');
    else fail('share_channel_read_with_user', JSON.stringify(shareChannel.body));

    const userChannelAllowed = await authJson(userToken, `/api/document-channels/${channelId}`);
    if (userChannelAllowed.status === 200) pass('user_channel_read_after_share');
    else fail('user_channel_read_after_share', `expected 200, got ${userChannelAllowed.status}`);

    const userListDocsForbidden = await authJson(
      userToken,
      `/api/documents?channel_id=${encodeURIComponent(channelId)}`,
    );
    if (userListDocsForbidden.status === 200) pass('user_list_docs_read');
    else fail('user_list_docs_read', `expected 200, got ${userListDocsForbidden.status}`);
  }

  if (kbId && userId) {
    const shareKb = await authJson(adminToken, `/api/knowledge-bases/${kbId}/access`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        others: { read: false, write: false, manage: false },
        users: [{ userId, read: true, write: false, manage: false }],
      }),
    });
    if (shareKb.status === 200) pass('share_kb_read_with_user');
    else fail('share_kb_read_with_user', JSON.stringify(shareKb.body));

    const userKbAllowed = await authJson(userToken, `/api/knowledge-bases/${kbId}`);
    if (userKbAllowed.status === 200) pass('user_kb_read_after_share');
    else fail('user_kb_read_after_share', `expected 200, got ${userKbAllowed.status}`);

    const userKbList = await authJson(userToken, '/api/knowledge-bases');
    const items = (userKbList.body.items as Array<{ id: string }> | undefined) ?? [];
    if (userKbList.status === 403) {
      pass('user_kb_list_forbidden_without_module_perm');
    } else if (items.some((item) => item.id === kbId)) {
      pass('user_kb_list_contains_shared_kb');
    } else {
      fail('user_kb_list_contains_shared_kb', 'shared KB missing from list');
    }
  }

  const lookup = await authJson(userToken, '/api/users/lookup?q=admin');
  if (lookup.status === 200 && Array.isArray(lookup.body.users)) pass('user_lookup');
  else fail('user_lookup', JSON.stringify(lookup.body));

  const pool = getPool();
  const tableCheck = await pool.query("SELECT to_regclass('public.app_resource_grants') AS grants");
  if (tableCheck.rows[0]?.grants) pass('migration_grants_table_present');
  else fail('migration_grants_table_present', JSON.stringify(tableCheck.rows[0]));

  if (channelId) {
    await authJson(adminToken, `/api/document-channels/${channelId}`, { method: 'DELETE' });
  }
  if (kbId) {
    await authJson(adminToken, `/api/knowledge-bases/${kbId}`, { method: 'DELETE' });
  }

  await summarize();
}

async function summarize() {
  await closePool();
  const failed = results.filter((result) => !result.ok);
  console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
  if (failed.length > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await closePool();
  process.exit(1);
});
