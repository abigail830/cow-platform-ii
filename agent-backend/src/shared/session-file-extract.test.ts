import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extractSessionFileText } from './session-file-extract.ts';

test('extractSessionFileText reads utf8 markdown and csv', async () => {
  const md = await extractSessionFileText({
    filename: 'notes.md',
    mimeType: 'text/markdown',
    bytes: Buffer.from('# Title\n\nBody', 'utf8'),
  });
  assert.equal(md.text, '# Title\n\nBody');

  const csv = await extractSessionFileText({
    filename: 'data.csv',
    mimeType: 'text/csv',
    bytes: Buffer.from('a,b\n1,2', 'utf8'),
  });
  assert.equal(csv.text, 'a,b\n1,2');
});

test('extractSessionFileText parses minimal xlsx workbook', async () => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Q1', 'Q2'],
    ['10', '20'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Metrics');
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const result = await extractSessionFileText({
    filename: 'metrics.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes,
  });
  assert.match(result.text, /Metrics/);
  assert.match(result.text, /Q1/);
  assert.match(result.text, /20/);
});
