import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectRagReindexDocumentIds,
  countDistinctRagIndexedDocuments,
  mergeRagIndexedDocuments,
  resolveRagIndexedDocumentStatus,
  type RagChunkDocumentRow,
} from './kb-indexed-documents-merge.ts';

const t = (value: string) => new Date(value);

function statusRow(
  overrides: Partial<RagChunkDocumentRow> & Pick<RagChunkDocumentRow, 'documentId'>,
): RagChunkDocumentRow {
  return {
    documentName: 'Doc',
    channelPath: 'Channel',
    indexStatus: 'indexed',
    indexError: null,
    indexedAt: t('2026-08-01T10:00:00Z'),
    updatedAt: t('2026-08-01T10:00:00Z'),
    ...overrides,
  };
}

describe('kb-indexed-documents-merge', () => {
  it('counts union of chunk docs and status-only docs', () => {
    const total = countDistinctRagIndexedDocuments({
      chunkDocumentIds: ['doc-a', 'doc-b'],
      statusRows: [
        statusRow({ documentId: 'doc-b', indexStatus: 'indexed' }),
        statusRow({ documentId: 'doc-failed', indexStatus: 'failed' }),
      ],
    });
    assert.equal(total, 3);
  });

  it('lists legacy chunk-only documents as indexed', () => {
    const merged = mergeRagIndexedDocuments({
      chunkAggregates: [
        { documentId: 'legacy-doc', chunkCount: 4, indexedAt: t('2026-08-01T09:00:00Z') },
      ],
      statusRows: [],
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.documentId, 'legacy-doc');
    assert.equal(merged[0]?.chunkCount, 4);
    assert.equal(
      resolveRagIndexedDocumentStatus({
        statusRow: merged[0]?.statusRow ?? null,
        chunkCount: merged[0]?.chunkCount ?? null,
      }),
      'indexed',
    );
  });

  it('lists failed documents without chunks from status table', () => {
    const merged = mergeRagIndexedDocuments({
      chunkAggregates: [],
      statusRows: [
        statusRow({
          documentId: 'doc-failed',
          indexStatus: 'failed',
          indexError: 'boto3 missing',
          indexedAt: null,
        }),
      ],
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.statusRow?.indexError, 'boto3 missing');
    assert.equal(
      resolveRagIndexedDocumentStatus({
        statusRow: merged[0]?.statusRow ?? null,
        chunkCount: null,
      }),
      'failed',
    );
  });

  it('prefers status row when both chunk and status exist', () => {
    const merged = mergeRagIndexedDocuments({
      chunkAggregates: [
        { documentId: 'doc-1', chunkCount: 2, indexedAt: t('2026-08-01T08:00:00Z') },
      ],
      statusRows: [
        statusRow({
          documentId: 'doc-1',
          indexStatus: 'indexing',
          updatedAt: t('2026-08-01T11:00:00Z'),
        }),
      ],
    });
    assert.equal(merged[0]?.statusRow?.indexStatus, 'indexing');
    assert.equal(merged[0]?.chunkCount, 2);
  });

  it('collects reindex ids from chunks and indexed status rows', () => {
    const ids = collectRagReindexDocumentIds({
      chunkDocumentIds: ['legacy-doc'],
      statusRows: [
        statusRow({ documentId: 'indexed-doc', indexStatus: 'indexed' }),
        statusRow({ documentId: 'failed-doc', indexStatus: 'failed' }),
      ],
    });
    assert.deepEqual(new Set(ids), new Set(['legacy-doc', 'indexed-doc']));
  });
});
