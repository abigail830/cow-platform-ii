import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
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
      <p className="admin-muted documents-loading">
        <Loader2 {...iconProps()} className="spin" aria-hidden /> Loading…
      </p>
    );
  }

  if (!audio) {
    return <p className="admin-error">{error || 'Audio not found'}</p>;
  }

  const effectiveStatus = resolveEffectiveAudioStatus(audio);
  const pipelineBusy = isAudioPipelineBusy(audio) || runningPipeline;

  return (
    <div className="document-detail-page">
      <div className="document-detail-header">
        <Link to="/knowledge/audio" className="document-detail-back">
          <ArrowLeft {...iconProps()} aria-hidden /> Back to list
        </Link>
        <h2 className="document-detail-title">{audio.name}</h2>
        <p className="admin-muted">
          Status: {formatDocumentStatusLabel(effectiveStatus)}
          {audio.pipeline_job ? ` · Pipeline: ${audio.pipeline_job.stage}` : ''}
        </p>
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

      {error && <p className="admin-error">{error}</p>}

      {audioUrl && (
        <div className="audio-player-wrap">
          <audio controls src={audioUrl} className="audio-player" />
        </div>
      )}

      <section className="audio-transcript-section">
        <h3>Transcript</h3>
        {effectiveStatus === 'running' && !transcript && (
          <p className="admin-muted">
            <Loader2 {...iconProps()} className="spin" aria-hidden /> Transcription in progress…
          </p>
        )}
        {transcript ? (
          <div className="document-markdown-panel">
            <Markdown content={transcript} />
          </div>
        ) : effectiveStatus === 'completed' ? (
          <p className="admin-table-empty">No transcript artifact found in storage.</p>
        ) : effectiveStatus === 'failed' ? (
          <p className="admin-error">{audio.pipeline_job?.error_message ?? 'Transcription failed.'}</p>
        ) : (
          <p className="admin-table-empty">Run the transcription pipeline to generate a transcript.</p>
        )}
      </section>
    </div>
  );
}
