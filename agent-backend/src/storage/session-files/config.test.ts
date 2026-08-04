import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { defaultSessionFilesRoot, resolveSessionFilesBackend } from './config.ts';
import { isAllowedSessionFile } from './constants.ts';

test('defaultSessionFilesRoot lives outside agent-backend', () => {
  const root = defaultSessionFilesRoot();
  assert.match(root, /[\\/]\.run[\\/]session-attachments$/);
  assert.ok(!root.includes(`${path.sep}agent-backend${path.sep}data${path.sep}`));
});

test('resolveSessionFilesBackend honors explicit local', () => {
  const previous = process.env.SESSION_FILES_BACKEND;
  process.env.SESSION_FILES_BACKEND = 'local';
  assert.equal(resolveSessionFilesBackend(), 'local');
  if (previous === undefined) delete process.env.SESSION_FILES_BACKEND;
  else process.env.SESSION_FILES_BACKEND = previous;
});

test('isAllowedSessionFile accepts documents and images', () => {
  assert.equal(isAllowedSessionFile('a.pdf'), true);
  assert.equal(isAllowedSessionFile('a.png'), true);
  assert.equal(isAllowedSessionFile('a.exe'), false);
});
