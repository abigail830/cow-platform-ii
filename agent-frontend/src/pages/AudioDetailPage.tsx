import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
import { formatDocumentStatusLabel } from '../components/DocumentPipelineStatus.tsx';
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

export function AudioDetailPage() {
  const { audioId } = useParams<{ audioId: string }>();
  const { setSelectedChannelId } = useAudioOutletContext();

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

  const loadDetail = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!audioId) return;
      const silent = options?.silent ?? false;

      if (!silent) {
        setLoadingMeta(true);
        setLoadingTranscript(true);
        setLoadingAudioUrl(true);
        setMetaError('');
        setTranscriptError('');
        setAudioUrlError('');
      }

      const metaTask = getAudio(audioId)
        .then((record) => {
          setAudio(record);
          setSelectedChannelId(record.channel_id);
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

      const downloadTask = silent
        ? Promise.resolve()
        : getAudioDownloadUrl(audioId)
            .then((download) => {
              setAudioUrl(download.url);
            })
            .catch((err) => {
              setAudioUrlError(err instanceof Error ? err.message : 'Failed to load audio playback');
              setAudioUrl(null);
            })
            .finally(() => setLoadingAudioUrl(false));

      await Promise.allSettled([metaTask, transcriptTask, downloadTask]);
    },
    [audioId, setSelectedChannelId],
  );

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!audioId || !audio || !isAudioPipelineActive(audio)) return;
    const intervalId = window.setInterval(() => void loadDetail({ silent: true }), 5000);
    return () => window.clearInterval(intervalId);
  }, [audio, audioId, loadDetail]);

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
    return (
      <div className="document-detail-page audio-detail-page audio-detail-page--initial-loading">
        <PanelLoading label="Loading audio…" />
      </div>
    );
  }

  if (!audio) {
    return <p className="admin-error">{metaError || 'Audio not found'}</p>;
  }

  const effectiveStatus = resolveEffectiveAudioStatus(audio);
  const pipelineBusy = isAudioPipelineBusy(audio) || runningPipeline;
  const pipelineError = displayAudioPipelineError(audio.pipeline_job?.error_message);

  return (
    <div className="document-detail-page audio-detail-page">
      <div className="document-detail-toolbar">
        <Link to="/knowledge/audio" className="document-detail-back">
          <ArrowLeft {...iconProps({ size: 16 })} aria-hidden />
          Back to list
        </Link>
        <div className="document-detail-title-row">
          <h2 className="document-detail-title">{audio.name}</h2>
          <span className={`document-status-badge status-${effectiveStatus}`}>
            {formatDocumentStatusLabel(effectiveStatus)}
          </span>
        </div>
        {!pipelineBusy && effectiveStatus !== 'running' && (
          <button
            type="button"
            className="btn-secondary"
            disabled={runningPipeline}
            onClick={() => void handleRunPipeline()}
          >
            {runningPipeline ? 'Starting…' : 'Run transcription'}
          </button>
        )}
      </div>

      {metaError && <p className="error inline">{metaError}</p>}

      {pipelineError && effectiveStatus === 'failed' && (
        <div className="audio-pipeline-failure-banner" role="alert">
          <strong>Transcription failed</strong>
          <p>{pipelineError}</p>
        </div>
      )}

      <div className="audio-detail-layout">
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
          ) : transcript ? (
            <div className="document-markdown-panel">
              <Markdown content={transcript} />
            </div>
          ) : effectiveStatus === 'completed' ? (
            <p className="document-detail-panel-empty">No transcript artifact found in storage.</p>
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
