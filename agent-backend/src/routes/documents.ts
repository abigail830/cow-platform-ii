import { Hono } from 'hono';
import { KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES } from '../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../auth/jwt.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import { isStorageEnabled } from '../storage/s3-config.ts';
import {
  assembleUploadSession,
  buildDocumentS3Key,
  createChunkUploadSession,
  deleteDocumentStorage,
  extensionFromFilename,
  fileTypeFromExtension,
  MAX_DOCUMENT_BYTES,
  sha256Hex,
  StorageNotConfiguredError,
  storeUploadChunk,
  uploadDocumentObject,
  validateDocumentFilename,
} from '../storage/document-files.ts';
import {
  createDocumentRecord,
  deleteDocument,
  getDocumentById,
  getDocumentStats,
  listDocuments,
} from '../services/documents.ts';

const documents = new Hono();

documents.use('*', requireAuth);

function storageUnavailable(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json({ error: 'Object storage is not configured' }, 503);
}

async function persistUploadedFile(input: {
  channelId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
  uploadedBy: string;
}) {
  if (!isStorageEnabled()) throw new StorageNotConfiguredError();
  if (input.buffer.length > MAX_DOCUMENT_BYTES) {
    throw new Error('File exceeds maximum allowed size');
  }

  const filename = validateDocumentFilename(input.filename);
  const ext = extensionFromFilename(filename);
  const fileHash = sha256Hex(input.buffer);
  const s3Key = buildDocumentS3Key(fileHash, ext);

  await uploadDocumentObject(s3Key, input.buffer, input.contentType);

  return createDocumentRecord({
    channelId: input.channelId,
    name: filename,
    fileType: fileTypeFromExtension(ext),
    sizeBytes: input.buffer.length,
    fileHash,
    s3Key,
    uploadedBy: input.uploadedBy,
  });
}

function fileFromFormValue(value: unknown): File | null {
  if (value instanceof File) return value;
  return null;
}

documents.get(
  '/stats',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const stats = await getDocumentStats();
    return c.json(stats);
  },
);

documents.get(
  '/',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const channelId = c.req.query('channel_id');
    if (!channelId) return c.json({ error: 'channel_id is required' }, 400);

    try {
      const result = await listDocuments({
        channelId,
        search: c.req.query('search') ?? undefined,
        offset: Number(c.req.query('offset') ?? 0),
        limit: Number(c.req.query('limit') ?? 25),
      });
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list documents';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

documents.get(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const row = await getDocumentById(c.req.param('id'));
    if (!row) return c.json({ error: 'Document not found' }, 404);
    return c.json({
      id: row.id,
      channel_id: row.channelId,
      name: row.name,
      file_type: row.fileType,
      size_bytes: row.sizeBytes,
      file_hash: row.fileHash,
      s3_key: row.s3Key,
      status: row.status,
      metadata: row.metadata ?? {},
      uploaded_by: row.uploadedBy,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  },
);

documents.post(
  '/upload',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const user = getUser(c);
    const body = await c.req.parseBody();
    const file = fileFromFormValue(body.file);
    const channelId = typeof body.channel_id === 'string' ? body.channel_id : '';

    if (!channelId) return c.json({ error: 'channel_id is required' }, 400);
    if (!file) return c.json({ error: 'file is required' }, 400);

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const document = await persistUploadedFile({
        channelId,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        buffer,
        uploadedBy: user.id,
      });
      return c.json(document, 201);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: error instanceof Error ? error.message : 'Upload failed' }, 400);
    }
  },
);

documents.post(
  '/upload-chunk',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const user = getUser(c);
    const body = await c.req.parseBody();
    const chunk = fileFromFormValue(body.file_chunk);
    const channelId = typeof body.channel_id === 'string' ? body.channel_id : '';
    const filename = typeof body.filename === 'string' ? body.filename : '';
    const uploadId = typeof body.upload_id === 'string' ? body.upload_id : '';
    const chunkIndex = Number(body.chunk_index);
    const totalChunks = Number(body.total_chunks);

    if (!channelId || !filename) return c.json({ error: 'channel_id and filename are required' }, 400);
    if (!Number.isInteger(chunkIndex) || !Number.isInteger(totalChunks) || totalChunks < 1) {
      return c.json({ error: 'chunk_index and total_chunks are required' }, 400);
    }
    if (!chunk) return c.json({ error: 'file_chunk is required' }, 400);

    try {
      validateDocumentFilename(filename);
      if (chunkIndex > 0 && !uploadId) {
        return c.json({ error: 'upload_id is required for subsequent chunks' }, 400);
      }

      let sessionId = uploadId;
      if (!sessionId) {
        sessionId = createChunkUploadSession({
          channelId,
          filename,
          contentType: chunk.type || 'application/octet-stream',
          totalChunks,
        });
      }

      const session = storeUploadChunk(sessionId, chunkIndex, Buffer.from(await chunk.arrayBuffer()));
      if (session.chunks.size < session.totalChunks) {
        return c.json({ upload_id: sessionId, received: session.chunks.size, total_chunks: session.totalChunks });
      }

      const assembled = assembleUploadSession(sessionId);
      const document = await persistUploadedFile({
        channelId: assembled.channelId,
        filename: assembled.filename,
        contentType: assembled.contentType,
        buffer: assembled.buffer,
        uploadedBy: user.id,
      });
      return c.json(document, 201);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: error instanceof Error ? error.message : 'Chunk upload failed' }, 400);
    }
  },
);

documents.delete(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    try {
      const row = await deleteDocument(c.req.param('id'));
      if (isStorageEnabled()) {
        try {
          await deleteDocumentStorage(row.fileHash);
        } catch {
          // DB row is already removed; storage cleanup failure is non-fatal for the API response.
        }
      }
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete document';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

export default documents;
