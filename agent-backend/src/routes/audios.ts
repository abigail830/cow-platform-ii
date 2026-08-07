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
  MAX_AUDIO_BYTES,
  readStorageText,
  sha256Hex,
  StorageNotConfiguredError,
  storeUploadChunk,
  transcriptS3Key,
  uploadAudioObject,
  validateAudioFilename,
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

const audios = new Hono();

audios.use('*', requireAuth);

function storageUnavailable(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json({ error: 'Object storage is not configured' }, 503);
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

  const audio = await createAudioRecord({
    channelId: input.channelId,
    name: filename,
    fileType: fileTypeFromExtension(ext),
    sizeBytes: input.buffer.length,
    fileHash,
    s3Key,
    uploadedBy: input.uploadedBy,
  });

  await autoStartAudioPipelineAfterUpload(audio.id, input.channelId);

  const refreshed = await getAudioPublicById(audio.id);
  return refreshed ?? audio;
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

    const transcript = await readStorageText(transcriptS3Key(row.fileHash));
    return c.json({
      id: row.id,
      status: row.status,
      has_transcript: Boolean(transcript),
      transcript: transcript ?? null,
    });
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
