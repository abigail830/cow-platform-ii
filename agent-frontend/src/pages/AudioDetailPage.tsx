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

export function AudioDetailPage() {
  const { audioId } = useParams<{ audioId: string }>();
  const { setSelectedChannelId } = useAudioOutletContext();

  const [audio, setAudio] = useState<AudioRecord | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runningPipeline, setRunningPipeline] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!audioId) return;
    setLoading(true);
    setError('');
    try {
      const record = await getAudio(audioId);
      setAudio(record);
      setSelectedChannelId(record.channel_id);

      const [transcriptResult, download] = await Promise.all([
        getAudioTranscript(audioId),
        getAudioDownloadUrl(audioId),
      ]);
      setTranscript(transcriptResult.transcript);
      setAudioUrl(download.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audio');
      setAudio(null);
    } finally {
      setLoading(false);
    }
  }, [audioId, setSelectedChannelId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!audioId || !audio || !isAudioPipelineActive(audio)) return;
    const intervalId = window.setInterval(() => void loadDetail(), 5000);
    return () => window.clearInterval(intervalId);
  }, [audio, audioId, loadDetail]);

  async function handleRunPipeline() {
    if (!audioId) return;
    setRunningPipeline(true);
    try {
      await runAudioPipeline(audioId);
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start pipeline');
    } finally {
      setRunningPipeline(false);
    }
  }

  if (loading) {
    return (
      <p className="document-detail-loading" role="status" aria-live="polite">
        <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
        Loading audio…
      </p>
    );
  }

  if (!audio) {
    return <p className="admin-error">{error || 'Audio not found'}</p>;
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

      {error && <p className="error inline">{error}</p>}

      {pipelineError && effectiveStatus === 'failed' && (
        <div className="audio-pipeline-failure-banner" role="alert">
          <strong>Transcription failed</strong>
          <p>{pipelineError}</p>
        </div>
      )}

      <div className="audio-detail-layout">
        {audioUrl && (
          <section className="audio-detail-panel" aria-label="Audio playback">
            <h3 className="document-detail-panel-heading">Audio</h3>
            <audio controls src={audioUrl} className="audio-player" />
          </section>
        )}

        <section className="audio-detail-panel audio-detail-transcript" aria-label="Transcript">
          <h3 className="document-detail-panel-heading">Transcript</h3>
          {effectiveStatus === 'running' && !transcript && (
            <p className="document-detail-loading" role="status" aria-live="polite">
              <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
              Transcription in progress…
            </p>
          )}
          {transcript ? (
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
