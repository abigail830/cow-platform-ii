import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Loader2,
  Mic,
  Plus,
  Upload,
} from 'lucide-react';
import {
  captureAwaitingTranscription,
  captureCanRunPostProcess,
  captureStatusBadgeClass,
  formatCaptureStatusLabel,
  getAudioCapture,
  getCapturePostProcessArtifacts,
  isCapturePipelineActive,
  isCapturePostProcessFailed,
  reorderCaptureSegments,
  runCapturePipeline,
  segmentNeedsTranscription,
  updateAudioCapture,
  uploadCaptureSegment,
  type AudioCaptureDetail,
} from '../api/audioCaptures.ts';
import { formatAudioBytes, isAudioPipelineActive, resolveEffectiveAudioStatus, runAudioPipeline } from '../api/audios.ts';
import { IconView } from '../components/AdminActionIcons.tsx';
import { AudioPipelineStatus } from '../components/AudioPipelineStatus.tsx';
import { AudioSegmentDrawer } from '../components/AudioSegmentDrawer.tsx';
import { CaptureDetailsPanel } from '../components/CaptureDetailsPanel.tsx';
import { CapturePipelineStatus } from '../components/CapturePipelineStatus.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
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
  title?: string;
  key_points?: string[];
  action_items?: string[];
  open_questions?: string[];
};

type ExtractionArtifact = {
  topics?: ExtractionTopic[];
};

type RecordingContextArtifact = {
  classification?: {
    recording_mode?: string;
    audience?: string;
    confidence?: number;
    needs_review?: boolean;
  };
  metadata?: Record<string, unknown>;
};

type CaptureArtifactTab = 'summary' | 'structured_transcript' | 'recording_context' | 'extraction';

const CAPTURE_ARTIFACT_TABS: Array<{ id: CaptureArtifactTab; label: string }> = [
  { id: 'summary', label: 'Summary' },
  { id: 'structured_transcript', label: 'Structured transcript' },
  { id: 'recording_context', label: 'Recording context' },
  { id: 'extraction', label: 'Extraction JSON' },
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
    for (const point of topic.key_points ?? []) {
      if (point.trim()) lines.push(`- ${point.trim()}`);
    }
    for (const item of topic.action_items ?? []) {
      if (item.trim()) lines.push(`- [Action] ${item.trim()}`);
    }
    for (const question of topic.open_questions ?? []) {
      if (question.trim()) lines.push(`- [Question] ${question.trim()}`);
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

function handleArtifactPreviewWheel(event: React.WheelEvent<HTMLPreElement>) {
  const element = event.currentTarget;
  const canScroll = element.scrollHeight > element.clientHeight;
  if (!canScroll) return;

  const atTop = element.scrollTop <= 0;
  const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
  if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) {
    event.stopPropagation();
  }
}

export function AudioCaptureDetailPage() {
  const { captureId } = useParams<{ captureId: string }>();
  const { setSelectedChannelId, canWrite } = useAudioOutletContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [capture, setCapture] = useState<AudioCaptureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [runningTranscription, setRunningTranscription] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [artifactTab, setArtifactTab] = useState<CaptureArtifactTab>('summary');
  const [summaryMarkdown, setSummaryMarkdown] = useState<string | null>(null);
  const [structuredArtifact, setStructuredArtifact] = useState<unknown | null>(null);
  const [contextArtifact, setContextArtifact] = useState<RecordingContextArtifact | null>(null);
  const [extractionArtifact, setExtractionArtifact] = useState<ExtractionArtifact | null>(null);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [artifactLoadError, setArtifactLoadError] = useState('');
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

  const loadCapture = useCallback(
    async (options?: { silent?: boolean; sync?: boolean }) => {
      if (!captureId) return;
      if (!options?.silent) {
        setLoading(true);
        setError('');
      }
      try {
        const sync = options?.sync ?? !options?.silent;
        const data = await getAudioCapture(captureId, { sync });
        setCapture(data);
        setSelectedChannelId(data.channel_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load capture');
        setCapture(null);
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [captureId, setSelectedChannelId],
  );

  const clearArtifactState = useCallback(() => {
    setStructuredArtifact(null);
    setContextArtifact(null);
    setExtractionArtifact(null);
    setSummaryMarkdown(null);
    setArtifactLoadError('');
    setNeedsReview(false);
    setArtifactPollExhausted(false);
    artifactPollAttemptsRef.current = 0;
  }, []);

  const applyArtifactBundle = useCallback(
    (
      bundle: Awaited<ReturnType<typeof getCapturePostProcessArtifacts>>,
      options?: { deferErrors?: boolean },
    ) => {
      const structured = bundle.structured_transcript;
      const context = bundle.recording_context as RecordingContextArtifact | null;
      const extraction = bundle.extraction as ExtractionArtifact | null;

      if (structured) setStructuredArtifact(structured);
      if (context) {
        setContextArtifact(context);
        setNeedsReview(Boolean(context.classification?.needs_review));
      }
      if (extraction) {
        setExtractionArtifact(extraction);
      }

      if (bundle.summary?.trim()) {
        setSummaryMarkdown(bundle.summary);
      } else if (extraction) {
        setSummaryMarkdown(formatExtractionPreview(extraction, context));
      } else {
        setSummaryMarkdown(null);
      }

      const loadedCount = [structured, context, extraction].filter(Boolean).length;
      if (loadedCount === 0) {
        if (!options?.deferErrors) {
          setArtifactLoadError('Post-process artifacts not found in storage');
        }
      } else if (bundle.missing.length > 0 && !options?.deferErrors) {
        setArtifactLoadError(`Missing artifacts: ${bundle.missing.join(', ')}`);
      } else {
        setArtifactLoadError('');
      }

      return loadedCount;
    },
    [],
  );

  const loadArtifacts = useCallback(
    async (options?: { silent?: boolean; force?: boolean; deferErrors?: boolean }) => {
      if (!captureId) return 0;
      if (postProcessActiveRef.current && !options?.force) return 0;
      const showLoading = !options?.silent || Boolean(options?.deferErrors);
      if (showLoading) setLoadingArtifacts(true);

      const registerFailedAttempt = (err?: unknown) => {
        if (!options?.deferErrors) return;
        const nextAttempt = artifactPollAttemptsRef.current + 1;
        artifactPollAttemptsRef.current = nextAttempt;
        if (nextAttempt >= ARTIFACT_POLL_MAX_AFTER_FINISH) {
          setArtifactPollExhausted(true);
          if (err) {
            setArtifactLoadError(formatArtifactLoadError(err));
          } else {
            setArtifactLoadError('Post-process artifacts not found in storage');
          }
        }
      };

      try {
        const bundle = await getCapturePostProcessArtifacts(captureId);
        const loadedCount = applyArtifactBundle(bundle, { deferErrors: options?.deferErrors });
        if (loadedCount > 0) {
          artifactPollAttemptsRef.current = 0;
        } else if (options?.deferErrors) {
          registerFailedAttempt();
        }
        if (loadedCount === 3) {
          void loadCapture({ silent: true, sync: true });
        }
        return loadedCount;
      } catch (err) {
        if (options?.deferErrors) {
          registerFailedAttempt(err);
        } else {
          setArtifactLoadError(formatArtifactLoadError(err));
        }
        return 0;
      } finally {
        if (showLoading) setLoadingArtifacts(false);
      }
    },
    [applyArtifactBundle, captureId, loadCapture],
  );

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
    setArtifactLoadError('');
    setArtifactPollExhausted(false);
    prevPostProcessActiveRef.current = false;
    prevPipelineJobIdRef.current = null;
    prevJobStageRef.current = null;
    postProcessJustFinishedRef.current = false;
  }, [captureId]);

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
      void loadArtifacts({ force: true, deferErrors: true });
    }
    if (active && jobStage !== 'done') {
      postProcessJustFinishedRef.current = false;
    }

    prevPostProcessActiveRef.current = active;
    prevPipelineJobIdRef.current = jobId;
    prevJobStageRef.current = jobStage;
  }, [capture, runningPipeline, clearArtifactState, loadCapture, loadArtifacts]);

  const allArtifactsLoaded =
    structuredArtifact != null && contextArtifact != null && extractionArtifact != null;

  useEffect(() => {
    if (!capture || !captureExpectsPostProcessArtifacts(capture)) return;
    if (isCapturePostProcessFailed(capture) || isCapturePipelineActive(capture) || runningPipeline) return;
    const deferErrors = shouldDeferArtifactErrors(capture, artifactPollExhausted);
    void loadArtifacts({ silent: true, deferErrors });
  }, [
    artifactPollExhausted,
    capture?.status,
    capture?.pipeline_job?.stage,
    capture,
    loadArtifacts,
    runningPipeline,
  ]);

  useEffect(() => {
    if (!capture || capture.pipeline_job?.stage !== 'done') return;
    if (isCapturePipelineActive(capture) || runningPipeline) return;
    const deferErrors = shouldDeferArtifactErrors(capture, artifactPollExhausted);
    void loadArtifacts({ silent: true, force: true, deferErrors });
  }, [
    artifactPollExhausted,
    capture?.pipeline_job?.id,
    capture?.pipeline_job?.stage,
    capture,
    loadArtifacts,
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
      !allArtifactsLoaded &&
      !artifactPollExhausted &&
      artifactPollAttemptsRef.current < ARTIFACT_POLL_MAX_AFTER_FINISH;

    const shouldPollCapture =
      capture.segments.length > 0 &&
      (capture.status === 'transcribing' ||
        capture.status === 'draft' ||
        capture.status === 'ready' ||
        postProcessActiveNow ||
        shouldPollArtifacts);

    if (!shouldPollCapture) return;

    const intervalId = window.setInterval(() => {
      void loadCapture({ silent: true });
      if (postProcessActiveRef.current || !shouldPollArtifacts) return;
      const deferErrors = artifactPollAttemptsRef.current + 1 < ARTIFACT_POLL_MAX_AFTER_FINISH;
      void loadArtifacts({ silent: true, force: true, deferErrors });
    }, ARTIFACT_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [allArtifactsLoaded, artifactPollExhausted, capture, loadArtifacts, loadCapture, runningPipeline]);

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
    const pending = capture.segments.filter((segment) => segmentNeedsTranscription(segment));
    if (!pending.length) return;

    setRunningTranscription(true);
    setError('');
    try {
      await Promise.all(pending.map((segment) => runAudioPipeline(segment.id)));
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
        await loadArtifacts();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start post-process');
    } finally {
      setRunningPipeline(false);
    }
  }

  async function handleUploadSegment(file: File) {
    if (!captureId) return;
    setUploading(true);
    setError('');
    try {
      const updated = await uploadCaptureSegment(captureId, file);
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
  const segmentsTranscribing = capture.segments.some((segment) =>
    isAudioPipelineActive({ status: segment.status, pipeline_job: segment.pipeline_job }),
  );
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
  const awaitingS3Artifacts =
    captureExpectsPostProcessArtifacts(capture) &&
    postProcessJobDone &&
    !postProcessFailed &&
    !postProcessActive &&
    !allArtifactsLoaded &&
    !artifactPollExhausted;
  const awaitingArtifacts =
    (captureExpectsPostProcessArtifacts(capture) || postProcessDoneWithoutArtifacts) &&
    !showArtifactData &&
    !postProcessFailed &&
    !postProcessActive &&
    !awaitingS3Artifacts &&
    !loadingArtifacts;
  const showPipelineStepper =
    postProcessActive ||
    postProcessFailed ||
    (postProcessDoneWithoutArtifacts && artifactPollExhausted);

  function artifactLoadedForTab(tab: CaptureArtifactTab): boolean {
    switch (tab) {
      case 'structured_transcript':
        return structuredArtifact != null;
      case 'recording_context':
        return contextArtifact != null;
      case 'extraction':
        return extractionArtifact != null;
      case 'summary':
        return Boolean(summaryMarkdown);
      default:
        return false;
    }
  }

  function artifactTabAvailable(tab: CaptureArtifactTab): boolean {
    if (postProcessActive || postProcessFailed) return false;
    if (awaitingS3Artifacts || showArtifactData) {
      return artifactLoadedForTab(tab);
    }
    return false;
  }

  const showArtifactWorkspace =
    captureExpectsPostProcessArtifacts(capture) ||
    runningPipeline ||
    showArtifactData ||
    postProcessFailed ||
    postProcessDoneWithoutArtifacts ||
    awaitingS3Artifacts ||
    loadingArtifacts;

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
                  accept=".m4a,.mp3,.wav,.flac,.aac,.amr,.ogg,.opus,.webm"
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
                <button
                  type="button"
                  className="btn-primary"
                  disabled={uploading || runningTranscription || segmentsNeedingTranscription.length === 0}
                  onClick={() => void handleTranscribeAll()}
                >
                  {runningTranscription ? (
                    <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                  ) : (
                    <Mic {...iconProps()} aria-hidden />
                  )}
                  Transcribe all
                </button>
              </div>
            ) : null}
          </div>
          {capture.segments.length === 0 ? (
            <p className="document-detail-panel-empty">No segments yet. Add audio files to start transcription.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Size</th>
                    <th className="documents-status-col">ASR</th>
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
                            metadata: {},
                            uploaded_by: null,
                            created_at: segment.created_at,
                            updated_at: segment.updated_at,
                            pipeline_job: segment.pipeline_job,
                          }}
                        />
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
                          {canWriteCapture ? (
                            <>
                              {segmentNeedsTranscription(segment) ||
                              resolveEffectiveAudioStatus({
                                status: segment.status,
                                pipeline_job: segment.pipeline_job,
                              }) === 'failed' ? (
                                <button
                                  type="button"
                                  className="icon-btn"
                                  title="Transcribe segment"
                                  aria-label={`Transcribe ${segment.name}`}
                                  disabled={
                                    transcribingSegmentIds.has(segment.id) ||
                                    isAudioPipelineActive({
                                      status: segment.status,
                                      pipeline_job: segment.pipeline_job,
                                    })
                                  }
                                  onClick={() => void handleTranscribeSegment(segment.id)}
                                >
                                  {transcribingSegmentIds.has(segment.id) ? (
                                    <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                                  ) : (
                                    <Mic {...iconProps()} />
                                  )}
                                </button>
                              ) : null}
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
          {segmentsTranscribing ? (
            <p className="documents-table-meta">Segment transcription in progress…</p>
          ) : null}
        </section>

        <section className="audio-detail-panel audio-detail-transcript" aria-label="Extraction preview">
          <div className="document-detail-content-header capture-extraction-header">
            <div className="capture-extraction-header-top">
              <h3 className="document-detail-panel-heading">Extraction preview</h3>
              {canWriteCapture ? (
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
              ) : null}
              {postProcessActive ? (
                <PanelLoading label="Post-processing in progress…" />
              ) : postProcessFailed ? null : awaitingS3Artifacts ? (
                <PanelLoading
                  label={
                    loadingArtifacts
                      ? 'Loading post-process artifacts…'
                      : 'Waiting for post-process results from storage…'
                  }
                />
              ) : capture.status === 'post_processing' && !showArtifactData && !artifactLoadError ? (
                <PanelLoading label="Post-processing in progress…" />
              ) : artifactLoadError && !showArtifactData && !awaitingS3Artifacts ? (
                <div className="document-detail-panel-empty">
                  <p className="error inline">{artifactLoadError}</p>
                  <button type="button" className="btn-secondary" onClick={() => void loadArtifacts()}>
                    Retry loading artifacts
                  </button>
                </div>
              ) : awaitingArtifacts && !loadingArtifacts ? (
                <p className="document-detail-panel-empty">
                  {artifactLoadError
                    ? artifactLoadError
                    : postProcessDoneWithoutArtifacts
                      ? 'Post-process finished but artifact files were not found in storage. Run post-process again to regenerate them.'
                      : 'Post-process results are not available in storage. '}
                  {!artifactLoadError && !postProcessDoneWithoutArtifacts ? (
                    <>
                      Use <strong>Run post-process</strong> to regenerate them.
                    </>
                  ) : null}
                  {artifactLoadError ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ marginTop: '0.5rem' }}
                      onClick={() => void loadArtifacts({ force: true })}
                    >
                      Retry loading artifacts
                    </button>
                  ) : null}
                </p>
              ) : artifactTab === 'summary' ? (
                summaryMarkdown && showArtifactData ? (
                  <pre
                    className="document-json-preview capture-extraction-preview capture-artifact-preview-scroll"
                    onWheel={handleArtifactPreviewWheel}
                  >
                    {summaryMarkdown}
                  </pre>
                ) : awaitingS3Artifacts ? (
                  <PanelLoading
                    label={
                      loadingArtifacts
                        ? 'Loading post-process artifacts…'
                        : 'Waiting for post-process results from storage…'
                    }
                  />
                ) : (
                  <p className="document-detail-panel-empty">
                    {capture.status === 'post_processing' ||
                    capture.pipeline_job?.stage === 'extracting' ||
                    capture.pipeline_job?.stage === 'classifying' ||
                    capture.pipeline_job?.stage === 'synthesizing'
                      ? 'Summary will appear after classify and extract complete.'
                      : 'No summary yet.'}
                  </p>
                )
              ) : artifactTabAvailable(artifactTab) ? (
                <pre
                  className="document-json-preview capture-extraction-preview capture-artifact-preview-scroll"
                  onWheel={handleArtifactPreviewWheel}
                >
                  {JSON.stringify(
                    artifactTab === 'structured_transcript'
                      ? structuredArtifact
                      : artifactTab === 'recording_context'
                        ? contextArtifact
                        : extractionArtifact,
                    null,
                    2,
                  )}
                </pre>
              ) : (
                <p className="document-detail-panel-empty">
                  {capture.status === 'post_processing'
                    ? 'Waiting for this step to finish…'
                    : 'No artifact for this tab yet.'}
                </p>
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
        onClose={closeSegmentDrawer}
      />
    </div>
  );
}
