import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { readApiErrorMessage } from './http.ts';
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

export function isCapturePipelineActive(
  capture: Pick<AudioCaptureRecord, 'status' | 'pipeline_job'>,
  segments?: CaptureSegment[],
): boolean {
  if (capture.status === 'transcribing' || capture.status === 'post_processing') return true;
  const stage = capture.pipeline_job?.stage;
  if (
    stage === 'submitted' ||
    stage === 'structuring' ||
    stage === 'classifying' ||
    stage === 'extracting'
  ) {
    return true;
  }
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
  segment: Pick<CaptureSegment, 'status' | 'pipeline_job'>,
): boolean {
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
  return capture.status === 'ready' || capture.status === 'done';
}

export function captureAwaitingTranscription(
  _capture: Pick<AudioCaptureRecord, 'status'>,
  segments: CaptureSegment[],
): boolean {
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
    throw new Error(message === 'Failed to fetch' ? 'Network error — is the backend running?' : message);
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
    }),
  }) as Promise<AudioCaptureRecord>;
}

export async function getAudioCapture(id: string): Promise<AudioCaptureDetail> {
  return authFetch(`/api/audio-captures/${id}`) as Promise<AudioCaptureDetail>;
}

export async function uploadCaptureSegment(captureId: string, file: File, segmentLabel?: string): Promise<AudioCaptureDetail> {
  const form = new FormData();
  form.append('file', file);
  if (segmentLabel?.trim()) form.append('segment_label', segmentLabel.trim());
  const data = await authFetch(`/api/audio-captures/${captureId}/segments`, {
    method: 'POST',
    body: form,
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
