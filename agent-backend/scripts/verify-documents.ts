import 'dotenv/config';
import { getPool, closePool } from '../src/db/pool.ts';
import { isStorageEnabled } from '../src/storage/s3-config.ts';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8787';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? 'admin123';
const USER_EMAIL = process.env.SMOKE_EMAIL ?? 'user@example.com';
const USER_PASSWORD = process.env.SMOKE_PASSWORD ?? 'user123';

type StepResult = { name: string; ok: boolean; detail?: string };

const results: StepResult[] = [];
let adminToken = '';
let rootChannelId = '';
let childChannelId = '';
let documentId = '';

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
  console.log(`Document API verify → ${BASE}\n`);

  const health = await fetch(`${BASE}/health`);
  if (!health.ok) {
    fail('health', `HTTP ${health.status}`);
    return summarize();
  }
  pass('health');

  try {
    adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    pass('admin_login', ADMIN_EMAIL);
  } catch (error) {
    fail('admin_login', error instanceof Error ? error.message : String(error));
    return summarize();
  }

  try {
    const userToken = await login(USER_EMAIL, USER_PASSWORD);
    const forbidden = await authJson(userToken, '/api/document-channels');
    if (forbidden.status === 403) pass('user_forbidden_channels', '403 as expected');
    else fail('user_forbidden_channels', `expected 403, got ${forbidden.status}`);
  } catch (error) {
    fail('user_forbidden_channels', error instanceof Error ? error.message : String(error));
  }

  const createRoot = await authJson(adminToken, '/api/document-channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Verify Root ${Date.now()}`, description: 'integration test' }),
  });
  if (createRoot.status !== 201) {
    fail('create_root_channel', JSON.stringify(createRoot.body));
    return summarize();
  }
  rootChannelId = createRoot.body.id as string;
  pass('create_root_channel', rootChannelId);

  const createChild = await authJson(adminToken, '/api/document-channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Verify Child', parent_id: rootChannelId }),
  });
  if (createChild.status !== 201) {
    fail('create_child_channel', JSON.stringify(createChild.body));
    return summarize();
  }
  childChannelId = createChild.body.id as string;
  pass('create_child_channel', childChannelId);

  const tree = await authJson(adminToken, '/api/document-channels');
  if (tree.status !== 200 || !Array.isArray(tree.body.channels)) {
    fail('list_channel_tree', JSON.stringify(tree.body));
  } else {
    const flat = JSON.stringify(tree.body.channels);
    if (!flat.includes(rootChannelId) || !flat.includes(childChannelId)) {
      fail('list_channel_tree', 'created channels missing from tree');
    } else {
      pass('list_channel_tree');
    }
  }

  const rename = await authJson(adminToken, `/api/document-channels/${childChannelId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Verify Child Renamed' }),
  });
  if (rename.status !== 200) fail('rename_channel', JSON.stringify(rename.body));
  else pass('rename_channel');

  const stats = await authJson(adminToken, '/api/documents/stats');
  if (stats.status !== 200) fail('document_stats', JSON.stringify(stats.body));
  else pass('document_stats', JSON.stringify(stats.body));

  const emptyList = await authJson(adminToken, `/api/documents?channel_id=${encodeURIComponent(rootChannelId)}`);
  if (emptyList.status !== 200 || !Array.isArray(emptyList.body.items)) {
    fail('list_documents_empty', JSON.stringify(emptyList.body));
  } else {
    pass('list_documents_empty', `${emptyList.body.total ?? 0} total`);
  }

  if (isStorageEnabled()) {
    const chunkA = new FormData();
    chunkA.append('channel_id', rootChannelId);
    chunkA.append('filename', 'chunked.pdf');
    chunkA.append('chunk_index', '0');
    chunkA.append('total_chunks', '2');
    chunkA.append('file_chunk', new Blob(['chunk-a-'], { type: 'application/pdf' }), 'chunked.pdf');

    const chunkARes = await fetch(`${BASE}/api/documents/upload-chunk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: chunkA,
    });
    const chunkABody = await chunkARes.json();
    if (chunkARes.status !== 200 || typeof chunkABody.upload_id !== 'string') {
      fail('upload_document_chunked_part1', JSON.stringify(chunkABody));
    } else {
      const chunkB = new FormData();
      chunkB.append('channel_id', rootChannelId);
      chunkB.append('filename', 'chunked.pdf');
      chunkB.append('chunk_index', '1');
      chunkB.append('total_chunks', '2');
      chunkB.append('upload_id', chunkABody.upload_id as string);
      chunkB.append('file_chunk', new Blob(['chunk-b'], { type: 'application/pdf' }), 'chunked.pdf');

      const chunkBRes = await fetch(`${BASE}/api/documents/upload-chunk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: chunkB,
      });
      const chunkBBody = await chunkBRes.json();
      if (chunkBRes.status !== 201) {
        fail('upload_document_chunked_part2', JSON.stringify(chunkBBody));
      } else {
        const chunkedDocumentId = chunkBBody.id as string;
        pass('upload_document_chunked', chunkedDocumentId);
        const deletedChunked = await authJson(adminToken, `/api/documents/${chunkedDocumentId}`, {
          method: 'DELETE',
        });
        if (deletedChunked.status === 200) pass('delete_document_chunked');
        else fail('delete_document_chunked', JSON.stringify(deletedChunked.body));
      }
    }

    const form = new FormData();
    form.append('channel_id', rootChannelId);
    form.append('file', new Blob(['verify-document-content'], { type: 'application/pdf' }), 'verify.pdf');

    const uploadRes = await fetch(`${BASE}/api/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: form,
    });
    const uploadBody = await uploadRes.json();
    if (uploadRes.status !== 201) {
      fail('upload_document', JSON.stringify(uploadBody));
    } else {
      documentId = uploadBody.id as string;
      pass('upload_document', documentId);
    }

    if (documentId) {
      const listed = await authJson(
        adminToken,
        `/api/documents?channel_id=${encodeURIComponent(rootChannelId)}`,
      );
      const items = listed.body.items as Array<{ id: string }>;
      if (listed.status === 200 && items.some((item) => item.id === documentId)) {
        pass('list_documents_after_upload');
      } else {
        fail('list_documents_after_upload', JSON.stringify(listed.body));
      }

      const download = await authJson(adminToken, `/api/documents/${documentId}/download`);
      if (download.status === 200 && typeof download.body.url === 'string') {
        pass('download_document', download.body.filename as string);
      } else {
        fail('download_document', JSON.stringify(download.body));
      }

      const moved = await authJson(adminToken, `/api/documents/${documentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: childChannelId }),
      });
      if (moved.status === 200 && moved.body.channel_id === childChannelId) {
        pass('move_document', childChannelId);
      } else {
        fail('move_document', JSON.stringify(moved.body));
      }

      const movedBack = await authJson(adminToken, `/api/documents/${documentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: rootChannelId }),
      });
      if (movedBack.status === 200 && movedBack.body.channel_id === rootChannelId) {
        pass('move_document_back', rootChannelId);
      } else {
        fail('move_document_back', JSON.stringify(movedBack.body));
      }

      const deleted = await authJson(adminToken, `/api/documents/${documentId}`, { method: 'DELETE' });
      if (deleted.status === 200) pass('delete_document');
      else fail('delete_document', JSON.stringify(deleted.body));
      documentId = '';
    }
  } else {
    pass('upload_document_skipped', 'storage not configured');
  }

  const deleteChild = await authJson(adminToken, `/api/document-channels/${childChannelId}`, {
    method: 'DELETE',
  });
  if (deleteChild.status !== 200) fail('delete_child_channel', JSON.stringify(deleteChild.body));
  else pass('delete_child_channel');

  const deleteRoot = await authJson(adminToken, `/api/document-channels/${rootChannelId}`, {
    method: 'DELETE',
  });
  if (deleteRoot.status !== 200) fail('delete_root_channel', JSON.stringify(deleteRoot.body));
  else pass('delete_root_channel');

  const pool = getPool();
  const tableCheck = await pool.query(
    "SELECT to_regclass('public.app_document_channels') AS channels, to_regclass('public.app_documents') AS documents",
  );
  if (tableCheck.rows[0]?.channels && tableCheck.rows[0]?.documents) {
    pass('migration_tables_present');
  } else {
    fail('migration_tables_present', JSON.stringify(tableCheck.rows[0]));
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
