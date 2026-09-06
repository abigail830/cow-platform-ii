import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { readApiErrorMessage } from './http.ts';
import { fetchPresignedStorageText } from './storage-fetch.ts';
import { sha256HexFromFile } from '../shared/file-hash.ts';
import {
  putFileToPresignedUrl,
  shouldUseDirectUpload,
} from './direct-upload.ts';
import { readTranscriptFileText } from './transcript-file-text.ts';
import { resolveEffectiveAudioStatus } from './capture-pipeline-utils.ts';

export type CapturePipelineJob = {
  id: string;
  stage: string;
  pipeline_name: string;
  error_message: string | null;
  updated_at: string;
};

export type DocumentCaptureSegment = {
  id: string;
  channel_id: string;
  capture_id: string | null;
  segment_index: number | null;
  segment_label: string | null;
  name: string;
  file_type: string;
  size_bytes: number;
  file_hash?: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  pipeline_job: {
    id: string;
    stage: string;
    pipeline_name: string;
    error_message: string | null;
    external_job_id: string | null;
    updated_at: string;
  } | null;
};

export type DocumentCaptureInputMode = 'document' | 'audio' | 'transcript';

export type DocumentCaptureRecord = {
  id: string;
  channel_id: string;
  title: string;
  brief: string | null;
  participants_hint: string | null;
  recording_mode: string | null;
  audience: string;
  input_mode: DocumentCaptureInputMode;
  status: string;
  metadata: Record<string, unknown>;
  segment_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  pipeline_job: CapturePipelineJob | null;
};

export type DocumentCaptureDetail = DocumentCaptureRecord & {
  segments: DocumentCaptureSegment[];
};

export const RECORDING_MODE_LABELS: Record<string, string> = {
  multi_party_discussion: 'Multi-party discussion',
  structured_interview: 'Structured interview',
  presentation_qa: 'Presentation + Q&A',
  site_field_capture: 'Site / field capture',
  solo_voice_note: 'Solo voice note',
  general: 'General',
};

export const AUDIENCE_LABELS: Record<string, string> = {
  external_client: 'External client',
  internal_team: 'Internal team',
  mixed: 'Mixed',
  unknown: 'Unknown',
};

export const DOCUMENT_CAPTURE_INPUT_MODE_LABELS: Record<DocumentCaptureInputMode, string> = {
  document: 'Document files',
  audio: 'Audio recording',
  transcript: 'Transcript',
};

export function isTranscriptCapture(
  capture: Pick<DocumentCaptureRecord, 'input_mode'>,
): boolean {
  return capture.input_mode === 'transcript';
}

export function isDocumentFileCapture(
  capture: Pick<DocumentCaptureRecord, 'input_mode'>,
): boolean {
  return capture.input_mode === 'document';
}

/** Artifact carrier document row used for parse results (library or migrated legacy doc). */
export function resolveCaptureArtifactDocumentId(
  capture: Pick<DocumentCaptureDetail, 'segments'>,
): string | null {
  for (const segment of capture.segments) {
    const meta = segment.metadata ?? {};
    if (typeof meta.library_document_id === 'string') return meta.library_document_id;
    if (typeof meta.legacy_document_id === 'string') return meta.legacy_document_id;
  }
  return null;
}

export function isTranscriptSegment(
  segment: Pick<DocumentCaptureSegment, 'metadata'>,
): boolean {
  return segment.metadata?.source_kind === 'transcript';
}

export function isCapturePipelineActive(
  capture: Pick<DocumentCaptureRecord, 'status' | 'pipeline_job'>,
  segments?: DocumentCaptureSegment[],
): boolean {
  const stage = capture.pipeline_job?.stage;
  const postProcessActive =
    stage !== 'failed' &&
    stage !== 'done' &&
    (capture.status === 'post_processing' ||
      stage === 'submitted' ||
      stage === 'structuring' ||
      stage === 'classifying' ||
      stage === 'extracting' ||
      stage === 'synthesizing');
  if (postProcessActive) return true;
  if (capture.status === 'transcribing' || capture.status === 'running') return true;
  if (!segments?.length) return false;
  return segments.some((segment) => {
    const jobStage = segment.pipeline_job?.stage;
    return (
      segment.status === 'running' ||
      jobStage === 'submitted' ||
      jobStage === 'transcribing' ||
      jobStage === 'parsed'
    );
  });
}

export function isCapturePostProcessFailed(
  capture: Pick<DocumentCaptureRecord, 'status' | 'pipeline_job'>,
): boolean {
  return capture.status === 'failed' || capture.pipeline_job?.stage === 'failed';
}

export function displayCapturePipelineError(message: string | null | undefined): string | null {
  const trimmed = message?.trim();
  return trimmed ? trimmed : null;
}

export function formatCaptureStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'running':
      return 'Running';
    case 'transcribing':
      return 'Transcribing';
    case 'ready':
      return 'Ready';
    case 'post_processing':
      return 'Post-processing';
    case 'done':
      return 'Done';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export function captureStatusBadgeClass(status: string): string {
  switch (status) {
    case 'running':
    case 'transcribing':
    case 'post_processing':
      return 'status-running';
    case 'ready':
    case 'done':
      return 'status-completed';
    case 'failed':
      return 'status-failed';
    default:
      return '';
  }
}

export function segmentNeedsProcessing(
  segment: Pick<DocumentCaptureSegment, 'status' | 'pipeline_job' | 'metadata'>,
  inputMode: DocumentCaptureInputMode,
): boolean {
  if (isTranscriptSegment(segment) || inputMode === 'transcript') return false;
  if (inputMode === 'document') {
    return segment.status !== 'completed' && segment.status !== 'running';
  }
  const status = resolveEffectiveAudioStatus({
    status: segment.status,
    pipeline_job: segment.pipeline_job,
  });
  return status !== 'completed' && status !== 'running';
}

export function captureCanRunPostProcess(
  capture: Pick<DocumentCaptureRecord, 'status'> & { segments: DocumentCaptureSegment[] },
): boolean {
  if (!capture.segments.length) return false;
  if (capture.status === 'post_processing' || capture.status === 'transcribing') return false;
  return capture.status === 'ready' || capture.status === 'done' || capture.status === 'failed';
}

export function captureAwaitingSegmentProcessing(
  capture: Pick<DocumentCaptureRecord, 'status' | 'input_mode'>,
  segments: DocumentCaptureSegment[],
): boolean {
  if (isTranscriptCapture(capture)) return false;
  if (segments.length === 0) return false;
  return segments.some((segment) => segmentNeedsProcessing(segment, capture.input_mode));
}

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    if (message === 'Failed to fetch') {
      throw new Error(
        'Request failed (network or timeout). Large transcript .docx uploads still run on the server after OSS upload and may exceed Vercel limits — try .md or a smaller file.',
      );
    }
    throw new Error(message);
  }
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  if (res.status === 204) return {};
  return res.json();
}

export async function listDocumentCaptures(input: {
  channelId: string;
  search?: string;
}): Promise<{ items: DocumentCaptureRecord[]; total: number }> {
  const params = new URLSearchParams({ channel_id: input.channelId });
  if (input.search?.trim()) params.set('search', input.search.trim());
  return authFetch(`/api/document-captures?${params}`) as Promise<{
    items: DocumentCaptureRecord[];
    total: number;
  }>;
}

export async function createDocumentCapture(input: {
  channelId: string;
  title: string;
  brief?: string;
  participantsHint?: string;
  recordingMode?: string;
  audience?: string;
  inputMode?: DocumentCaptureInputMode;
}): Promise<DocumentCaptureRecord> {
  return authFetch('/api/document-captures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_id: input.channelId,
      title: input.title,
      brief: input.brief,
      participants_hint: input.participantsHint,
      recording_mode: input.recordingMode,
      audience: input.audience,
      input_mode: input.inputMode ?? 'document',
    }),
  }) as Promise<DocumentCaptureRecord>;
}

export async function getDocumentCapture(
  id: string,
  options?: { sync?: boolean },
): Promise<DocumentCaptureDetail> {
  const query = options?.sync === false ? '?sync=false' : '';
  return authFetch(`/api/document-captures/${id}${query}`) as Promise<DocumentCaptureDetail>;
}

type CaptureSegmentUploadInitResponse = {
  s3_key: string;
  file_hash: string;
  upload_url?: string;
  method?: string;
  headers?: Record<string, string>;
  skip_upload?: boolean;
};

async function uploadCaptureSegmentDirect(
  captureId: string,
  file: File,
  segmentLabel?: string,
): Promise<DocumentCaptureDetail> {
  const fileHash = await sha256HexFromFile(file);
  const init = (await authFetch(`/api/document-captures/${captureId}/segments/upload-init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      file_hash: fileHash,
      size_bytes: file.size,
      content_type: file.type || undefined,
    }),
  })) as CaptureSegmentUploadInitResponse;

  if (!init.skip_upload) {
    const uploadUrl = init.upload_url;
    if (!uploadUrl) throw new Error('Server did not return an upload URL');
    await putFileToPresignedUrl(uploadUrl, file, init.headers ?? {}, init.method ?? 'PUT');
  }

  const data = await authFetch(`/api/document-captures/${captureId}/segments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      file_hash: init.file_hash ?? fileHash,
      s3_key: init.s3_key,
      size_bytes: file.size,
      segment_label: segmentLabel?.trim() || undefined,
    }),
  });
  return (data as { capture: DocumentCaptureDetail }).capture;
}

export async function uploadCaptureDocumentSegment(
  captureId: string,
  file: File,
  segmentLabel?: string,
): Promise<DocumentCaptureDetail> {
  if (shouldUseDirectUpload(file)) {
    return uploadCaptureSegmentDirect(captureId, file, segmentLabel);
  }

  const form = new FormData();
  form.append('file', file);
  if (segmentLabel?.trim()) form.append('segment_label', segmentLabel.trim());
  const data = await authFetch(`/api/document-captures/${captureId}/segments`, {
    method: 'POST',
    body: form,
  });
  return (data as { capture: DocumentCaptureDetail }).capture;
}

export async function uploadCaptureAudioSegment(
  captureId: string,
  file: File,
  segmentLabel?: string,
): Promise<DocumentCaptureDetail> {
  return uploadCaptureDocumentSegment(captureId, file, segmentLabel);
}

export async function uploadCaptureTranscriptSegment(
  captureId: string,
  file: File,
  segmentLabel?: string,
): Promise<DocumentCaptureDetail> {
  const transcriptMarkdown = await readTranscriptFileText(file);

  const init = (await authFetch(
    `/api/document-captures/${captureId}/segments/transcript-upload-init`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        size_bytes: file.size,
        transcript_markdown: transcriptMarkdown,
      }),
    },
  )) as {
    mode?: string;
    transcript_upload_url?: string;
    original_upload_url?: string;
    normalized_markdown?: string;
    file_hash?: string;
    transcript_s3_key?: string;
    transcript_headers?: Record<string, string>;
    original_headers?: Record<string, string>;
    headers?: Record<string, string>;
  };

  if (init.mode === 'direct') {
    const transcriptUrl = init.transcript_upload_url;
    const originalUrl = init.original_upload_url;
    const normalized = init.normalized_markdown;
    const fileHash = init.file_hash;
    const transcriptS3Key = init.transcript_s3_key;
    if (!transcriptUrl || !originalUrl || !normalized || !fileHash || !transcriptS3Key) {
      throw new Error('Server did not return direct transcript upload URLs');
    }
    const transcriptContentType =
      init.transcript_headers?.['Content-Type'] ??
      init.headers?.['Content-Type'] ??
      'text/markdown; charset=utf-8';
    const originalContentType =
      init.original_headers?.['Content-Type'] ??
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    await putFileToPresignedUrl(
      transcriptUrl,
      new Blob([normalized], { type: 'text/markdown' }),
      { 'Content-Type': transcriptContentType },
      'PUT',
    );
    await putFileToPresignedUrl(
      originalUrl,
      file,
      { 'Content-Type': originalContentType },
      'PUT',
    );

    const data = await authFetch(`/api/document-captures/${captureId}/segments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'direct',
        filename: file.name,
        file_hash: fileHash,
        transcript_s3_key: transcriptS3Key,
        size_bytes: file.size,
        segment_label: segmentLabel?.trim() || undefined,
      }),
    });
    return (data as { capture: DocumentCaptureDetail }).capture;
  }

  throw new Error('Server did not return direct transcript upload URLs');
}

function captureTitleFromFilename(filename: string): string {
  const trimmed = filename.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot > 0) return trimmed.slice(0, dot);
  return trimmed;
}

/** Upload N document files as N separate document captures (one file each). */
export async function bulkDocumentUpload(
  channelId: string,
  files: File[],
): Promise<DocumentCaptureRecord[]> {
  const captures: DocumentCaptureRecord[] = [];
  for (const file of files) {
    const capture = await createDocumentCapture({
      channelId,
      title: captureTitleFromFilename(file.name),
      inputMode: 'document',
    });
    const detail = await uploadCaptureDocumentSegment(capture.id, file);
    captures.push(detail);
  }
  return captures;
}

/** Upload N audio/transcript files as N separate captures (one file each). */
export async function bulkSegmentCaptureUpload(
  channelId: string,
  files: File[],
  input: {
    inputMode: 'audio' | 'transcript';
    brief?: string;
    participantsHint?: string;
    recordingMode?: string;
    audience?: string;
  },
): Promise<DocumentCaptureRecord[]> {
  const uploadSegment =
    input.inputMode === 'transcript' ? uploadCaptureTranscriptSegment : uploadCaptureAudioSegment;
  const captures: DocumentCaptureRecord[] = [];
  for (const file of files) {
    const capture = await createDocumentCapture({
      channelId,
      title: captureTitleFromFilename(file.name),
      brief: input.brief,
      participantsHint: input.participantsHint,
      recordingMode: input.recordingMode,
      audience: input.audience,
      inputMode: input.inputMode,
    });
    const detail = await uploadSegment(capture.id, file);
    captures.push(detail);
  }
  return captures;
}

export async function reorderCaptureSegments(
  captureId: string,
  orderedSegmentIds: string[],
): Promise<DocumentCaptureDetail> {
  return authFetch(`/api/document-captures/${captureId}/segments/order`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordered_segment_ids: orderedSegmentIds }),
  }) as Promise<DocumentCaptureDetail>;
}

export async function runCapturePipeline(captureId: string): Promise<DocumentCaptureDetail> {
  const data = await authFetch(`/api/document-captures/${captureId}/run-pipeline`, {
    method: 'POST',
  });
  return (data as { capture: DocumentCaptureDetail }).capture;
}

export async function runCaptureSegmentPipeline(
  captureId: string,
  segmentId: string,
): Promise<DocumentCaptureDetail> {
  const data = await authFetch(
    `/api/document-captures/${captureId}/segments/${segmentId}/run-pipeline`,
    { method: 'POST' },
  );
  return (data as { capture: DocumentCaptureDetail }).capture;
}

export type CapturePostProcessArtifactKind =
  | 'structured_transcript'
  | 'recording_context'
  | 'extraction'
  | 'summary';

export async function presignCapturePostProcessArtifacts(
  captureId: string,
  artifacts: CapturePostProcessArtifactKind[],
): Promise<Array<{ artifact: CapturePostProcessArtifactKind; url: string }>> {
  const data = await authFetch(
    `/api/document-captures/${captureId}/post-process-artifacts-presign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifacts }),
    },
  );
  return (data as { files: Array<{ artifact: CapturePostProcessArtifactKind; url: string }> }).files;
}

export async function fetchCapturePostProcessArtifactText(
  captureId: string,
  artifact: CapturePostProcessArtifactKind,
  signal?: AbortSignal,
): Promise<string | null> {
  const files = await presignCapturePostProcessArtifacts(captureId, [artifact]);
  const match = files.find((file) => file.artifact === artifact);
  if (!match?.url) return null;
  return fetchPresignedStorageText(match.url, signal);
}

export async function getCapturePostProcessArtifacts(captureId: string): Promise<{
  structured_transcript: unknown | null;
  recording_context: unknown | null;
  extraction: unknown | null;
  summary: string | null;
  missing: Array<'structured_transcript' | 'recording_context' | 'extraction' | 'summary'>;
}> {
  const kinds: CapturePostProcessArtifactKind[] = [
    'structured_transcript',
    'recording_context',
    'extraction',
    'summary',
  ];
  const files = await presignCapturePostProcessArtifacts(captureId, kinds);
  const byKind = new Map(files.map((file) => [file.artifact, file.url]));

  async function readText(kind: CapturePostProcessArtifactKind): Promise<string | null> {
    const url = byKind.get(kind);
    if (!url) return null;
    return fetchPresignedStorageText(url);
  }

  function parseJson(text: string | null): unknown | null {
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }

  const [structuredText, contextText, extractionText, summaryText] = await Promise.all([
    readText('structured_transcript'),
    readText('recording_context'),
    readText('extraction'),
    readText('summary'),
  ]);

  const structured_transcript = parseJson(structuredText);
  const recording_context = parseJson(contextText);
  const extraction = parseJson(extractionText);
  const summary = summaryText?.trim() ? summaryText : null;
  const missing: Array<'structured_transcript' | 'recording_context' | 'extraction' | 'summary'> =
    [];
  if (structured_transcript == null) missing.push('structured_transcript');
  if (recording_context == null) missing.push('recording_context');
  if (extraction == null) missing.push('extraction');
  if (summary == null) missing.push('summary');
  return { structured_transcript, recording_context, extraction, summary, missing };
}

export async function updateDocumentCapture(
  id: string,
  input: {
    title?: string;
    brief?: string | null;
    participantsHint?: string | null;
    recordingMode?: string | null;
    audience?: string;
  },
): Promise<DocumentCaptureDetail> {
  return authFetch(`/api/document-captures/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      brief: input.brief,
      participants_hint: input.participantsHint,
      recording_mode: input.recordingMode,
      audience: input.audience,
    }),
  }) as Promise<DocumentCaptureDetail>;
}

export async function deleteDocumentCapture(id: string): Promise<void> {
  await authFetch(`/api/document-captures/${id}`, { method: 'DELETE' });
}
