import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  displayAudioPipelineError,
  getAudio,
  getAudioDownloadUrl,
  getAudioTranscript,
  isAudioPipelineActive,
  isAudioPipelineBusy,
  resolveEffectiveAudioStatus,
  runAudioPipeline,
  type AudioRecord,
} from '../api/audios.ts';
import { formatDocumentStatusLabel } from './DocumentPipelineStatus.tsx';
import { iconProps } from './icons/icon-props.ts';
import { Markdown } from '../chat/Markdown.tsx';

function PanelLoading({ label }: { label: string }) {
  return (
    <p className="audio-detail-panel-loading" role="status" aria-live="polite">
      <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
      {label}
    </p>
  );
}

type AudioSegmentDetailContentProps = {
  audioId: string;
  canRunPipeline?: boolean;
  onAudioLoaded?: (audio: AudioRecord) => void;
};

export function AudioSegmentDetailContent({
  audioId,
  canRunPipeline = false,
  onAudioLoaded,
}: AudioSegmentDetailContentProps) {
  const [audio, setAudio] = useState<AudioRecord | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingTranscript, setLoadingTranscript] = useState(true);
  const [loadingAudioUrl, setLoadingAudioUrl] = useState(true);
  const [metaError, setMetaError] = useState('');
  const [transcriptError, setTranscriptError] = useState('');
  const [audioUrlError, setAudioUrlError] = useState('');
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [transcriptRecoverUntil, setTranscriptRecoverUntil] = useState(0);
  const onAudioLoadedRef = useRef(onAudioLoaded);
  const audioUrlLoadedRef = useRef(false);

  useEffect(() => {
    onAudioLoadedRef.current = onAudioLoaded;
  }, [onAudioLoaded]);

  useEffect(() => {
    audioUrlLoadedRef.current = false;
    setAudioUrl(null);
  }, [audioId]);

  const loadDetail = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!audioId) return;
      const silent = options?.silent ?? false;

      if (!silent) {
        setLoadingMeta(true);
        setLoadingTranscript(true);
        if (!audioUrlLoadedRef.current) setLoadingAudioUrl(true);
        setMetaError('');
        setTranscriptError('');
        if (!audioUrlLoadedRef.current) setAudioUrlError('');
      }

      const metaTask = getAudio(audioId)
        .then((record) => {
          setAudio(record);
          onAudioLoadedRef.current?.(record);
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : 'Failed to load audio';
          setMetaError(message);
          setAudio(null);
        })
        .finally(() => setLoadingMeta(false));

      const transcriptTask = getAudioTranscript(audioId)
        .then((result) => {
          setTranscript(result.transcript);
        })
        .catch((err) => {
          setTranscriptError(err instanceof Error ? err.message : 'Failed to load transcript');
        })
        .finally(() => setLoadingTranscript(false));

      const downloadTask =
        audioUrlLoadedRef.current || silent
          ? Promise.resolve()
          : getAudioDownloadUrl(audioId)
              .then((download) => {
                audioUrlLoadedRef.current = true;
                setAudioUrl(download.url);
              })
              .catch((err) => {
                setAudioUrlError(err instanceof Error ? err.message : 'Failed to load audio playback');
                setAudioUrl(null);
              })
              .finally(() => setLoadingAudioUrl(false));

      await Promise.allSettled([metaTask, transcriptTask, downloadTask]);
    },
    [audioId],
  );

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!audio) return;
    if (resolveEffectiveAudioStatus(audio) === 'completed' && !transcript && !transcriptError) {
      setTranscriptRecoverUntil((prev) => (prev > Date.now() ? prev : Date.now() + 120_000));
    }
  }, [audio, transcript, transcriptError]);

  useEffect(() => {
    if (!audioId || !audio) return;

    const awaitingTranscript =
      resolveEffectiveAudioStatus(audio) === 'completed' &&
      !transcript &&
      !transcriptError &&
      transcriptRecoverUntil > Date.now();

    if (!isAudioPipelineActive(audio) && !awaitingTranscript) return;

    const intervalId = window.setInterval(() => void loadDetail({ silent: true }), 5000);
    return () => window.clearInterval(intervalId);
  }, [audio, audioId, loadDetail, transcript, transcriptError, transcriptRecoverUntil]);

  async function handleRunPipeline() {
    if (!audioId) return;
    setRunningPipeline(true);
    try {
      await runAudioPipeline(audioId);
      await loadDetail({ silent: true });
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Failed to start pipeline');
    } finally {
      setRunningPipeline(false);
    }
  }

  if (loadingMeta && !audio) {
    return <PanelLoading label="Loading audio…" />;
  }

  if (!audio) {
    return <p className="admin-error">{metaError || 'Audio not found'}</p>;
  }

  const effectiveStatus = resolveEffectiveAudioStatus(audio);
  const pipelineBusy = isAudioPipelineBusy(audio) || runningPipeline;
  const pipelineError = displayAudioPipelineError(audio.pipeline_job?.error_message);
  const awaitingTranscript =
    effectiveStatus === 'completed' &&
    !transcript &&
    !transcriptError &&
    transcriptRecoverUntil > Date.now();

  return (
    <div className="audio-segment-detail-content">
      <div className="audio-segment-detail-meta">
        <span className={`document-status-badge status-${effectiveStatus}`}>
          {formatDocumentStatusLabel(effectiveStatus)}
        </span>
        {canRunPipeline && !pipelineBusy && effectiveStatus !== 'running' ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={runningPipeline}
            onClick={() => void handleRunPipeline()}
          >
            {runningPipeline ? 'Starting…' : 'Run transcription'}
          </button>
        ) : null}
      </div>

      {metaError ? <p className="error inline">{metaError}</p> : null}

      {pipelineError && effectiveStatus === 'failed' ? (
        <div className="audio-pipeline-failure-banner" role="alert">
          <strong>Transcription failed</strong>
          <p>{pipelineError}</p>
        </div>
      ) : null}

      <div className="audio-detail-layout audio-segment-detail-layout">
        <section className="audio-detail-panel" aria-label="Audio playback">
          <h3 className="document-detail-panel-heading">Audio</h3>
          {loadingAudioUrl ? (
            <PanelLoading label="Preparing playback…" />
          ) : audioUrl ? (
            <audio controls preload="metadata" src={audioUrl} className="audio-player" />
          ) : (
            <p className="document-detail-panel-empty">{audioUrlError || 'Playback is unavailable.'}</p>
          )}
        </section>

        <section className="audio-detail-panel audio-detail-transcript" aria-label="Transcript">
          <h3 className="document-detail-panel-heading">Transcript</h3>
          {loadingTranscript ? (
            <PanelLoading label="Loading transcript…" />
          ) : transcriptError ? (
            <p className="document-detail-panel-empty">{transcriptError}</p>
          ) : effectiveStatus === 'running' && !transcript ? (
            <PanelLoading label="Transcription in progress…" />
          ) : awaitingTranscript ? (
            <PanelLoading label="Loading transcript from storage…" />
          ) : transcript ? (
            <div className="document-markdown-panel">
              <Markdown content={transcript} />
            </div>
          ) : effectiveStatus === 'completed' ? (
            <div className="document-detail-panel-empty">
              <p>No transcript artifact found in storage.</p>
              <button type="button" className="btn-secondary" onClick={() => void loadDetail()}>
                Retry loading transcript
              </button>
            </div>
          ) : effectiveStatus === 'failed' ? (
            <p className="document-detail-panel-empty">
              No transcript was generated. See the error above and retry when ready.
            </p>
          ) : (
            <p className="document-detail-panel-empty">
              Run the transcription pipeline to generate a transcript.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
