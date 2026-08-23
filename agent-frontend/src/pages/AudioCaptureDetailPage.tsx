import { useCallback, useEffect, useRef, useState, type ReactNode, type WheelEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  Loader2,
  Maximize2,
  Mic,
  Minimize2,
  Plus,
  Upload,
} from 'lucide-react';
import {
  captureAwaitingTranscription,
  captureCanRunPostProcess,
  captureStatusBadgeClass,
  CAPTURE_INPUT_MODE_LABELS,
  fetchCapturePostProcessArtifactText,
  formatCaptureStatusLabel,
  getAudioCapture,
  isCapturePipelineActive,
  isCapturePostProcessFailed,
  isTranscriptCapture,
  isTranscriptSegment,
  reorderCaptureSegments,
  runCapturePipeline,
  segmentNeedsTranscription,
  updateAudioCapture,
  uploadCaptureSegment,
  uploadCaptureTranscriptSegment,
  type AudioCaptureDetail,
  type CapturePostProcessArtifactKind,
} from '../api/audioCaptures.ts';
import { formatAudioBytes, isAudioPipelineActive, runAudioPipeline } from '../api/audios.ts';
import { downloadTextFile, withDownloadExtension } from '../shared/download-text.ts';
import { IconView } from '../components/AdminActionIcons.tsx';
import { AudioPipelineStatus } from '../components/AudioPipelineStatus.tsx';
import { AudioSegmentDrawer } from '../components/AudioSegmentDrawer.tsx';
import { CaptureDetailsPanel } from '../components/CaptureDetailsPanel.tsx';
import { CapturePipelineStatus } from '../components/CapturePipelineStatus.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { Markdown } from '../chat/Markdown.tsx';
import { useAudioOutletContext } from './AudioOutletContext.tsx';

function PanelLoading({ label }: { label: string }) {
  return (
    <p className="audio-detail-panel-loading" role="status" aria-live="polite">
      <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
      {label}
    </p>
  );
}

type ExtractionTopic = {
  topic_id?: string;
  title?: string;
  key_points?: string[];
  action_items?: string[];
  open_questions?: string[];
};

type ExtractionArtifact = {
  topics?: ExtractionTopic[];
};

type ContentFacetsByTopic = {
  topic_id?: string;
  content_facets?: string[];
};

type RecordingContextArtifact = {
  recording_mode?: string;
  audience?: string;
  classification?: {
    recording_mode?: string;
    audience?: string;
    confidence?: number;
    needs_review?: boolean;
    content_facets_by_topic?: ContentFacetsByTopic[];
  };
  metadata?: Record<string, unknown>;
};

type CaptureArtifactTab = 'summary' | 'structured_transcript' | 'extraction';
type StructuredTranscriptView = 'json' | 'table';
type ExtractionView = 'timeline' | 'json';

type StructuredTranscriptTurn = {
  turn_id?: unknown;
  timestamp?: unknown;
  speaker?: unknown;
  text?: unknown;
};

const CAPTURE_ARTIFACT_TABS: Array<{ id: CaptureArtifactTab; label: string }> = [
  { id: 'summary', label: 'Summary' },
  { id: 'structured_transcript', label: 'Structured transcript' },
  { id: 'extraction', label: 'Extraction' },
];

const ARTIFACT_POLL_MAX_AFTER_FINISH = 15;
const ARTIFACT_POLL_INTERVAL_MS = 3000;

function shouldDeferArtifactErrors(
  capture: Pick<AudioCaptureDetail, 'status' | 'pipeline_job'>,
  pollExhausted: boolean,
): boolean {
  if (pollExhausted) return false;
  if (capture.status === 'failed') return false;
  return capture.pipeline_job?.stage === 'done';
}

function formatArtifactLoadError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Failed to load artifacts';
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|timeout|timed out|socket hang up/i.test(message)) {
    return 'Object storage connection timed out. Check OSS/network settings and retry.';
  }
  return message;
}

function formatExtractionPreview(
  extraction: ExtractionArtifact,
  context?: RecordingContextArtifact | null,
): string {
  const lines: string[] = [];
  const classification = context?.classification;
  if (classification?.recording_mode) {
    lines.push(
      `Recording mode: ${classification.recording_mode} · Audience: ${classification.audience ?? 'unknown'}` +
        (classification.confidence != null ? ` · Confidence: ${Math.round(classification.confidence * 100)}%` : ''),
    );
    lines.push('');
  }

  for (const topic of extraction.topics ?? []) {
    lines.push(`## ${topic.title ?? 'Topic'}`);
    for (const point of topicFieldList(topic, ['key_points', 'key_points'])) {
      lines.push(`- ${point}`);
    }
    for (const item of topicFieldList(topic, ['action_items', 'action_items'])) {
      lines.push(`- [Action] ${item}`);
    }
    for (const question of topicFieldList(topic, ['open_questions', 'open_questions'])) {
      lines.push(`- [Question] ${question}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

const POST_PROCESS_ARTIFACT_STAGES = new Set([
  'structuring',
  'classifying',
  'extracting',
  'synthesizing',
  'done',
  'failed',
]);

function captureExpectsPostProcessArtifacts(
  capture: Pick<AudioCaptureDetail, 'status' | 'pipeline_job'>,
): boolean {
  const jobStage = capture.pipeline_job?.stage;
  if (capture.status === 'post_processing' || capture.status === 'done') return true;
  return jobStage != null && POST_PROCESS_ARTIFACT_STAGES.has(jobStage);
}

function handleArtifactPreviewWheel(event: WheelEvent<HTMLElement>) {
  const element = event.currentTarget;
  const canScroll = element.scrollHeight > element.clientHeight;
  if (!canScroll) return;

  const atTop = element.scrollTop <= 0;
  const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
  if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) {
    event.stopPropagation();
  }
}

function captureArtifactTabKind(tab: CaptureArtifactTab): CapturePostProcessArtifactKind {
  return tab;
}

function isArtifactTabLoaded(
  tab: CaptureArtifactTab,
  summaryMarkdown: string | null,
  structuredArtifact: unknown | null,
  extractionArtifact: ExtractionArtifact | null,
): boolean {
  switch (tab) {
    case 'structured_transcript':
      return structuredArtifact != null;
    case 'extraction':
      return extractionArtifact != null;
    case 'summary':
      return Boolean(summaryMarkdown);
    default:
      return false;
  }
}

function parseArtifactJson<T>(text: string | null): T | null {
  if (!text?.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function asDisplayString(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function topicFieldList(topic: ExtractionTopic, keys: string[]): string[] {
  const record = topic as Record<string, unknown>;
  for (const key of keys) {
    const list = asStringList(record[key]);
    if (list.length > 0) return list;
  }
  return [];
}

function formatFacetLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function structuredTopicTimestamps(artifact: unknown): Map<string, string> {
  const timestamps = new Map<string, string>();
  if (!artifact || typeof artifact !== 'object') return timestamps;

  const turns = structuredTranscriptTurns(artifact);
  const turnTime = new Map<string, string>();
  for (const turn of turns) {
    const turnId = asDisplayString(turn.turn_id);
    const timestamp = asDisplayString(turn.timestamp);
    if (turnId && timestamp) turnTime.set(turnId, timestamp);
  }

  const topics = (artifact as { topics?: unknown }).topics;
  if (!Array.isArray(topics)) return timestamps;

  for (const [index, topic] of topics.entries()) {
    if (!topic || typeof topic !== 'object') continue;
    const topicId = asDisplayString((topic as { topic_id?: unknown }).topic_id);
    const turnIds = asStringList(
      (topic as { turn_ids?: unknown }).turn_ids ?? (topic as { turn_ids?: unknown }).turn_ids,
    );
    const firstTurnId = turnIds.find((id) => turnTime.has(id));
    if (firstTurnId) {
      const time = turnTime.get(firstTurnId) ?? '';
      if (topicId) timestamps.set(topicId, time);
      timestamps.set(`#${index}`, time);
    }
  }
  return timestamps;
}

function facetsByTopicId(context: RecordingContextArtifact | null): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const rows = context?.classification?.content_facets_by_topic;
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    const topicId = asDisplayString(row.topic_id);
    const facets = asStringList(row.content_facets);
    if (topicId && facets.length > 0) map.set(topicId, facets);
  }
  return map;
}

function structuredTranscriptTurns(artifact: unknown): StructuredTranscriptTurn[] {
  if (Array.isArray(artifact)) {
    return artifact.filter(
      (row): row is StructuredTranscriptTurn => Boolean(row) && typeof row === 'object',
    );
  }
  if (artifact && typeof artifact === 'object') {
    const turns = (artifact as { turns?: unknown }).turns;
    if (Array.isArray(turns)) {
      return turns.filter(
        (row): row is StructuredTranscriptTurn => Boolean(row) && typeof row === 'object',
      );
    }
  }
  return [];
}

export function AudioCaptureDetailPage() {
  const { captureId } = useParams<{ captureId: string }>();
  const { setSelectedChannelId, canWrite } = useAudioOutletContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  const [capture, setCapture] = useState<AudioCaptureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [runningTranscription, setRunningTranscription] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [artifactTab, setArtifactTab] = useState<CaptureArtifactTab>('summary');
  const [structuredTranscriptView, setStructuredTranscriptView] =
    useState<StructuredTranscriptView>('table');
  const [extractionView, setExtractionView] = useState<ExtractionView>('timeline');
  const [showExtractionTagging, setShowExtractionTagging] = useState(false);
  const [artifactPreviewMaximized, setArtifactPreviewMaximized] = useState(false);
  const [summaryMarkdown, setSummaryMarkdown] = useState<string | null>(null);
  const [structuredArtifact, setStructuredArtifact] = useState<unknown | null>(null);
  const [contextArtifact, setContextArtifact] = useState<RecordingContextArtifact | null>(null);
  const [extractionArtifact, setExtractionArtifact] = useState<ExtractionArtifact | null>(null);
  const [loadingArtifactTabs, setLoadingArtifactTabs] = useState<Set<CaptureArtifactTab>>(
    () => new Set(),
  );
  const [artifactTabErrors, setArtifactTabErrors] = useState<Partial<Record<CaptureArtifactTab, string>>>(
    {},
  );
  const [artifactPollExhausted, setArtifactPollExhausted] = useState(false);
  const artifactPollAttemptsRef = useRef(0);
  const postProcessActiveRef = useRef(false);
  const prevPostProcessActiveRef = useRef(false);
  const prevPipelineJobIdRef = useRef<string | null>(null);
  const prevJobStageRef = useRef<string | null>(null);
  const postProcessJustFinishedRef = useRef(false);
  const [openSegmentId, setOpenSegmentId] = useState<string | null>(null);
  const [openSegmentLabel, setOpenSegmentLabel] = useState<string | null>(null);
  const [transcribingSegmentIds, setTranscribingSegmentIds] = useState<Set<string>>(new Set());

  const loadExtractionCompanions = useCallback(async () => {
    if (!captureId) return;
    const tasks: Promise<void>[] = [];
    if (structuredArtifact == null) {
      tasks.push(
        (async () => {
          try {
            const text = await fetchCapturePostProcessArtifactText(captureId, 'structured_transcript');
            const parsed = parseArtifactJson<unknown>(text);
            if (parsed != null) setStructuredArtifact(parsed);
          } catch {
            // Timestamps are optional for the extraction timeline.
          }
        })(),
      );
    }
    if (contextArtifact == null) {
      tasks.push(
        (async () => {
          try {
            const text = await fetchCapturePostProcessArtifactText(captureId, 'recording_context');
            const parsed = parseArtifactJson<RecordingContextArtifact>(text);
            if (parsed) {
              setContextArtifact(parsed);
              setNeedsReview(Boolean(parsed.classification?.needs_review));
            }
          } catch {
            // Tagging is optional.
          }
        })(),
      );
    }
    if (tasks.length > 0) await Promise.all(tasks);
  }, [captureId, contextArtifact, structuredArtifact]);

  const loadCapture = useCallback(
    async (options?: { silent?: boolean; sync?: boolean }) => {
      if (!captureId) return;
      if (!options?.silent) {
        setLoading(true);
        setError('');
      }
      try {
        const sync = options?.sync ?? true;
        const data = await getAudioCapture(captureId, { sync });
        if (!mountedRef.current) return;
        setCapture(data);
        setSelectedChannelId(data.channel_id);
      } catch (err) {
        if (!mountedRef.current) return;
        if (!options?.silent) {
          setError(err instanceof Error ? err.message : 'Failed to load capture');
          setCapture(null);
        }
      } finally {
        if (!options?.silent && mountedRef.current) setLoading(false);
      }
    },
    [captureId, setSelectedChannelId],
  );

  const setArtifactTabLoading = useCallback((tab: CaptureArtifactTab, loading: boolean) => {
    setLoadingArtifactTabs((current) => {
      const next = new Set(current);
      if (loading) next.add(tab);
      else next.delete(tab);
      return next;
    });
  }, []);

  const clearArtifactState = useCallback(() => {
    setStructuredArtifact(null);
    setContextArtifact(null);
    setExtractionArtifact(null);
    setSummaryMarkdown(null);
    setArtifactTabErrors({});
    setLoadingArtifactTabs(new Set());
    setNeedsReview(false);
    setArtifactPollExhausted(false);
    artifactPollAttemptsRef.current = 0;
  }, []);

  const loadArtifactTab = useCallback(
    async (
      tab: CaptureArtifactTab,
      options?: { silent?: boolean; force?: boolean; deferErrors?: boolean },
    ): Promise<boolean> => {
      if (!captureId) return false;
      if (postProcessActiveRef.current && !options?.force) return false;
      if (
        !options?.force &&
        isArtifactTabLoaded(
          tab,
          summaryMarkdown,
          structuredArtifact,
          extractionArtifact,
        )
      ) {
        if (tab === 'extraction') void loadExtractionCompanions();
        return true;
      }

      const artifact = captureArtifactTabKind(tab);
      const showLoading = !options?.silent || Boolean(options?.deferErrors);
      if (showLoading) setArtifactTabLoading(tab, true);

      const registerFailedAttempt = (err?: unknown) => {
        if (!options?.deferErrors) return;
        const nextAttempt = artifactPollAttemptsRef.current + 1;
        artifactPollAttemptsRef.current = nextAttempt;
        if (nextAttempt >= ARTIFACT_POLL_MAX_AFTER_FINISH) {
          setArtifactPollExhausted(true);
          const message = err
            ? formatArtifactLoadError(err)
            : 'Post-process artifacts not found in storage';
          setArtifactTabErrors((current) => ({ ...current, [tab]: message }));
        }
      };

      try {
        let loaded = false;

        if (artifact === 'summary') {
          const summaryText = await fetchCapturePostProcessArtifactText(captureId, 'summary');
          if (summaryText?.trim()) {
            setSummaryMarkdown(summaryText.trim());
            loaded = true;
          } else {
            let extraction = extractionArtifact;
            let context = contextArtifact;
            if (!extraction) {
              const extractionText = await fetchCapturePostProcessArtifactText(captureId, 'extraction');
              const parsed = parseArtifactJson<ExtractionArtifact>(extractionText);
              if (parsed) {
                extraction = parsed;
                setExtractionArtifact(parsed);
              }
            }
            if (!context) {
              const contextText = await fetchCapturePostProcessArtifactText(captureId, 'recording_context');
              const parsed = parseArtifactJson<RecordingContextArtifact>(contextText);
              if (parsed) {
                context = parsed;
                setContextArtifact(parsed);
                setNeedsReview(Boolean(parsed.classification?.needs_review));
              }
            }
            if (extraction) {
              setSummaryMarkdown(formatExtractionPreview(extraction, context));
              loaded = true;
            }
          }
        } else {
          const text = await fetchCapturePostProcessArtifactText(captureId, artifact);
          if (artifact === 'structured_transcript') {
            const parsed = parseArtifactJson<unknown>(text);
            if (parsed != null) {
              setStructuredArtifact(parsed);
              loaded = true;
            }
          } else if (artifact === 'recording_context') {
            const parsed = parseArtifactJson<RecordingContextArtifact>(text);
            if (parsed) {
              setContextArtifact(parsed);
              setNeedsReview(Boolean(parsed.classification?.needs_review));
              loaded = true;
            }
          } else if (artifact === 'extraction') {
            const parsed = parseArtifactJson<ExtractionArtifact>(text);
            if (parsed) {
              setExtractionArtifact(parsed);
              loaded = true;
              void loadExtractionCompanions();
            }
          }
        }

        if (loaded) {
          artifactPollAttemptsRef.current = 0;
          setArtifactTabErrors((current) => {
            const next = { ...current };
            delete next[tab];
            return next;
          });
        } else if (options?.deferErrors) {
          registerFailedAttempt();
        } else if (!loaded) {
          setArtifactTabErrors((current) => ({
            ...current,
            [tab]: 'Post-process artifact not found in storage',
          }));
        }

        return loaded;
      } catch (err) {
        if (options?.deferErrors) {
          registerFailedAttempt(err);
        } else {
          setArtifactTabErrors((current) => ({
            ...current,
            [tab]: formatArtifactLoadError(err),
          }));
        }
        return false;
      } finally {
        if (showLoading) setArtifactTabLoading(tab, false);
      }
    },
    [captureId, contextArtifact, extractionArtifact, loadExtractionCompanions, setArtifactTabLoading, structuredArtifact, summaryMarkdown],
  );

  const syncCaptureWhenCoreArtifactsReady = useCallback(
    (structured: unknown | null, context: RecordingContextArtifact | null, extraction: ExtractionArtifact | null) => {
      if (structured != null && context != null && extraction != null) {
        void loadCapture({ silent: true, sync: true });
      }
    },
    [loadCapture],
  );

  useEffect(() => {
    syncCaptureWhenCoreArtifactsReady(structuredArtifact, contextArtifact, extractionArtifact);
  }, [structuredArtifact, contextArtifact, extractionArtifact, syncCaptureWhenCoreArtifactsReady]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void loadCapture({ sync: false });
  }, [loadCapture]);

  useEffect(() => {
    if (!captureId) return;

    let cancelled = false;
    void getAudioCapture(captureId, { sync: true })
      .then((data) => {
        if (!cancelled) setCapture(data);
      })
      .catch(() => {
        // Keep the fast capture payload when background status sync fails.
      });

    return () => {
      cancelled = true;
    };
  }, [captureId]);

  useEffect(() => {
    artifactPollAttemptsRef.current = 0;
    setStructuredArtifact(null);
    setContextArtifact(null);
    setExtractionArtifact(null);
    setSummaryMarkdown(null);
    setArtifactTabErrors({});
    setLoadingArtifactTabs(new Set());
    setArtifactPollExhausted(false);
    setStructuredTranscriptView('table');
    setExtractionView('timeline');
    setShowExtractionTagging(false);
    setArtifactPreviewMaximized(false);
    prevPostProcessActiveRef.current = false;
    prevPipelineJobIdRef.current = null;
    prevJobStageRef.current = null;
    postProcessJustFinishedRef.current = false;
  }, [captureId]);

  useEffect(() => {
    if (!artifactPreviewMaximized) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArtifactPreviewMaximized(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [artifactPreviewMaximized]);

  useEffect(() => {
    if (!capture) {
      postProcessActiveRef.current = runningPipeline;
      return;
    }

    const active = isCapturePipelineActive(capture) || runningPipeline;
    postProcessActiveRef.current = active;

    const jobId = capture.pipeline_job?.id ?? null;
    const jobStage = capture.pipeline_job?.stage ?? null;
    const becameActive = active && !prevPostProcessActiveRef.current;
    const jobChanged = active && jobId != null && jobId !== prevPipelineJobIdRef.current;

    if (becameActive || jobChanged) {
      clearArtifactState();
      postProcessJustFinishedRef.current = false;
    }

    if (
      prevJobStageRef.current &&
      prevJobStageRef.current !== 'done' &&
      jobStage === 'done' &&
      !active
    ) {
      postProcessJustFinishedRef.current = true;
      artifactPollAttemptsRef.current = 0;
      setArtifactPollExhausted(false);
      void loadCapture({ silent: true, sync: true });
      void loadArtifactTab(artifactTab, { force: true, deferErrors: true });
    }
    if (active && jobStage !== 'done') {
      postProcessJustFinishedRef.current = false;
    }

    prevPostProcessActiveRef.current = active;
    prevPipelineJobIdRef.current = jobId;
    prevJobStageRef.current = jobStage;
  }, [artifactTab, capture, runningPipeline, clearArtifactState, loadCapture, loadArtifactTab]);

  useEffect(() => {
    if (!capture || !captureExpectsPostProcessArtifacts(capture)) return;
    if (isCapturePostProcessFailed(capture) || isCapturePipelineActive(capture) || runningPipeline) return;
    const deferErrors = shouldDeferArtifactErrors(capture, artifactPollExhausted);
    void loadArtifactTab(artifactTab, { silent: true, deferErrors });
  }, [
    artifactPollExhausted,
    artifactTab,
    capture?.status,
    capture?.pipeline_job?.stage,
    capture,
    loadArtifactTab,
    runningPipeline,
  ]);

  useEffect(() => {
    if (!capture) return;

    const jobStage = capture.pipeline_job?.stage;
    const postProcessActiveNow =
      isCapturePipelineActive(capture) || runningPipeline;
    const shouldPollArtifacts =
      !postProcessActiveNow &&
      jobStage === 'done' &&
      capture.status !== 'failed' &&
      !isArtifactTabLoaded(
        artifactTab,
        summaryMarkdown,
        structuredArtifact,
        extractionArtifact,
      ) &&
      !artifactPollExhausted &&
      artifactPollAttemptsRef.current < ARTIFACT_POLL_MAX_AFTER_FINISH;

    const segmentsStillTranscribing = capture.segments.some((segment) =>
      isAudioPipelineActive({ status: segment.status, pipeline_job: segment.pipeline_job }),
    );

    const shouldPollCapture =
      capture.segments.length > 0 &&
      (segmentsStillTranscribing ||
        capture.status === 'transcribing' ||
        capture.status === 'draft' ||
        capture.status === 'ready' ||
        postProcessActiveNow ||
        shouldPollArtifacts);

    if (!shouldPollCapture) return;

    const intervalId = window.setInterval(() => {
      void loadCapture({ silent: true });
      if (postProcessActiveRef.current || !shouldPollArtifacts) return;
      const deferErrors = artifactPollAttemptsRef.current + 1 < ARTIFACT_POLL_MAX_AFTER_FINISH;
      void loadArtifactTab(artifactTab, { silent: true, force: true, deferErrors });
    }, ARTIFACT_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [
    artifactPollExhausted,
    artifactTab,
    capture,
    contextArtifact,
    extractionArtifact,
    loadArtifactTab,
    loadCapture,
    runningPipeline,
    structuredArtifact,
    summaryMarkdown,
  ]);

  const canWriteCapture = canWrite && Boolean(capture);

  function openSegmentDrawer(segmentId: string, segmentLabel: string | null) {
    setOpenSegmentId(segmentId);
    setOpenSegmentLabel(segmentLabel);
  }

  function closeSegmentDrawer() {
    setOpenSegmentId(null);
    setOpenSegmentLabel(null);
    void loadCapture({ silent: true });
  }

  async function handleSaveDetails(input: {
    brief: string | null;
    participantsHint: string | null;
    recordingMode: string | null;
    audience: string;
  }) {
    if (!captureId) return;
    setError('');
    const updated = await updateAudioCapture(captureId, input);
    setCapture(updated);
  }

  async function handleTranscribeSegment(segmentId: string) {
    setTranscribingSegmentIds((current) => new Set(current).add(segmentId));
    setError('');
    try {
      await runAudioPipeline(segmentId);
      await loadCapture({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start transcription');
    } finally {
      setTranscribingSegmentIds((current) => {
        const next = new Set(current);
        next.delete(segmentId);
        return next;
      });
    }
  }

  async function handleTranscribeAll() {
    if (!capture?.segments.length) return;
    const targets = capture.segments.filter((segment) => !isTranscriptSegment(segment));
    if (!targets.length) return;

    setRunningTranscription(true);
    setError('');
    try {
      await Promise.all(targets.map((segment) => runAudioPipeline(segment.id)));
      await loadCapture({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start transcription');
    } finally {
      setRunningTranscription(false);
    }
  }

  async function handleRunPipeline() {
    if (!captureId) return;
    clearArtifactState();
    setRunningPipeline(true);
    setError('');
    try {
      const updated = await runCapturePipeline(captureId);
      setCapture(updated);
      await loadCapture({ silent: true });
      if (updated.status === 'done' && !isCapturePipelineActive(updated)) {
        await loadArtifactTab(artifactTab, { force: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start post-process');
    } finally {
      setRunningPipeline(false);
    }
  }

  async function handleUploadSegment(file: File) {
    if (!captureId || !capture) return;
    setUploading(true);
    setError('');
    try {
      const upload =
        isTranscriptCapture(capture) ? uploadCaptureTranscriptSegment : uploadCaptureSegment;
      const updated = await upload(captureId, file);
      setCapture(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload segment');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function moveSegment(index: number, direction: -1 | 1) {
    if (!capture?.segments) return;
    const target = index + direction;
    if (target < 0 || target >= capture.segments.length) return;

    const ordered = [...capture.segments];
    const [item] = ordered.splice(index, 1);
    ordered.splice(target, 0, item!);

    setReordering(true);
    setError('');
    try {
      const updated = await reorderCaptureSegments(
        capture.id,
        ordered.map((seg) => seg.id),
      );
      setCapture(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder segments');
    } finally {
      setReordering(false);
    }
  }

  if (loading && !capture) {
    return (
      <div className="document-detail-page audio-detail-page">
        <div className="document-detail-toolbar">
          <Link to="/knowledge/audio" className="document-detail-back">
            <ArrowLeft {...iconProps({ size: 16 })} aria-hidden />
            Back to captures
          </Link>
        </div>
        <div className="audio-detail-initial-loading-body">
          <p className="document-detail-loading" role="status" aria-live="polite">
            <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
            Loading capture…
          </p>
        </div>
      </div>
    );
  }

  if (!capture) {
    return (
      <div className="document-detail-page audio-detail-page">
        <Link to="/knowledge/audio" className="document-detail-back">
          <ArrowLeft {...iconProps({ size: 16 })} aria-hidden />
          Back to captures
        </Link>
        <p className="error">{error || 'Capture not found'}</p>
      </div>
    );
  }

  const badgeClass = captureStatusBadgeClass(capture.status);
  const transcriptCapture = isTranscriptCapture(capture);
  const segmentAcceptTypes = transcriptCapture
    ? '.md,.markdown,.docx'
    : '.m4a,.mp3,.wav,.flac,.aac,.amr,.ogg,.opus,.webm';
  const segmentsNeedingTranscription = capture.segments.filter((segment) =>
    segmentNeedsTranscription(segment),
  );
  const awaitingTranscription = captureAwaitingTranscription(capture, capture.segments);
  const canRunPostProcess = captureCanRunPostProcess(capture);
  const postProcessFailed = isCapturePostProcessFailed(capture);
  const hasArtifactContent =
    structuredArtifact != null ||
    contextArtifact != null ||
    extractionArtifact != null ||
    Boolean(summaryMarkdown);
  const postProcessJobDone = capture.pipeline_job?.stage === 'done';
  const postProcessSucceeded = postProcessJobDone && capture.status === 'done';
  const postProcessDoneWithoutArtifacts =
    postProcessJobDone && !postProcessSucceeded && !postProcessFailed;
  const showArtifactData = hasArtifactContent && !postProcessFailed;
  const postProcessActive = isCapturePipelineActive(capture) || runningPipeline;
  const activeTabLoading = loadingArtifactTabs.has(artifactTab);
  const activeTabError = artifactTabErrors[artifactTab];
  const activeTabLoaded = isArtifactTabLoaded(
    artifactTab,
    summaryMarkdown,
    structuredArtifact,
    extractionArtifact,
  );
  const canBrowseArtifactTabs =
    captureExpectsPostProcessArtifacts(capture) && !postProcessActive && !postProcessFailed;
  const awaitingArtifacts =
    (captureExpectsPostProcessArtifacts(capture) || postProcessDoneWithoutArtifacts) &&
    !hasArtifactContent &&
    !postProcessFailed &&
    !postProcessActive &&
    artifactPollExhausted;
  const showPipelineStepper =
    postProcessActive ||
    postProcessFailed ||
    (postProcessDoneWithoutArtifacts && artifactPollExhausted);

  function artifactTabAvailable(_tab: CaptureArtifactTab): boolean {
    return canBrowseArtifactTabs;
  }

  function renderActiveArtifactTabContent(currentCapture: AudioCaptureDetail): ReactNode {
    if (activeTabLoading) {
      return (
        <PanelLoading
          label={
            postProcessJobDone
              ? 'Loading post-process artifact…'
              : 'Waiting for post-process results from storage…'
          }
        />
      );
    }

    if (activeTabError && !activeTabLoaded) {
      return (
        <div className="document-detail-panel-empty">
          <p className="error inline">{activeTabError}</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void loadArtifactTab(artifactTab, { force: true })}
          >
            Retry loading artifact
          </button>
        </div>
      );
    }

    if (activeTabLoaded) {
      if (artifactTab === 'summary') {
        return (
          <div
            className="document-markdown-panel capture-artifact-preview capture-artifact-preview-scroll"
            onWheel={handleArtifactPreviewWheel}
          >
            <Markdown content={summaryMarkdown ?? ''} />
          </div>
        );
      }

      if (artifactTab === 'structured_transcript' && structuredTranscriptView === 'table') {
        const turns = structuredTranscriptTurns(structuredArtifact);
        return (
          <div
            className="admin-table-wrap capture-artifact-preview capture-artifact-preview-scroll capture-structured-transcript-table-wrap"
            onWheel={handleArtifactPreviewWheel}
          >
            <table className="admin-table capture-structured-transcript-table">
              <thead>
                <tr>
                  <th>turn_id</th>
                  <th>timestamp</th>
                  <th>speaker</th>
                  <th>text</th>
                </tr>
              </thead>
              <tbody>
                {turns.length === 0 ? (
                  <tr>
                    <td className="admin-table-empty" colSpan={4}>
                      No turns in this transcript.
                    </td>
                  </tr>
                ) : (
                  turns.map((turn, index) => (
                    <tr key={asDisplayString(turn.turn_id) || String(index)}>
                      <td className="documents-table-meta">{asDisplayString(turn.turn_id)}</td>
                      <td className="documents-table-meta">{asDisplayString(turn.timestamp)}</td>
                      <td>{asDisplayString(turn.speaker)}</td>
                      <td className="capture-structured-transcript-text">{asDisplayString(turn.text)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );
      }

      if (artifactTab === 'extraction' && extractionView === 'timeline') {
        const topics = extractionArtifact?.topics ?? [];
        const timestamps = structuredTopicTimestamps(structuredArtifact);
        const facets = showExtractionTagging ? facetsByTopicId(contextArtifact) : new Map<string, string[]>();
        const recordingMode = showExtractionTagging
          ? contextArtifact?.classification?.recording_mode ?? contextArtifact?.recording_mode
          : undefined;
        const audience = showExtractionTagging
          ? contextArtifact?.classification?.audience ?? contextArtifact?.audience
          : undefined;

        return (
          <div
            className="capture-extraction-timeline capture-artifact-preview capture-artifact-preview-scroll"
            onWheel={handleArtifactPreviewWheel}
          >
            {showExtractionTagging && (recordingMode || audience) ? (
              <p className="capture-extraction-session-meta">
                {recordingMode ? formatFacetLabel(recordingMode) : null}
                {recordingMode && audience ? ' · ' : null}
                {audience ? formatFacetLabel(audience) : null}
                {contextArtifact?.classification?.needs_review ? ' · needs review' : null}
              </p>
            ) : null}
            {topics.length === 0 ? (
              <p className="document-detail-panel-empty">No topics in this extraction.</p>
            ) : (
              topics.map((topic, index) => {
                const topicId = asDisplayString(topic.topic_id) || `topic_${String(index + 1).padStart(2, '0')}`;
                const keyPoints = topicFieldList(topic, ['key_points', 'key_points']);
                const actionItems = topicFieldList(topic, ['action_items', 'action_items']);
                const openQuestions = topicFieldList(topic, ['open_questions', 'open_questions']);
                const topicFacets = facets.get(topicId) ?? [];
                const timestamp = timestamps.get(topicId) || timestamps.get(`#${index}`);
                return (
                  <article key={topicId} className="capture-extraction-topic">
                    <time className="capture-extraction-topic-time">{timestamp || '—'}</time>
                    <div className="capture-extraction-topic-body">
                      <h4 className="capture-extraction-topic-title">{topic.title || `Topic ${index + 1}`}</h4>
                      {showExtractionTagging && topicFacets.length > 0 ? (
                        <div className="capture-extraction-facets">
                          {topicFacets.map((facet) => (
                            <span key={facet} className="capture-extraction-facet">
                              {formatFacetLabel(facet)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {keyPoints.length > 0 ? (
                        <>
                          <p className="capture-extraction-section-label">Key points</p>
                          <ul className="capture-extraction-list">
                            {keyPoints.map((point) => (
                              <li key={point}>{point}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {actionItems.length > 0 ? (
                        <>
                          <p className="capture-extraction-section-label">Action items</p>
                          <ul className="capture-extraction-list">
                            {actionItems.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {openQuestions.length > 0 ? (
                        <>
                          <p className="capture-extraction-section-label">Open questions</p>
                          <ul className="capture-extraction-list">
                            {openQuestions.map((question) => (
                              <li key={question}>{question}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        );
      }

      return (
        <pre
          className="document-json-preview capture-extraction-preview capture-artifact-preview capture-artifact-preview-scroll"
          onWheel={handleArtifactPreviewWheel}
        >
          {JSON.stringify(
            artifactTab === 'structured_transcript'
              ? structuredArtifact
              : showExtractionTagging && contextArtifact
                ? { extraction: extractionArtifact, recording_context: contextArtifact }
                : extractionArtifact,
            null,
            2,
          )}
        </pre>
      );
    }

    if (
      currentCapture.status === 'post_processing' ||
      currentCapture.pipeline_job?.stage === 'extracting' ||
      currentCapture.pipeline_job?.stage === 'classifying' ||
      currentCapture.pipeline_job?.stage === 'synthesizing'
    ) {
      return <p className="document-detail-panel-empty">Waiting for this step to finish…</p>;
    }

    if (awaitingArtifacts) {
      return (
        <p className="document-detail-panel-empty">
          {postProcessDoneWithoutArtifacts
            ? 'Post-process finished but artifact files were not found in storage. Run post-process again to regenerate them.'
            : 'Post-process results are not available in storage. Use Run post-process to regenerate them.'}
        </p>
      );
    }

    if (postProcessJobDone && !artifactPollExhausted) {
      return <PanelLoading label="Waiting for post-process results from storage…" />;
    }

    return <p className="document-detail-panel-empty">No artifact for this tab yet.</p>;
  }

  const showArtifactWorkspace =
    captureExpectsPostProcessArtifacts(capture) ||
    runningPipeline ||
    showArtifactData ||
    postProcessFailed ||
    postProcessDoneWithoutArtifacts ||
    canBrowseArtifactTabs;

  return (
    <div className="document-detail-page audio-detail-page">
      <div className="document-detail-toolbar">
        <Link to="/knowledge/audio" className="document-detail-back">
          <ArrowLeft {...iconProps({ size: 16 })} aria-hidden />
          Back to captures
        </Link>

        <div className="document-detail-title-row">
          <h2 className="document-detail-title">{capture.title}</h2>
          <span className={`document-status-badge ${badgeClass}`.trim()}>
            {formatCaptureStatusLabel(capture.status)}
          </span>
          <span className="document-status-badge capture-input-mode-badge">
            {CAPTURE_INPUT_MODE_LABELS[capture.input_mode ?? 'audio']}
          </span>
        </div>
      </div>

      {error && <p className="error inline">{error}</p>}

      <div className="audio-detail-layout">
        <CaptureDetailsPanel
          capture={capture}
          canEdit={canWriteCapture}
          onSave={handleSaveDetails}
        />

        {awaitingTranscription ? (
          <p className="capture-detail-hint" role="status">
            {segmentsNeedingTranscription.length} segment
            {segmentsNeedingTranscription.length === 1 ? '' : 's'} still need transcription. Use{' '}
            <strong>Transcribe all</strong> below, or open a segment to run transcription.
          </p>
        ) : null}

        {needsReview ? (
          <p className="pipeline-status-label pipeline-status-label--failed">
            Classification needs review
          </p>
        ) : null}

        <section className="audio-detail-panel" aria-label="Segments">
          <div className="document-detail-content-header">
            <h3 className="document-detail-panel-heading">Segments</h3>
            {canWriteCapture ? (
              <div className="document-detail-toolbar-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={segmentAcceptTypes}
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleUploadSegment(file);
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                  ) : (
                    <Plus {...iconProps()} aria-hidden />
                  )}
                  Add segment
                </button>
                {!transcriptCapture ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={uploading || runningTranscription || capture.segments.length === 0}
                    onClick={() => void handleTranscribeAll()}
                  >
                    {runningTranscription ? (
                      <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                    ) : (
                      <Mic {...iconProps()} aria-hidden />
                    )}
                    Transcribe all
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {capture.segments.length === 0 ? (
            <p className="document-detail-panel-empty">
              {transcriptCapture
                ? 'No segments yet. Add transcript files (.md or .docx) to continue.'
                : 'No segments yet. Add audio files to start transcription.'}
            </p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Size</th>
                    <th className="documents-status-col">{transcriptCapture ? 'Source' : 'ASR'}</th>
                    <th className="admin-table-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {capture.segments.map((segment, index) => (
                    <tr key={segment.id}>
                      <td>{segment.segment_index ?? index}</td>
                      <td>
                        <button
                          type="button"
                          className="document-name-link document-name-link--table"
                          onClick={() =>
                            openSegmentDrawer(segment.id, segment.segment_label || segment.name)
                          }
                        >
                          {segment.segment_label || segment.name}
                        </button>
                      </td>
                      <td className="documents-table-meta">{formatAudioBytes(segment.size_bytes)}</td>
                      <td className="documents-status-col">
                        {transcriptCapture || isTranscriptSegment(segment) ? (
                          <span className="document-status-badge">Imported</span>
                        ) : (
                          <AudioPipelineStatus
                            audio={{
                              id: segment.id,
                              channel_id: segment.channel_id,
                              name: segment.name,
                              file_type: segment.file_type,
                              size_bytes: segment.size_bytes,
                              file_hash: '',
                              s3_key: '',
                              status: segment.status,
                              duration_sec: null,
                              metadata: segment.metadata ?? {},
                              uploaded_by: null,
                              created_at: segment.created_at,
                              updated_at: segment.updated_at,
                              pipeline_job: segment.pipeline_job,
                            }}
                          />
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            title="View transcript"
                            aria-label={`View ${segment.name}`}
                            onClick={() =>
                              openSegmentDrawer(segment.id, segment.segment_label || segment.name)
                            }
                          >
                            <IconView />
                          </button>
                          {canWriteCapture && !transcriptCapture ? (
                            <>
                              <button
                                type="button"
                                className="icon-btn"
                                title="Transcribe segment"
                                aria-label={`Transcribe ${segment.name}`}
                                disabled={transcribingSegmentIds.has(segment.id)}
                                onClick={() => void handleTranscribeSegment(segment.id)}
                              >
                                {transcribingSegmentIds.has(segment.id) ? (
                                  <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                                ) : (
                                  <Mic {...iconProps()} />
                                )}
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                title="Move up"
                                disabled={reordering || index === 0}
                                onClick={() => void moveSegment(index, -1)}
                              >
                                <ArrowUp {...iconProps()} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                title="Move down"
                                disabled={reordering || index === capture.segments.length - 1}
                                onClick={() => void moveSegment(index, 1)}
                              >
                                <ArrowDown {...iconProps()} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {artifactPreviewMaximized ? (
          <div
            className="capture-artifact-maximize-backdrop"
            onClick={() => setArtifactPreviewMaximized(false)}
          />
        ) : null}
        <section
          className={`audio-detail-panel audio-detail-transcript${artifactPreviewMaximized ? ' is-maximized' : ''}`}
          aria-label="Extraction preview"
          aria-modal={artifactPreviewMaximized || undefined}
          role={artifactPreviewMaximized ? 'dialog' : undefined}
        >
          <div className="document-detail-content-header capture-extraction-header">
            <div className="capture-extraction-header-top">
              <h3 className="document-detail-panel-heading">Extraction preview</h3>
              {canWriteCapture && !artifactPreviewMaximized ? (
                <div className="document-detail-toolbar-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={postProcessActive || !canRunPostProcess}
                    title={
                      !canRunPostProcess && awaitingTranscription
                        ? 'Transcribe all segments first'
                        : awaitingArtifacts
                          ? 'Re-run post-process to regenerate artifacts'
                          : undefined
                    }
                    onClick={() => void handleRunPipeline()}
                  >
                    {postProcessActive ? (
                      <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                    ) : (
                      <Upload {...iconProps()} aria-hidden />
                    )}
                    Run post-process
                  </button>
                </div>
              ) : null}
            </div>
            {showPipelineStepper ? (
              <div className="capture-extraction-pipeline-bar" aria-label="Post-process progress">
                <CapturePipelineStatus capture={capture} errorLayout="inline" />
              </div>
            ) : null}
          </div>
          {showArtifactWorkspace ? (
            <>
              {!postProcessActive && !postProcessFailed ? (
                <div className="capture-artifact-tabs-row">
                  <div className="capture-artifact-tabs" role="tablist" aria-label="Post-process artifacts">
                    {CAPTURE_ARTIFACT_TABS.map((tab) => {
                      const available = artifactTabAvailable(tab.id);
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={artifactTab === tab.id}
                          aria-disabled={!available}
                          className={`capture-artifact-tab${artifactTab === tab.id ? ' active' : ''}${
                            !available ? ' is-disabled' : ''
                          }`}
                          disabled={!available}
                          onClick={() => setArtifactTab(tab.id)}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="capture-artifact-tabs-actions">
                  {artifactTab === 'structured_transcript' && structuredArtifact != null ? (
                    <div className="capture-structured-transcript-views" role="group" aria-label="Transcript view">
                      <button
                        type="button"
                        className={`capture-structured-transcript-view${structuredTranscriptView === 'table' ? ' active' : ''}`}
                        aria-pressed={structuredTranscriptView === 'table'}
                        onClick={() => setStructuredTranscriptView('table')}
                      >
                        Table
                      </button>
                      <button
                        type="button"
                        className={`capture-structured-transcript-view${structuredTranscriptView === 'json' ? ' active' : ''}`}
                        aria-pressed={structuredTranscriptView === 'json'}
                        onClick={() => setStructuredTranscriptView('json')}
                      >
                        Raw
                      </button>
                    </div>
                  ) : null}
                  {artifactTab === 'extraction' && extractionArtifact != null ? (
                    <div className="capture-extraction-toolbar">
                      <div className="capture-structured-transcript-views" role="group" aria-label="Extraction view">
                        <button
                          type="button"
                          className={`capture-structured-transcript-view${extractionView === 'timeline' ? ' active' : ''}`}
                          aria-pressed={extractionView === 'timeline'}
                          onClick={() => setExtractionView('timeline')}
                        >
                          Timeline
                        </button>
                        <button
                          type="button"
                          className={`capture-structured-transcript-view${extractionView === 'json' ? ' active' : ''}`}
                          aria-pressed={extractionView === 'json'}
                          onClick={() => setExtractionView('json')}
                        >
                          Raw
                        </button>
                      </div>
                      <label className="form-checkbox capture-extraction-tagging-toggle">
                        <input
                          type="checkbox"
                          checked={showExtractionTagging}
                          onChange={(event) => setShowExtractionTagging(event.target.checked)}
                        />
                        Show tagging
                      </label>
                    </div>
                  ) : null}
                  {artifactTab === 'summary' && summaryMarkdown?.trim() ? (
                    <div className="document-detail-toolbar-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        title="Download summary as Markdown"
                        onClick={() =>
                          downloadTextFile(
                            summaryMarkdown,
                            withDownloadExtension(`${capture.title}-summary`, 'md'),
                            'text/markdown;charset=utf-8',
                          )
                        }
                      >
                        <Download {...iconProps()} aria-hidden />
                        .md
                      </button>
                    </div>
                  ) : null}
                  {activeTabLoaded ? (
                    <button
                      type="button"
                      className="icon-btn"
                      title={artifactPreviewMaximized ? 'Exit full view' : 'Maximize'}
                      aria-label={artifactPreviewMaximized ? 'Exit full view' : 'Maximize preview'}
                      onClick={() => setArtifactPreviewMaximized((current) => !current)}
                    >
                      {artifactPreviewMaximized ? (
                        <Minimize2 {...iconProps()} />
                      ) : (
                        <Maximize2 {...iconProps()} />
                      )}
                    </button>
                  ) : null}
                  </div>
                </div>
              ) : null}
              {postProcessActive ? (
                <PanelLoading label="Post-processing in progress…" />
              ) : postProcessFailed ? null : (
                renderActiveArtifactTabContent(capture)
              )}
            </>
          ) : capture.status !== 'ready' && capture.status !== 'done' ? (
            <p className="document-detail-panel-empty">Available after post-process starts.</p>
          ) : (
            <p className="document-detail-panel-empty">Run post-process to generate artifacts.</p>
          )}
        </section>
      </div>

      <AudioSegmentDrawer
        open={openSegmentId != null}
        audioId={openSegmentId}
        segmentLabel={openSegmentLabel}
        transcriptOnly={transcriptCapture}
        onClose={closeSegmentDrawer}
      />
    </div>
  );
}
