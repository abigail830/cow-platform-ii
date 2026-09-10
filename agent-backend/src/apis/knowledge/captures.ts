import { Hono } from 'hono';
import { KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { denyUnlessChannelAccess } from '../../auth/require-resource-access.ts';
import { routeParam } from '../../infrastructure/http/route-param.ts';
import { isStorageEnabled } from '../../infrastructure/oss/s3-config.ts';
import {
  buildDocumentS3Key,
  extensionFromFilename,
  fileTypeFromExtension,
  formatStorageError,
  validateDocumentFilename,
  validateFileHash,
} from '../../document/infrastructure/document-files.ts';
import {
  buildAudioS3Key,
  extensionFromFilename as audioExtensionFromFilename,
  fileTypeFromExtension as audioFileTypeFromExtension,
  formatStorageError as formatAudioStorageError,
  validateAudioFilename,
  validateFileHash as validateAudioFileHash,
} from '../../audio/infrastructure/audio-files.ts';
import {
  captureArtifactS3Key,
  presignCapturePostProcessArtifacts,
  type CaptureArtifactName,
  type CapturePostProcessArtifactKind,
} from '../../document/infrastructure/audio-capture-files.ts';
import { getStorageReadUrl } from '../../document/infrastructure/document-files.ts';
import {
  createDocumentCapture,
  createDocumentCaptureSegment,
  deleteDocumentCapture,
  detachCaptureSegment,
  getCaptureChannelMeta,
  getCaptureWithSegments,
  listDocumentCaptures,
  reorderCaptureSegments,
  updateDocumentCapture,
} from '../../document/application/document-captures.ts';
import { startDocumentCapturePostProcess } from '../../document/application/document-capture-pipeline-runner.ts';
import { startDocumentCaptureSegmentPipeline } from '../../document/application/document-capture-segment-pipeline.ts';
import { presignCaptureSegmentPreview } from '../../document/application/capture/capture-segment-preview.ts';
import {
  AUDIO_CAPTURE_AUDIENCES,
  AUDIO_CAPTURE_RECORDING_MODES,
  DOCUMENT_CAPTURE_INPUT_MODES,
} from '../../infrastructure/db/schema.ts';
import {
  completeDocumentCaptureAudioSegmentDirectUpload,
  completeDocumentCaptureSegmentDirectUpload,
  completeDocumentCaptureTranscriptSegmentDirectUpload,
  completeDocumentCaptureTranscriptSegmentUpload,
  initDocumentCaptureAudioSegmentUpload,
  initDocumentCaptureSegmentUpload,
  initDocumentCaptureTranscriptSegmentUpload,
} from '../../document/application/document-capture-upload.ts';
import { StorageNotConfiguredError } from '../../infrastructure/oss/s3-client.ts';

const documentCaptures = new Hono();

documentCaptures.use('*', requireAuth);

function storageUnavailable(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json({ error: 'Object storage is not configured' }, 503);
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

documentCaptures.get(
  '/',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const channelId = c.req.query('channel_id');
    if (!channelId) return c.json({ error: 'channel_id is required' }, 400);

    const denied = await denyUnlessChannelAccess(c, channelId, 'read');
    if (denied) return denied;

    const result = await listDocumentCaptures({
      channelId,
      search: c.req.query('search') ?? undefined,
      limit: Number(c.req.query('limit') ?? 50),
      offset: Number(c.req.query('offset') ?? 0),
    });
    return c.json(result);
  },
);

documentCaptures.post(
  '/',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
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

    const denied = await denyUnlessChannelAccess(c, body.channel_id, 'write');
    if (denied) return denied;

    if (body.recording_mode && !AUDIO_CAPTURE_RECORDING_MODES.includes(body.recording_mode as never)) {
      return c.json({ error: 'Invalid recording_mode' }, 400);
    }
    if (body.audience && !AUDIO_CAPTURE_AUDIENCES.includes(body.audience as never)) {
      return c.json({ error: 'Invalid audience' }, 400);
    }
    if (body.input_mode && !DOCUMENT_CAPTURE_INPUT_MODES.includes(body.input_mode as never)) {
      return c.json({ error: 'Invalid input_mode' }, 400);
    }

    const user = getUser(c);
    const capture = await createDocumentCapture({
      channelId: body.channel_id,
      title: body.title,
      brief: body.brief,
      participantsHint: body.participants_hint,
      recordingMode: (body.recording_mode as never) ?? null,
      audience: (body.audience as never) ?? 'unknown',
      inputMode: (body.input_mode as never) ?? 'document',
      createdBy: user.id,
    });

    return c.json(capture, 201);
  },
);

documentCaptures.post(
  '/batch',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const body = await c.req.json<{
      channel_id: string;
      input_mode?: string;
      items: Array<{ title?: string; brief?: string }>;
    }>();

    if (!body.channel_id || !Array.isArray(body.items) || body.items.length === 0) {
      return c.json({ error: 'channel_id and non-empty items array are required' }, 400);
    }

    const denied = await denyUnlessChannelAccess(c, body.channel_id, 'write');
    if (denied) return denied;

    if (body.input_mode && !DOCUMENT_CAPTURE_INPUT_MODES.includes(body.input_mode as never)) {
      return c.json({ error: 'Invalid input_mode' }, 400);
    }

    const user = getUser(c);
    const captures = [];
    for (const item of body.items) {
      const title = item.title?.trim() || 'Untitled capture';
      captures.push(
        await createDocumentCapture({
          channelId: body.channel_id,
          title,
          brief: item.brief,
          inputMode: (body.input_mode as never) ?? 'document',
          createdBy: user.id,
        }),
      );
    }

    return c.json({ items: captures }, 201);
  },
);

documentCaptures.post(
  '/bulk-document-upload',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const body = await c.req.json<{
      channel_id: string;
      files: Array<{
        filename: string;
        file_hash: string;
        size_bytes: number;
        s3_key: string;
        title?: string;
      }>;
    }>();

    if (!body.channel_id || !Array.isArray(body.files) || body.files.length === 0) {
      return c.json({ error: 'channel_id and non-empty files array are required' }, 400);
    }

    const denied = await denyUnlessChannelAccess(c, body.channel_id, 'write');
    if (denied) return denied;
    if (!isStorageEnabled()) return storageUnavailable(c);

    const user = getUser(c);
    const captures = [];

    try {
      for (const file of body.files) {
        const filename = validateDocumentFilename(file.filename);
        const fileHash = validateFileHash(file.file_hash);
        const ext = extensionFromFilename(filename);
        const expectedKey = buildDocumentS3Key(fileHash, ext);
        if (file.s3_key !== expectedKey) {
          return c.json({ error: `s3_key mismatch for ${filename}` }, 400);
        }

        const title = file.title?.trim() || filename;
        const capture = await createDocumentCapture({
          channelId: body.channel_id,
          title,
          inputMode: 'document',
          createdBy: user.id,
        });

        await createDocumentCaptureSegment({
          channelId: body.channel_id,
          captureId: capture.id,
          name: filename,
          fileType: fileTypeFromExtension(ext),
          sizeBytes: file.size_bytes,
          fileHash,
          s3Key: expectedKey,
          uploadedBy: user.id,
        });

        const refreshed = await getCaptureWithSegments(capture.id);
        captures.push(refreshed);
      }

      return c.json({ items: captures }, 201);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: formatStorageError(error) }, 400);
    }
  },
);

documentCaptures.get(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const sync = c.req.query('sync') !== 'false';
    const capture = await getCaptureWithSegments(id, { sync });
    if (!capture) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, capture.channel_id, 'read');
    if (denied) return denied;

    return c.json(capture);
  },
);

documentCaptures.patch(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const existing = await getCaptureWithSegments(id);
    if (!existing) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, existing.channel_id, 'write');
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

    await updateDocumentCapture(id, {
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

documentCaptures.delete(
  '/:id',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const existing = await getCaptureWithSegments(id);
    if (!existing) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, existing.channel_id, 'write');
    if (denied) return denied;

    await deleteDocumentCapture(id);
    return c.json({ ok: true });
  },
);

documentCaptures.post(
  '/:id/segments/upload-init',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const capture = await getCaptureWithSegments(id, { sync: false });
    if (!capture) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;
    if (!isStorageEnabled()) return storageUnavailable(c);

    const body = await c.req.json<{
      filename?: string;
      file_hash?: string;
      size_bytes?: number;
      content_type?: string;
    }>();

    try {
      const inputMode = capture.input_mode ?? 'document';
      if (inputMode === 'transcript') {
        return c.json({ error: 'Use transcript-upload-init for transcript captures' }, 400);
      }
      if (inputMode === 'audio') {
        const result = await initDocumentCaptureAudioSegmentUpload({
          filename: body.filename ?? '',
          fileHash: body.file_hash ?? '',
          sizeBytes: Number(body.size_bytes),
          contentType: body.content_type,
        });
        return c.json(result);
      }

      const result = await initDocumentCaptureSegmentUpload({
        filename: body.filename ?? '',
        fileHash: body.file_hash ?? '',
        sizeBytes: Number(body.size_bytes),
        contentType: body.content_type,
      });
      return c.json(result);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      const message =
        error instanceof Error ? error.message : formatStorageError(error);
      return c.json({ error: message }, 400);
    }
  },
);

documentCaptures.post(
  '/:id/segments/transcript-upload-init',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const capture = await getCaptureWithSegments(id, { sync: false });
    if (!capture) return c.json({ error: 'Capture not found' }, 404);
    if (capture.input_mode !== 'transcript') {
      return c.json({ error: 'Capture is not in transcript input mode' }, 400);
    }

    const denied = await denyUnlessChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;
    if (!isStorageEnabled()) return storageUnavailable(c);

    const body = await c.req.json<{
      filename?: string;
      size_bytes?: number;
      file_hash?: string;
      transcript_markdown?: string;
    }>();

    try {
      const result = await initDocumentCaptureTranscriptSegmentUpload({
        captureId: id,
        filename: body.filename ?? '',
        sizeBytes: Number(body.size_bytes),
        transcriptMarkdown: body.transcript_markdown,
      });
      return c.json(result);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: formatStorageError(error) }, 400);
    }
  },
);

documentCaptures.post(
  '/:id/segments',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const capture = await getCaptureWithSegments(id);
    if (!capture) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;
    if (!isStorageEnabled()) return storageUnavailable(c);

    const user = getUser(c);
    const body = await c.req.json<{
      filename: string;
      file_hash?: string;
      s3_key?: string;
      size_bytes?: number;
      segment_label?: string;
      upload_id?: string;
      staging_s3_key?: string;
      transcript_markdown?: string;
      mode?: string;
      transcript_s3_key?: string;
    }>();

    try {
      const inputMode = capture.input_mode ?? 'document';

      if (inputMode === 'transcript') {
        if (body.mode === 'direct' && body.transcript_s3_key && body.file_hash && body.filename) {
          const sizeBytes = Number(body.size_bytes);
          if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
            return c.json({ error: 'size_bytes is required' }, 400);
          }

          await completeDocumentCaptureTranscriptSegmentDirectUpload({
            channelId: capture.channel_id,
            captureId: id,
            filename: body.filename,
            fileHash: body.file_hash,
            transcriptS3Key: body.transcript_s3_key,
            sizeBytes,
            uploadedBy: user.id,
            segmentLabel: body.segment_label,
          });
          const refreshed = await getCaptureWithSegments(id, { sync: false });
          return c.json({ capture: refreshed }, 201);
        }

        if (!body.upload_id || !body.staging_s3_key || !body.filename) {
          return c.json({ error: 'upload_id, staging_s3_key, and filename are required' }, 400);
        }
        const sizeBytes = Number(body.size_bytes);
        if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
          return c.json({ error: 'size_bytes is required' }, 400);
        }

        await completeDocumentCaptureTranscriptSegmentUpload({
          channelId: capture.channel_id,
          captureId: id,
          uploadId: body.upload_id,
          filename: body.filename,
          stagingS3Key: body.staging_s3_key,
          sizeBytes,
          uploadedBy: user.id,
          segmentLabel: body.segment_label,
          transcriptMarkdown: body.transcript_markdown,
        });
        const refreshed = await getCaptureWithSegments(id, { sync: false });
        return c.json({ capture: refreshed }, 201);
      }

      if (inputMode === 'audio') {
        const filename = validateAudioFilename(body.filename);
        const fileHash = validateAudioFileHash(body.file_hash ?? '');
        const ext = audioExtensionFromFilename(filename);
        const expectedKey = buildAudioS3Key(fileHash, ext);
        if (body.s3_key !== expectedKey) {
          return c.json({ error: 's3_key does not match file_hash and filename' }, 400);
        }

        await completeDocumentCaptureAudioSegmentDirectUpload({
          channelId: capture.channel_id,
          captureId: id,
          filename,
          fileHash,
          s3Key: expectedKey,
          sizeBytes: Number(body.size_bytes),
          uploadedBy: user.id,
          segmentLabel: body.segment_label,
        });
        const refreshed = await getCaptureWithSegments(id);
        return c.json({ capture: refreshed }, 201);
      }

      const filename = validateDocumentFilename(body.filename);
      const fileHash = validateFileHash(body.file_hash ?? '');
      const ext = extensionFromFilename(filename);
      const expectedKey = buildDocumentS3Key(fileHash, ext);
      if (body.s3_key !== expectedKey) {
        return c.json({ error: 's3_key does not match file_hash and filename' }, 400);
      }

      await completeDocumentCaptureSegmentDirectUpload({
        channelId: capture.channel_id,
        captureId: id,
        filename,
        fileHash,
        s3Key: expectedKey,
        sizeBytes: Number(body.size_bytes),
        uploadedBy: user.id,
        segmentLabel: body.segment_label,
      });
      const refreshed = await getCaptureWithSegments(id);
      return c.json({ capture: refreshed }, 201);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      const message =
        error instanceof Error
          ? error.message
          : inputModeUsesAudio(capture.input_mode)
            ? formatAudioStorageError(error)
            : formatStorageError(error);
      return c.json({ error: message }, 400);
    }
  },
);

function inputModeUsesAudio(inputMode: string | undefined): boolean {
  return inputMode === 'audio';
}

documentCaptures.patch(
  '/:id/segments/order',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const capture = await getCaptureWithSegments(id);
    if (!capture) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;

    const body = await c.req.json<{ ordered_segment_ids?: string[]; ordered_audio_ids?: string[] }>();
    const ordered = body.ordered_segment_ids ?? body.ordered_audio_ids;
    if (!Array.isArray(ordered)) {
      return c.json({ error: 'ordered_segment_ids must be an array' }, 400);
    }

    try {
      await reorderCaptureSegments(id, ordered);
      const refreshed = await getCaptureWithSegments(id);
      return c.json(refreshed);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Reorder failed' }, 400);
    }
  },
);

documentCaptures.get(
  '/:id/segments/:segmentId/preview',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    const segmentId = routeParam(c, 'segmentId');
    if (!id || !segmentId) return c.json({ error: 'Capture id and segment id are required' }, 400);

    const meta = await getCaptureChannelMeta(id);
    if (!meta) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, meta.channel_id, 'read');
    if (denied) return denied;

    if (!isStorageEnabled()) return storageUnavailable(c);

    try {
      const preview = await presignCaptureSegmentPreview(id, segmentId);
      if (!preview) return c.json({ error: 'Segment not found' }, 404);
      return c.json(preview);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: formatStorageError(error) }, 400);
    }
  },
);

documentCaptures.delete(
  '/:id/segments/:segmentId',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    const segmentId = routeParam(c, 'segmentId');
    if (!id || !segmentId) return c.json({ error: 'Capture id and segment id are required' }, 400);

    const capture = await getCaptureWithSegments(id);
    if (!capture) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;

    try {
      await detachCaptureSegment(id, segmentId);
      const refreshed = await getCaptureWithSegments(id);
      return c.json(refreshed);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Detach failed' }, 400);
    }
  },
);

documentCaptures.post(
  '/:id/segments/:segmentId/run-pipeline',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    const segmentId = routeParam(c, 'segmentId');
    if (!id || !segmentId) return c.json({ error: 'Capture id and segment id are required' }, 400);

    const capture = await getCaptureWithSegments(id);
    if (!capture) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;

    const segment = capture.segments.find((row) => row.id === segmentId);
    if (!segment) return c.json({ error: 'Segment not found' }, 404);

    try {
      const result = await startDocumentCaptureSegmentPipeline(id, segmentId);
      const refreshed = await getCaptureWithSegments(id);
      return c.json({ ...result, capture: refreshed });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Failed to start segment pipeline' }, 400);
    }
  },
);

documentCaptures.post(
  '/:id/run-pipeline',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const capture = await getCaptureWithSegments(id);
    if (!capture) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, capture.channel_id, 'write');
    if (denied) return denied;

    try {
      const result = await startDocumentCapturePostProcess(id);
      const refreshed = await getCaptureWithSegments(id);
      return c.json({ ...result, capture: refreshed });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Failed to start pipeline' }, 400);
    }
  },
);

documentCaptures.get(
  '/:id/post-process-artifacts',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const meta = await getCaptureChannelMeta(id);
    if (!meta) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, meta.channel_id, 'read');
    if (denied) return denied;

    if (!isStorageEnabled()) return storageUnavailable(c);

    try {
      const files = await presignCapturePostProcessArtifacts(id);
      return c.json({ files });
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: formatStorageError(error) }, 400);
    }
  },
);

documentCaptures.post(
  '/:id/post-process-artifacts-presign',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Capture id is required' }, 400);

    const meta = await getCaptureChannelMeta(id);
    if (!meta) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, meta.channel_id, 'read');
    if (denied) return denied;

    if (!isStorageEnabled()) return storageUnavailable(c);

    const body = await c.req.json<{ artifacts?: string[] }>().catch((): { artifacts?: string[] } => ({}));
    const requested = Array.isArray(body.artifacts) ? body.artifacts : [...POST_PROCESS_ARTIFACT_KINDS];
    if (requested.length === 0) {
      return c.json({ error: 'artifacts array is required' }, 400);
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

documentCaptures.get(
  '/:id/artifacts/:artifact',
  requireResourcePermission(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    const artifact = routeParam(c, 'artifact');
    if (!id || !artifact) return c.json({ error: 'Capture id and artifact are required' }, 400);
    if (!ARTIFACT_NAMES.has(artifact as CaptureArtifactName)) {
      return c.json({ error: 'Unknown artifact' }, 400);
    }

    const meta = await getCaptureChannelMeta(id);
    if (!meta) return c.json({ error: 'Capture not found' }, 404);

    const denied = await denyUnlessChannelAccess(c, meta.channel_id, 'read');
    if (denied) return denied;

    if (!isStorageEnabled()) return storageUnavailable(c);

    try {
      const url = await getStorageReadUrl(captureArtifactS3Key(id, artifact as CaptureArtifactName));
      return c.json({ artifact, url });
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) return storageUnavailable(c);
      return c.json({ error: formatStorageError(error) }, 400);
    }
  },
);

export default documentCaptures;
