import { Hono } from 'hono';
import { KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES } from '../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../auth/jwt.ts';
import { requireResourcePermission } from '../auth/require-permission.ts';
import { denyUnlessAudioChannelAccess } from '../auth/require-resource-access.ts';
import { routeParam } from '../http/route-param.ts';
import { isStorageEnabled } from '../storage/s3-config.ts';
import {
  buildAudioS3Key,
  extensionFromFilename,
  fileTypeFromExtension,
  formatStorageError,
  guessAudioContentType,
  headStorageObject,
  MAX_AUDIO_BYTES,
  sha256Hex,
  StorageNotConfiguredError,
  uploadAudioObject,
  validateAudioFilename,
  validateFileHash,
} from '../storage/audio-files.ts';
import {
  captureArtifactS3Key,
  presignCapturePostProcessArtifacts,
  readCapturePostProcessArtifactBundle,
  type CaptureArtifactName,
  type CapturePostProcessArtifactKind,
} from '../storage/audio-capture-files.ts';
import { readStorageText } from '../storage/document-content.ts';
import {
  attachAudioToCapture,
  createAudioCapture,
  deleteAudioCapture,
  detachCaptureSegment,
  getCaptureChannelMeta,
  getCaptureWithSegments,
  listAudioCaptures,
  reorderCaptureSegments,
  updateAudioCapture,
} from '../services/audio-captures.ts';
import { createAudioRecord } from '../services/audios.ts';
import { autoStartAudioPipelineAfterUpload } from '../services/auto-audio-pipeline.ts';
import { startCapturePostProcess } from '../services/audio-capture-pipeline-runner.ts';
import {
  AUDIO_CAPTURE_AUDIENCES,
  AUDIO_CAPTURE_INPUT_MODES,
  AUDIO_CAPTURE_RECORDING_MODES,
} from '../db/schema.ts';
import { initAudioSegmentUpload } from '../services/capture-audio-upload.ts';
import {
  completeTranscriptSegmentUpload,
  createAndAttachTranscriptSegment,
  initTranscriptSegmentUpload,
} from '../services/capture-transcript-upload.ts';

const audioCaptures = new Hono();

audioCaptures.use('*', requireAuth);

function storageUnavailable(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json({ error: 'Object storage is not configured' }, 503);
}

async function persistSegmentUpload(input: {
  channelId: string;
  captureId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
  uploadedBy: string;
  segmentLabel?: string | null;
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

  await attachAudioToCapture({
    captureId: input.captureId,
    audioId: audio.id,
    segmentLabel: input.segmentLabel,
  });

  void autoStartAudioPipelineAfterUpload(audio.id, input.channelId);
  return audio;
}

function fileFromFormValue(value: unknown): File | null {
  if (value instanceof File) return value;
  return null;
}

const ARTIFACT_NAMES = new Set<CaptureArtifactName>([
  'structured_transcript',
  'recording_context',
  'extraction',
]);

const POST_PROCESS_ARTIFACT_KINDS = new Set<CapturePostProcessArtifactKind>([
  'structured_transcript',
  'recording_context',
  'extraction',
  'summary',
]);

audioCaptures.get(
  '/',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'read'),
  async (c) => {
    const channelId = c.req.query('channel_id');
    if (!channelId) return c.json({ error: 'channel_id is required' }, 400);

    const denied = await denyUnlessAudioChannelAccess(c, channelId, 'read');
    if (denied) return denied;

    const result = await listAudioCaptures({
      channelId,
      search: c.req.query('search') ?? undefined,
      limit: Number(c.req.query('limit') ?? 50),
      offset: Number(c.req.query('offset') ?? 0),
    });
    return c.json(result);
  },
);

audioCaptures.post(
  '/',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    const body = await c.req.json<{
      channel_id: string;
      title: string;
      brief?: string;
      participants_hint?: string;
      recording_mode?: string;
      audience?: string;
      input_mode?: string;
    }>();

    if (!body.channel_id || !body.title?.trim()) {
      return c.json({ error: 'channel_id and title are required' }, 400);
    }

    const denied = await denyUnlessAudioChannelAccess(c, body.channel_id, 'write');
    if (denied) return denied;

    if (body.recording_mode && !AUDIO_CAPTURE_RECORDING_MODES.includes(body.recording_mode as never)) {
      return c.json({ error: 'Invalid recording_mode' }, 400);
    }
    if (body.audience && !AUDIO_CAPTURE_AUDIENCES.includes(body.audience as never)) {
      return c.json({ error: 'Invalid audience' }, 400);
    }
    if (body.input_mode && !AUDIO_CAPTURE_INPUT_MODES.includes(body.input_mode as never)) {
      return c.json({ error: 'Invalid input_mode' }, 400);
    }

    const user = getUser(c);
    const capture = await createAudioCapture({
      channelId: body.channel_id,
      title: body.title,
      brief: body.brief,
      participantsHint: body.participants_hint,
      recordingMode: (body.recording_mode as never) ?? null,
      audience: (body.audience as never) ?? 'unknown',
      inputMode: (body.input_mode as never) ?? 'audio',
      createdBy: user.id,
    });

    return c.json(capture, 201);
  },
);

audioCaptures.get(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const sync = c.req.query('sync') !== 'false';
    const capture = await getCaptureWithSegments(id, { sync });
    if (!capture) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessAudioChannelAccess(c, capture.channel_id, 'read');
    if (denied) return denied;

    return c.json(capture);
  },
);

audioCaptures.patch(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const existing = await getCaptureWithSegments(id);
    if (!existing) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessAudioChannelAccess(c, existing.channel_id, 'write');
    if (denied) return denied;

    const body = await c.req.json<{
      title?: string;
      brief?: string | null;
      participants_hint?: string | null;
      recording_mode?: string | null;
      audience?: string;
    }>();

    if (body.recording_mode && !AUDIO_CAPTURE_RECORDING_MODES.includes(body.recording_mode as never)) {
      return c.json({ error: 'Invalid recording_mode' }, 400);
    }
    if (body.audience && !AUDIO_CAPTURE_AUDIENCES.includes(body.audience as never)) {
      return c.json({ error: 'Invalid audience' }, 400);
    }

    await updateAudioCapture(id, {
      title: body.title,
      brief: body.brief,
      participantsHint: body.participants_hint,
      recordingMode: (body.recording_mode as never) ?? undefined,
      audience: body.audience as never,
    });

    const refreshed = await getCaptureWithSegments(id);
    return c.json(refreshed);
  },
);

audioCaptures.delete(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const existing = await getCaptureWithSegments(id);
    if (!existing) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessAudioChannelAccess(c, existing.channel_id, 'write');
    if (denied) return denied;

    await deleteAudioCapture(id);
    return c.json({ ok: true });
  },
);

audioCaptures.post(
  '/:id/segments/upload-init',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const capture = await getCaptureWithSegments(id, { sync: false });
    if (!capture) return c.json({ error: 'Capture not found' }, 404);
    if (capture.input_mode === 'transcript') {
      return c.json({ error: 'Capture is not in audio input mode' }, 400);
    }

    const denied = await denyUnlessAudioChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;
    if (!isStorageEnabled()) return storageUnavailable(c);

    const body = await c.req.json<{
      filename?: string;
      file_hash?: string;
      size_bytes?: number;
      content_type?: string;
    }>();

    try {
      const result = await initAudioSegmentUpload({
        filename: body.filename ?? '',
        fileHash: body.file_hash ?? '',
        sizeBytes: Number(body.size_bytes),
        contentType: body.content_type,
      });
      return c.json(result);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: formatStorageError(error) }, 400);
    }
  },
);

audioCaptures.post(
  '/:id/segments/transcript-upload-init',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const capture = await getCaptureWithSegments(id, { sync: false });
    if (!capture) return c.json({ error: 'Capture not found' }, 404);
    if (capture.input_mode !== 'transcript') {
      return c.json({ error: 'Capture is not in transcript input mode' }, 400);
    }

    const denied = await denyUnlessAudioChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;
    if (!isStorageEnabled()) return storageUnavailable(c);

    const body = await c.req.json<{
      filename?: string;
      size_bytes?: number;
      file_hash?: string;
    }>();

    try {
      const result = await initTranscriptSegmentUpload({
        captureId: id,
        filename: body.filename ?? '',
        sizeBytes: Number(body.size_bytes),
      });
      return c.json(result);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: formatStorageError(error) }, 400);
    }
  },
);

audioCaptures.post(
  '/:id/segments',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const capture = await getCaptureWithSegments(id);
    if (!capture) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessAudioChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;

    if (!isStorageEnabled()) return storageUnavailable(c);

    const user = getUser(c);
    const contentType = c.req.header('content-type') ?? '';

    try {
      const inputMode = capture.input_mode ?? 'audio';

      if (contentType.includes('multipart/form-data')) {
        const form = await c.req.parseBody();
        const file = fileFromFormValue(form.file);
        if (!file) return c.json({ error: 'file is required' }, 400);
        const segmentLabel =
          typeof form.segment_label === 'string' ? form.segment_label : undefined;
        const buffer = Buffer.from(await file.arrayBuffer());

        if (inputMode === 'transcript') {
          const segment = await createAndAttachTranscriptSegment({
            channelId: capture.channel_id,
            captureId: id,
            filename: file.name,
            buffer,
            uploadedBy: user.id,
            segmentLabel,
          });
          const refreshed = await getCaptureWithSegments(id);
          return c.json({ audio_id: segment.id, capture: refreshed }, 201);
        }

        const audio = await persistSegmentUpload({
          channelId: capture.channel_id,
          captureId: id,
          filename: file.name,
          contentType: file.type || guessAudioContentType(extensionFromFilename(file.name)),
          buffer,
          uploadedBy: user.id,
          segmentLabel,
        });
        const refreshed = await getCaptureWithSegments(id);
        return c.json({ audio_id: audio.id, capture: refreshed }, 201);
      }

      const body = await c.req.json<{
        filename: string;
        file_hash?: string;
        s3_key?: string;
        size_bytes?: number;
        segment_label?: string;
        upload_id?: string;
        staging_s3_key?: string;
      }>();

      if (inputMode === 'transcript') {
        if (!body.upload_id || !body.staging_s3_key || !body.filename) {
          return c.json({ error: 'upload_id, staging_s3_key, and filename are required' }, 400);
        }
        const sizeBytes = Number(body.size_bytes);
        if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
          return c.json({ error: 'size_bytes is required' }, 400);
        }

        const segment = await completeTranscriptSegmentUpload({
          channelId: capture.channel_id,
          captureId: id,
          uploadId: body.upload_id,
          filename: body.filename,
          stagingS3Key: body.staging_s3_key,
          sizeBytes,
          uploadedBy: user.id,
          segmentLabel: body.segment_label,
        });
        const refreshed = await getCaptureWithSegments(id);
        return c.json({ audio_id: segment.id, capture: refreshed }, 201);
      }

      const filename = validateAudioFilename(body.filename);
      const fileHash = validateFileHash(body.file_hash ?? '');
      const ext = extensionFromFilename(filename);
      const expectedKey = buildAudioS3Key(fileHash, ext);
      if (body.s3_key !== expectedKey) {
        return c.json({ error: 's3_key does not match file_hash and filename' }, 400);
      }

      const head = await headStorageObject(expectedKey);
      if (!head.exists) {
        return c.json({ error: 'Uploaded object not found in storage' }, 400);
      }

      const audio = await createAudioRecord({
        channelId: capture.channel_id,
        name: filename,
        fileType: fileTypeFromExtension(ext),
        sizeBytes: body.size_bytes,
        fileHash,
        s3Key: expectedKey,
        uploadedBy: user.id,
      });

      await attachAudioToCapture({
        captureId: id,
        audioId: audio.id,
        segmentLabel: body.segment_label,
      });

      void autoStartAudioPipelineAfterUpload(audio.id, capture.channel_id);
      const refreshed = await getCaptureWithSegments(id);
      return c.json({ audio_id: audio.id, capture: refreshed }, 201);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: formatStorageError(error) }, 400);
    }
  },
);

audioCaptures.patch(
  '/:id/segments/order',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const capture = await getCaptureWithSegments(id);
    if (!capture) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessAudioChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;

    const body = await c.req.json<{ ordered_audio_ids: string[] }>();
    if (!Array.isArray(body.ordered_audio_ids)) {
      return c.json({ error: 'ordered_audio_ids must be an array' }, 400);
    }

    try {
      await reorderCaptureSegments(id, body.ordered_audio_ids);
      const refreshed = await getCaptureWithSegments(id);
      return c.json(refreshed);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Reorder failed' }, 400);
    }
  },
);

audioCaptures.delete(
  '/:id/segments/:audioId',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    const audioId = routeParam(c, 'audioId');
    if (!id || !audioId) return c.json({ error: 'Capture id and audio id are required' }, 400);

    const capture = await getCaptureWithSegments(id);
    if (!capture) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessAudioChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;

    try {
      await detachCaptureSegment(id, audioId);
      const refreshed = await getCaptureWithSegments(id);
      return c.json(refreshed);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Detach failed' }, 400);
    }
  },
);

audioCaptures.post(
  '/:id/run-pipeline',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const capture = await getCaptureWithSegments(id);
    if (!capture) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessAudioChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;

    try {
      const result = await startCapturePostProcess(id);
      const refreshed = await getCaptureWithSegments(id);
      return c.json({ ...result, capture: refreshed });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Failed to start pipeline' }, 400);
    }
  },
);

audioCaptures.get(
  '/:id/post-process-artifacts',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const meta = await getCaptureChannelMeta(id);
    if (!meta) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessAudioChannelAccess(c, meta.channel_id, 'read');
    if (denied) return denied;

    if (!isStorageEnabled()) return storageUnavailable(c);

    try {
      const bundle = await readCapturePostProcessArtifactBundle(id);
      if (bundle.missing.length === 3) {
        return c.json({ error: 'Post-process artifacts not found in storage' }, 404);
      }
      const coreMissing = bundle.missing.filter((name) => name !== 'summary');
      if (coreMissing.length === 0) {
        const { syncCaptureStatus } = await import('../services/capture-status.ts');
        void syncCaptureStatus(id);
      }
      return c.json(bundle);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load artifacts';
      const storageTimeout = /ETIMEDOUT|ECONNRESET|ENOTFOUND|timeout|timed out|socket hang up/i.test(
        message,
      );
      return c.json(
        {
          error: storageTimeout
            ? 'Object storage connection timed out'
            : message,
        },
        storageTimeout ? 503 : 500,
      );
    }
  },
);

audioCaptures.post(
  '/:id/post-process-artifacts-presign',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const meta = await getCaptureChannelMeta(id);
    if (!meta) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessAudioChannelAccess(c, meta.channel_id, 'read');
    if (denied) return denied;

    if (!isStorageEnabled()) return storageUnavailable(c);

    const body = await c.req.json<{ artifacts?: string[] }>().catch((): { artifacts?: string[] } => ({}));
    const requested = Array.isArray(body.artifacts) ? body.artifacts : [...POST_PROCESS_ARTIFACT_KINDS];
    if (requested.length === 0) {
      return c.json({ error: 'artifacts array is required' }, 400);
    }
    if (requested.length > POST_PROCESS_ARTIFACT_KINDS.size) {
      return c.json({ error: 'Too many artifacts requested' }, 400);
    }

    const artifacts: CapturePostProcessArtifactKind[] = [];
    for (const raw of requested) {
      if (!POST_PROCESS_ARTIFACT_KINDS.has(raw as CapturePostProcessArtifactKind)) {
        return c.json({ error: `Unknown artifact: ${raw}` }, 400);
      }
      artifacts.push(raw as CapturePostProcessArtifactKind);
    }

    try {
      const files = await presignCapturePostProcessArtifacts(id, artifacts);
      return c.json({ files });
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: formatStorageError(error) }, 400);
    }
  },
);

audioCaptures.get(
  '/:id/artifacts/:artifact',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.AUDIO, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    const artifact = routeParam(c, 'artifact');
    if (!id || !artifact) return c.json({ error: 'Capture id and artifact are required' }, 400);
    if (!ARTIFACT_NAMES.has(artifact as CaptureArtifactName)) {
      return c.json({ error: 'Unknown artifact' }, 400);
    }

    const meta = await getCaptureChannelMeta(id);
    if (!meta) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessAudioChannelAccess(c, meta.channel_id, 'read');
    if (denied) return denied;

    if (!isStorageEnabled()) return storageUnavailable(c);

    try {
      const key = captureArtifactS3Key(id, artifact as CaptureArtifactName);
      const text = await readStorageText(key);
      if (!text) return c.json({ error: 'Artifact not found' }, 404);
      const data = JSON.parse(text);
      return c.json({ artifact, data });
    } catch {
      return c.json({ error: 'Artifact not found' }, 404);
    }
  },
);

export default audioCaptures;
