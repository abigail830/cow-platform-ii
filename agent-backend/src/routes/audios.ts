import { Hono } from 'hono';
import { KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES } from '../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../auth/jwt.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import { listAccessibleAudioChannelIds } from '../auth/audio-resource-access.ts';
import { denyUnlessAudioAccess, denyUnlessAudioChannelAccess } from '../auth/require-resource-access.ts';
import { routeParam } from '../http/route-param.ts';
import { isStorageEnabled } from '../storage/s3-config.ts';
import {
  assembleUploadSession,
  attachmentContentDisposition,
  buildAudioS3Key,
  createChunkUploadSession,
  deleteAudioStorage,
  extensionFromFilename,
  fileTypeFromExtension,
  formatStorageError,
  getStorageReadUrl,
  getStorageUploadUrl,
  guessAudioContentType,
  headStorageObject,
  MAX_AUDIO_BYTES,
  sha256Hex,
  StorageNotConfiguredError,
  storeUploadChunk,
  transcriptS3Key,
  uploadAudioObject,
  validateAudioFilename,
  validateFileHash,
} from '../storage/audio-files.ts';
import {
  createAudioRecord,
  deleteAudio,
  getAudioById,
  getAudioPublicById,
  getAudioStats,
  listAudios,
} from '../services/audios.ts';
import { autoStartAudioPipelineAfterUpload } from '../services/auto-audio-pipeline.ts';
import { startAudioPipeline } from '../services/audio-pipeline-runner.ts';
import { isTranscriptSourceMetadata } from '../services/capture-transcript-upload.ts';

const audios = new Hono();

audios.use('*', requireAuth);

function storageUnavailable(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json({ error: 'Object storage is not configured' }, 503);
}

async function finalizeAudioRecord(input: {
  channelId: string;
  filename: string;
  fileHash: string;
  s3Key: string;
  sizeBytes: number;
  uploadedBy: string;
}) {
  if (input.sizeBytes > MAX_AUDIO_BYTES) {
    throw new Error('File exceeds maximum allowed size');
  }

  const filename = validateAudioFilename(input.filename);
  const fileHash = validateFileHash(input.fileHash);
  const ext = extensionFromFilename(filename);
  const expectedKey = buildAudioS3Key(fileHash, ext);
  if (input.s3Key !== expectedKey) {
    throw new Error('s3_key does not match file_hash and filename');
  }

  const head = await headStorageObject(expectedKey);
  if (!head.exists) {
    throw new Error('Uploaded object not found in storage. Complete the direct upload first.');
  }
  if (head.size !== input.sizeBytes) {
    throw new Error(`Uploaded object size mismatch (expected ${input.sizeBytes}, got ${head.size})`);
  }

  const audio = await createAudioRecord({
    channelId: input.channelId,
    name: filename,
    fileType: fileTypeFromExtension(ext),
    sizeBytes: input.sizeBytes,
    fileHash,
    s3Key: expectedKey,
    uploadedBy: input.uploadedBy,
  });

  void autoStartAudioPipelineAfterUpload(audio.id, input.channelId);

  const refreshed = await getAudioPublicById(audio.id);
  return refreshed ?? audio;
}

async function persistUploadedAudio(input: {
  channelId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
  uploadedBy: string;
}) {
  if (!isStorageEnabled()) throw new StorageNotConfiguredError();
  if (input.buffer.length > MAX_AUDIO_BYTES) {
    throw new Error('File exceeds maximum allowed size');
  }

  const filename = validateAudioFilename(input.filename);
  const ext = extensionFromFilename(filename);
  const fileHash = sha256Hex(input.buffer);
  const s3Key = buildAudioS3Key(fileHash, ext);

  await uploadAudioObject(s3Key, input.buffer, input.contentType);

  return finalizeAudioRecord({
    channelId: input.channelId,
    filename,
    fileHash,
    s3Key,
    sizeBytes: input.buffer.length,
    uploadedBy: input.uploadedBy,
  });
}
function fileFromFormValue(value: unknown): File | null {
  if (value instanceof File) return value;
  return null;
}

audios.get(
  '/stats',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'read'),
  async (c) => {
    const user = getUser(c);
    const channelIds = await listAccessibleAudioChannelIds(user.id);
    const stats = await getAudioStats(channelIds);
    return c.json(stats);
  },
);

audios.get(
  '/',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'read'),
  async (c) => {
    const channelId = c.req.query('channel_id');
    if (!channelId) return c.json({ error: 'channel_id is required' }, 400);

    const denied = await denyUnlessAudioChannelAccess(c, channelId, 'read');
    if (denied) return denied;

    try {
      const result = await listAudios({
        channelId,
        search: c.req.query('search') ?? undefined,
        offset: Number(c.req.query('offset') ?? 0),
        limit: Number(c.req.query('limit') ?? 25),
      });
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list audio files';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

audios.get(
  '/:id/download',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'read'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Audio id is required' }, 400);

    const denied = await denyUnlessAudioAccess(c, id, 'read');
    if (denied) return denied;

    const row = await getAudioById(id);
    if (!row) return c.json({ error: 'Audio not found' }, 404);

    try {
      const url = await getStorageReadUrl(row.s3Key);
      return c.json({
        url,
        filename: row.name,
        content_disposition: attachmentContentDisposition(row.name),
      });
    } catch (error) {
      return c.json({ error: formatStorageError(error) }, 400);
    }
  },
);

audios.get(
  '/:id/transcript',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'read'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Audio id is required' }, 400);

    const denied = await denyUnlessAudioAccess(c, id, 'read');
    if (denied) return denied;

    const row = await getAudioById(id);
    if (!row) return c.json({ error: 'Audio not found' }, 404);

    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const isTranscriptSource = isTranscriptSourceMetadata(metadata);
    const key =
      isTranscriptSource && row.s3Key?.trim() ? row.s3Key : transcriptS3Key(row.fileHash);

    try {
      const transcriptUrl = await getStorageReadUrl(key);
      return c.json({
        id: row.id,
        status: row.status,
        has_transcript: isTranscriptSource,
        transcript_url: transcriptUrl,
        transcript: null,
      });
    } catch (error) {
      return c.json({ error: formatStorageError(error) }, 400);
    }
  },
);

audios.get(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Audio id is required' }, 400);

    const denied = await denyUnlessAudioAccess(c, id, 'read');
    if (denied) return denied;

    const audio = await getAudioPublicById(id);
    if (!audio) return c.json({ error: 'Audio not found' }, 404);
    return c.json(audio);
  },
);

audios.post(
  '/upload-init',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const body = await c.req.json<{
      channel_id?: string;
      filename?: string;
      file_hash?: string;
      size_bytes?: number;
      content_type?: string;
    }>();

    const channelId = body.channel_id?.trim() ?? '';
    const filename = body.filename?.trim() ?? '';
    const sizeBytes = Number(body.size_bytes);

    if (!channelId || !filename) {
      return c.json({ error: 'channel_id and filename are required' }, 400);
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
      return c.json({ error: 'size_bytes is required' }, 400);
    }
    if (sizeBytes > MAX_AUDIO_BYTES) {
      return c.json({ error: 'File exceeds maximum allowed size' }, 400);
    }

    const denied = await denyUnlessAudioChannelAccess(c, channelId, 'write');
    if (denied) return denied;

    try {
      validateAudioFilename(filename);
      const fileHash = validateFileHash(body.file_hash ?? '');
      const ext = extensionFromFilename(filename);
      const s3Key = buildAudioS3Key(fileHash, ext);
      const contentType = body.content_type?.trim() || guessAudioContentType(ext);

      const head = await headStorageObject(s3Key);
      if (head.exists && head.size === sizeBytes) {
        return c.json({
          s3_key: s3Key,
          file_hash: fileHash,
          skip_upload: true,
        });
      }

      const uploadUrl = await getStorageUploadUrl(s3Key, contentType);
      return c.json({
        s3_key: s3Key,
        file_hash: fileHash,
        upload_url: uploadUrl,
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        skip_upload: false,
      });
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: error instanceof Error ? error.message : 'Upload init failed' }, 400);
    }
  },
);

audios.post(
  '/upload-complete',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const user = getUser(c);
    const body = await c.req.json<{
      channel_id?: string;
      filename?: string;
      file_hash?: string;
      s3_key?: string;
      size_bytes?: number;
    }>();

    const channelId = body.channel_id?.trim() ?? '';
    const filename = body.filename?.trim() ?? '';
    const s3Key = body.s3_key?.trim() ?? '';
    const sizeBytes = Number(body.size_bytes);

    if (!channelId || !filename || !s3Key) {
      return c.json({ error: 'channel_id, filename, and s3_key are required' }, 400);
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
      return c.json({ error: 'size_bytes is required' }, 400);
    }

    const denied = await denyUnlessAudioChannelAccess(c, channelId, 'write');
    if (denied) return denied;

    try {
      const audio = await finalizeAudioRecord({
        channelId,
        filename,
        fileHash: body.file_hash ?? '',
        s3Key,
        sizeBytes,
        uploadedBy: user.id,
      });
      return c.json(audio, 201);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: error instanceof Error ? error.message : 'Upload complete failed' }, 400);
    }
  },
);

audios.post(
  '/upload',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const user = getUser(c);
    const body = await c.req.parseBody();
    const file = fileFromFormValue(body.file);
    const channelId = typeof body.channel_id === 'string' ? body.channel_id : '';

    if (!channelId) return c.json({ error: 'channel_id is required' }, 400);
    if (!file) return c.json({ error: 'file is required' }, 400);

    const denied = await denyUnlessAudioChannelAccess(c, channelId, 'write');
    if (denied) return denied;

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const audio = await persistUploadedAudio({
        channelId,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        buffer,
        uploadedBy: user.id,
      });
      return c.json(audio, 201);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: error instanceof Error ? error.message : 'Upload failed' }, 400);
    }
  },
);

audios.post(
  '/upload-chunk',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
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

    const denied = await denyUnlessAudioChannelAccess(c, channelId, 'write');
    if (denied) return denied;

    try {
      validateAudioFilename(filename);
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
      const audio = await persistUploadedAudio({
        channelId: assembled.channelId,
        filename: assembled.filename,
        contentType: assembled.contentType,
        buffer: assembled.buffer,
        uploadedBy: user.id,
      });
      return c.json(audio, 201);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: error instanceof Error ? error.message : 'Chunk upload failed' }, 400);
    }
  },
);

audios.post(
  '/:id/run-pipeline',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    try {
      const id = routeParam(c, 'id');
      if (!id) return c.json({ error: 'Audio id is required' }, 400);

      const denied = await denyUnlessAudioAccess(c, id, 'write');
      if (denied) return denied;

      const result = await startAudioPipeline(id);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start pipeline';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

audios.delete(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    if (!isStorageEnabled()) return storageUnavailable(c);

    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Audio id is required' }, 400);

    const denied = await denyUnlessAudioAccess(c, id, 'write');
    if (denied) return denied;

    try {
      const row = await deleteAudio(id);
      await deleteAudioStorage(row.fileHash, row.s3Key);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete audio';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

export default audios;
