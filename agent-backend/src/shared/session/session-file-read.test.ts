import '../load-env.ts';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  deleteSessionFile,
  listSessionFileItems,
  readSessionFileCachedText,
  uploadSessionFile,
} from '../../storage/session-files/session-file-service.ts';
import { readSessionFileText } from './session-file-read.ts';
import { searchSessionFiles } from './session-file-search.ts';

test('local session file upload list read search and delete', async () => {
  const previousBackend = process.env.SESSION_FILES_BACKEND;
  const previousRoot = process.env.SESSION_FILES_ROOT;
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'okf-session-files-'));
  process.env.SESSION_FILES_BACKEND = 'local';
  process.env.SESSION_FILES_ROOT = tempRoot;

  const instanceId = 'user--conv-test';
  try {
    const record = await uploadSessionFile({
      instanceId,
      agentName: 'content-studio',
      filename: 'report.csv',
      bytes: Buffer.from('region,Q2\nAPAC,42\nEMEA,17', 'utf8'),
    });
    assert.ok(record.id.startsWith('sf_'));

    const listed = await listSessionFileItems(instanceId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.filename, 'report.csv');
    assert.equal(listed[0]?.hasContentCache, true);

    const cached = await readSessionFileCachedText(instanceId, record.id);
    assert.ok(cached?.includes('APAC'));

    const read = await readSessionFileText({ instanceId, fileId: record.id });
    assert.match(read.text, /Q2/);
    assert.match(read.text, /EMEA,17/);
    assert.equal(read.truncated, false);

    const cachedAfterRead = await readSessionFileCachedText(instanceId, record.id);
    assert.ok(cachedAfterRead?.includes('APAC'));

    const hits = await searchSessionFiles({ instanceId, query: 'emea' });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.line, 3);

    const deleted = await deleteSessionFile(instanceId, record.id);
    assert.equal(deleted, true);
    assert.equal((await listSessionFileItems(instanceId)).length, 0);
  } finally {
    if (previousBackend === undefined) delete process.env.SESSION_FILES_BACKEND;
    else process.env.SESSION_FILES_BACKEND = previousBackend;
    if (previousRoot === undefined) delete process.env.SESSION_FILES_ROOT;
    else process.env.SESSION_FILES_ROOT = previousRoot;
    await rm(tempRoot, { recursive: true, force: true });
  }
});
