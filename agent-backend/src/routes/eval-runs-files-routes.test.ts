import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('evaluation runs file routes', () => {
  it('registers run file management routes (auth required, not 404)', async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? 'postgresql://127.0.0.1:5432/openkms_test';
    const { default: runs } = await import('./evaluation/runs.ts');

    const listRes = await runs.request('/00000000-0000-0000-0000-000000000001/files');
    assert.notEqual(listRes.status, 404);
    assert.equal(listRes.status, 401);

    const initRes = await runs.request('/00000000-0000-0000-0000-000000000001/files/upload-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'a.m4a', size_bytes: 1, file_hash: 'abc' }),
    });
    assert.notEqual(initRes.status, 404);
    assert.equal(initRes.status, 401);

    const deleteRes = await runs.request(
      '/00000000-0000-0000-0000-000000000001/files/00000000-0000-0000-0000-000000000002',
      { method: 'DELETE' },
    );
    assert.notEqual(deleteRes.status, 404);
    assert.equal(deleteRes.status, 401);
  });
});
