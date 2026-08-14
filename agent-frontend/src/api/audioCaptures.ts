import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { readApiErrorMessage } from './http.ts';
import { fetchPresignedStorageText } from './storage-fetch.ts';
import { sha256HexFromFile } from '../shared/file-hash.ts';
import {
  putFileToPresignedUrl,
  shouldUseDirectUpload,
} from './direct-upload.ts';
import { resolveEffectiveAudioStatus } from './audios.ts';

export type CapturePipelineJob = {
  id: string;
  stage: string;
  pipeline_name: string;
  error_message: string | null;
  updated_at: string;
};

export type CaptureSegment = {
  id: string;
  channel_id: string;
  capture_id: string | null;
  segment_index: number | null;
  segment_label: string | null;
  name: string;
  file_type: string;
  size_bytes: number;
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

export type AudioCaptureRecord = {
  id: string;
  channel_id: string;
  title: string;
  brief: string | null;
  participants_hint: string | null;
  recording_mode: string | null;
  audience: string;
  input_mode: 'audio' | 'transcript';
  status: string;
  metadata: Record<string, unknown>;
  segment_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  pipeline_job: CapturePipelineJob | null;
};

export type AudioCaptureDetail = AudioCaptureRecord & {
  segments: CaptureSegment[];
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

export const CAPTURE_INPUT_MODE_LABELS: Record<'audio' | 'transcript', string> = {
  audio: 'Audio',
  transcript: 'Transcript',
};

export function isTranscriptCapture(
  capture: Pick<AudioCaptureRecord, 'input_mode'>,
): boolean {
  return capture.input_mode === 'transcript';
}

export function isTranscriptSegment(
  segment: Pick<CaptureSegment, 'metadata'>,
): boolean {
  return segment.metadata?.source_kind === 'transcript';
}

export function isCapturePipelineActive(
  capture: Pick<AudioCaptureRecord, 'status' | 'pipeline_job'>,
  segments?: CaptureSegment[],
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
  if (capture.status === 'transcribing') return true;
  if (!segments?.length) return false;
  return segments.some((segment) => {
    const jobStage = segment.pipeline_job?.stage;
    return (
      segment.status === 'running' ||
      jobStage === 'submitted' ||
      jobStage === 'transcribing'
    );
  });
}

export function isCapturePostProcessFailed(
  capture: Pick<AudioCaptureRecord, 'status' | 'pipeline_job'>,
): boolean {
  return capture.status === 'failed' || capture.pipeline_job?.stage === 'failed';
}

export const GENERIC_CAPTURE_GHA_FAILURE_MESSAGE =
  'GitHub Actions worker failed before capture post-process completed';

export function displayCapturePipelineError(message: string | null | undefined): string | null {
  const trimmed = message?.trim();
  return trimmed ? trimmed : null;
}

export function formatCaptureStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
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

export function segmentNeedsTranscription(
  segment: Pick<CaptureSegment, 'status' | 'pipeline_job' | 'metadata'>,
): boolean {
  if (isTranscriptSegment(segment)) return false;
  const status = resolveEffectiveAudioStatus({
    status: segment.status,
    pipeline_job: segment.pipeline_job,
  });
  return status !== 'completed' && status !== 'running';
}

export function captureCanRunPostProcess(
  capture: Pick<AudioCaptureRecord, 'status'> & { segments: CaptureSegment[] },
): boolean {
  if (!capture.segments.length) return false;
  if (capture.status === 'post_processing' || capture.status === 'transcribing') return false;
  return capture.status === 'ready' || capture.status === 'done' || capture.status === 'failed';
}

export function captureAwaitingTranscription(
  capture: Pick<AudioCaptureRecord, 'status' | 'input_mode'>,
  segments: CaptureSegment[],
): boolean {
  if (isTranscriptCapture(capture)) return false;
  if (segments.length === 0) return false;
  return segments.some((segment) => segmentNeedsTranscription(segment));
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

export async function listAudioCaptures(input: {
  channelId: string;
  search?: string;
}): Promise<{ items: AudioCaptureRecord[]; total: number }> {
  const params = new URLSearchParams({ channel_id: input.channelId });
  if (input.search?.trim()) params.set('search', input.search.trim());
  return authFetch(`/api/audio-captures?${params}`) as Promise<{ items: AudioCaptureRecord[]; total: number }>;
}

export async function createAudioCapture(input: {
  channelId: string;
  title: string;
  brief?: string;
  participantsHint?: string;
  recordingMode?: string;
  audience?: string;
  inputMode?: 'audio' | 'transcript';
}): Promise<AudioCaptureRecord> {
  return authFetch('/api/audio-captures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_id: input.channelId,
      title: input.title,
      brief: input.brief,
      participants_hint: input.participantsHint,
      recording_mode: input.recordingMode,
      audience: input.audience,
      input_mode: input.inputMode ?? 'audio',
    }),
  }) as Promise<AudioCaptureRecord>;
}

export async function getAudioCapture(
  id: string,
  options?: { sync?: boolean },
): Promise<AudioCaptureDetail> {
  const query = options?.sync === false ? '?sync=false' : '';
  return authFetch(`/api/audio-captures/${id}${query}`) as Promise<AudioCaptureDetail>;
}

function shouldUseDirectCaptureSegmentUpload(file: File): boolean {
  return shouldUseDirectUpload(file);
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
): Promise<AudioCaptureDetail> {
  const fileHash = await sha256HexFromFile(file);
  const init = (await authFetch(`/api/audio-captures/${captureId}/segments/upload-init`, {
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

  const data = await authFetch(`/api/audio-captures/${captureId}/segments`, {
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
  return (data as { capture: AudioCaptureDetail }).capture;
}

export async function uploadCaptureSegment(
  captureId: string,
  file: File,
  segmentLabel?: string,
): Promise<AudioCaptureDetail> {
  if (shouldUseDirectCaptureSegmentUpload(file)) {
    return uploadCaptureSegmentDirect(captureId, file, segmentLabel);
  }

  const form = new FormData();
  form.append('file', file);
  if (segmentLabel?.trim()) form.append('segment_label', segmentLabel.trim());
  const data = await authFetch(`/api/audio-captures/${captureId}/segments`, {
    method: 'POST',
    body: form,
  });
  return (data as { capture: AudioCaptureDetail }).capture;
}

export async function uploadCaptureTranscriptSegment(
  captureId: string,
  file: File,
  segmentLabel?: string,
): Promise<AudioCaptureDetail> {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : '';
  const isMarkdown = ext === 'md' || ext === 'markdown';
  let transcriptMarkdown: string | undefined;
  if (isMarkdown) {
    transcriptMarkdown = await file.text();
  }

  const init = (await authFetch(`/api/audio-captures/${captureId}/segments/transcript-upload-init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      size_bytes: file.size,
    }),
  })) as {
    upload_id: string;
    staging_s3_key: string;
    upload_url?: string;
    skip_upload?: boolean;
    headers?: Record<string, string>;
  };

  if (!init.skip_upload) {
    const uploadUrl = init.upload_url;
    if (!uploadUrl) throw new Error('Server did not return an upload URL');
    await putFileToPresignedUrl(uploadUrl, file, init.headers ?? {}, 'PUT');
  }

  const data = await authFetch(`/api/audio-captures/${captureId}/segments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      upload_id: init.upload_id,
      staging_s3_key: init.staging_s3_key,
      size_bytes: file.size,
      segment_label: segmentLabel?.trim() || undefined,
      ...(transcriptMarkdown !== undefined ? { transcript_markdown: transcriptMarkdown } : {}),
    }),
  });
  return (data as { capture: AudioCaptureDetail }).capture;
}

export async function reorderCaptureSegments(
  captureId: string,
  orderedAudioIds: string[],
): Promise<AudioCaptureDetail> {
  return authFetch(`/api/audio-captures/${captureId}/segments/order`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordered_audio_ids: orderedAudioIds }),
  }) as Promise<AudioCaptureDetail>;
}

export async function runCapturePipeline(captureId: string): Promise<AudioCaptureDetail> {
  const data = await authFetch(`/api/audio-captures/${captureId}/run-pipeline`, { method: 'POST' });
  return (data as { capture: AudioCaptureDetail }).capture;
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
  const data = await authFetch(`/api/audio-captures/${captureId}/post-process-artifacts-presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifacts }),
  });
  return (data as { files: Array<{ artifact: CapturePostProcessArtifactKind; url: string }> }).files;
}

/** Presign via API (local signing), then read object text directly from OSS in the browser. */
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

/** @deprecated Prefer presign + browser fetch to avoid Vercel→OSS proxy reads. */
export async function getCapturePostProcessArtifacts(captureId: string): Promise<{
  structured_transcript: unknown | null;
  recording_context: unknown | null;
  extraction: unknown | null;
  summary: string | null;
  missing: Array<'structured_transcript' | 'recording_context' | 'extraction' | 'summary'>;
}> {
  return authFetch(`/api/audio-captures/${captureId}/post-process-artifacts`) as Promise<{
    structured_transcript: unknown | null;
    recording_context: unknown | null;
    extraction: unknown | null;
    summary: string | null;
    missing: Array<'structured_transcript' | 'recording_context' | 'extraction' | 'summary'>;
  }>;
}

export async function getCaptureArtifact<T = unknown>(
  captureId: string,
  artifact: 'structured_transcript' | 'recording_context' | 'extraction',
): Promise<T> {
  const data = await authFetch(`/api/audio-captures/${captureId}/artifacts/${artifact}`);
  return (data as { data: T }).data;
}

export async function updateAudioCapture(
  id: string,
  input: {
    title?: string;
    brief?: string | null;
    participantsHint?: string | null;
    recordingMode?: string | null;
    audience?: string;
  },
): Promise<AudioCaptureDetail> {
  return authFetch(`/api/audio-captures/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      brief: input.brief,
      participants_hint: input.participantsHint,
      recording_mode: input.recordingMode,
      audience: input.audience,
    }),
  }) as Promise<AudioCaptureDetail>;
}

export async function deleteAudioCapture(id: string): Promise<void> {
  await authFetch(`/api/audio-captures/${id}`, { method: 'DELETE' });
}
