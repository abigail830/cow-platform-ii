import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  displayAudioPipelineError,
  getAudio,
  getAudioDownloadUrl,
  getAudioTranscript,
  isAudioPipelineActive,
  resolveEffectiveAudioStatus,
  type AudioRecord,
} from '../api/audios.ts';
import { downloadTextFile, withDownloadExtension } from '../shared/download-text.ts';
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
  transcriptOnly?: boolean;
  onAudioLoaded?: (audio: AudioRecord) => void;
};

export function AudioSegmentDetailContent({
  audioId,
  transcriptOnly = false,
  onAudioLoaded,
}: AudioSegmentDetailContentProps) {
  const [audio, setAudio] = useState<AudioRecord | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [loadingAudioUrl, setLoadingAudioUrl] = useState(true);
  const [metaError, setMetaError] = useState('');
  const [transcriptError, setTranscriptError] = useState('');
  const [audioUrlError, setAudioUrlError] = useState('');
  const onAudioLoadedRef = useRef(onAudioLoaded);
  const audioUrlLoadedRef = useRef(false);
  const transcriptLoadedRef = useRef(false);
  const transcriptRetryRef = useRef(0);

  useEffect(() => {
    onAudioLoadedRef.current = onAudioLoaded;
  }, [onAudioLoaded]);

  useEffect(() => {
    audioUrlLoadedRef.current = false;
    transcriptLoadedRef.current = false;
    transcriptRetryRef.current = 0;
    setAudio(null);
    setTranscript(null);
    setAudioUrl(null);
    setMetaError('');
    setTranscriptError('');
    setAudioUrlError('');
    setLoadingMeta(true);
    setLoadingTranscript(false);
    setLoadingAudioUrl(true);
  }, [audioId]);

  const loadTranscript = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!audioId) return;
      if (transcriptLoadedRef.current && options?.silent) return;

      if (!options?.silent) setLoadingTranscript(true);
      try {
        const result = await getAudioTranscript(audioId);
        if (result.transcript) {
          transcriptLoadedRef.current = true;
          setTranscript(result.transcript);
          setTranscriptError('');
        } else if (!options?.silent) {
          setTranscript(null);
        } else {
          transcriptRetryRef.current += 1;
        }
      } catch (err) {
        setTranscriptError(err instanceof Error ? err.message : 'Failed to load transcript');
      } finally {
        setLoadingTranscript(false);
      }
    },
    [audioId],
  );

  const loadDetail = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!audioId) return;
      const silent = options?.silent ?? false;

      if (!silent) {
        setLoadingMeta(true);
        setMetaError('');
      }

      let record: AudioRecord;
      try {
        record = await getAudio(audioId);
        setAudio(record);
        onAudioLoadedRef.current?.(record);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load audio';
        setMetaError(message);
        setAudio(null);
        if (!silent) {
          setLoadingMeta(false);
          setLoadingTranscript(false);
          setLoadingAudioUrl(false);
        }
        return;
      } finally {
        if (!silent) setLoadingMeta(false);
      }

      const effectiveStatus = resolveEffectiveAudioStatus(record);
      const isTranscriptOnly =
        transcriptOnly || record.metadata?.source_kind === 'transcript';
      const shouldLoadTranscript = isTranscriptOnly || effectiveStatus === 'completed';

      if (shouldLoadTranscript) {
        await loadTranscript({ silent });
      } else if (!silent) {
        setLoadingTranscript(false);
        setTranscript(null);
        setTranscriptError('');
      }

      if (!isTranscriptOnly && !audioUrlLoadedRef.current) {
        if (!silent) setLoadingAudioUrl(true);
        try {
          const download = await getAudioDownloadUrl(audioId);
          audioUrlLoadedRef.current = true;
          setAudioUrl(download.url);
          setAudioUrlError('');
        } catch (err) {
          setAudioUrlError(err instanceof Error ? err.message : 'Failed to load audio playback');
          setAudioUrl(null);
        } finally {
          if (!silent) setLoadingAudioUrl(false);
        }
      }
    },
    [audioId, loadTranscript, transcriptOnly],
  );

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!audio || !audioId) return;

    const effectiveStatus = resolveEffectiveAudioStatus(audio);
    const shouldPoll =
      isAudioPipelineActive(audio) ||
      (effectiveStatus === 'completed' &&
        !transcript &&
        !transcriptError &&
        transcriptRetryRef.current < 12);

    if (!shouldPoll) return;

    const intervalId = window.setInterval(() => {
      void loadDetail({ silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [audio, audioId, loadDetail, transcript, transcriptError]);

  if (loadingMeta && !audio) {
    return <PanelLoading label="Loading audio…" />;
  }

  if (!audio) {
    return <p className="admin-error">{metaError || 'Audio not found'}</p>;
  }

  const effectiveStatus = resolveEffectiveAudioStatus(audio);
  const pipelineError = displayAudioPipelineError(audio.pipeline_job?.error_message);
  const isTranscriptOnly = transcriptOnly || audio.metadata?.source_kind === 'transcript';

  return (
    <div className="audio-segment-detail-content">
      {metaError ? <p className="error inline">{metaError}</p> : null}

      {!isTranscriptOnly && pipelineError && effectiveStatus === 'failed' ? (
        <div className="audio-pipeline-failure-banner" role="alert">
          <strong>Transcription failed</strong>
          <p>{pipelineError}</p>
        </div>
      ) : null}

      <div className="audio-detail-layout audio-segment-detail-layout">
        {!isTranscriptOnly ? (
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
        ) : null}

        <section className="audio-detail-panel audio-detail-transcript" aria-label="Transcript">
          <div className="document-detail-content-header">
            <h3 className="document-detail-panel-heading">Transcript</h3>
            {transcript ? (
              <div className="document-detail-toolbar-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  title="Download transcript as plain text"
                  onClick={() =>
                    downloadTextFile(
                      transcript,
                      withDownloadExtension(audio.name, 'txt'),
                    )
                  }
                >
                  <Download {...iconProps()} aria-hidden />
                  Download .txt
                </button>
              </div>
            ) : null}
          </div>
          {loadingTranscript ? (
            <PanelLoading label="Loading transcript…" />
          ) : transcriptError ? (
            <div className="document-detail-panel-empty">
              <p>{transcriptError}</p>
              <button type="button" className="btn-secondary" onClick={() => void loadTranscript()}>
                Retry loading transcript
              </button>
            </div>
          ) : effectiveStatus === 'running' ? (
            <PanelLoading label="Transcription in progress…" />
          ) : transcript ? (
            <div className="document-markdown-panel">
              <Markdown content={transcript} />
            </div>
          ) : effectiveStatus === 'completed' ? (
            <div className="document-detail-panel-empty">
              <p>No transcript artifact found in storage.</p>
              <button type="button" className="btn-secondary" onClick={() => void loadTranscript()}>
                Retry loading transcript
              </button>
            </div>
          ) : isTranscriptOnly ? (
            <p className="document-detail-panel-empty">No transcript content found.</p>
          ) : effectiveStatus === 'failed' ? (
            <p className="document-detail-panel-empty">
              No transcript was generated. See the error above and retry when ready.
            </p>
          ) : (
            <p className="document-detail-panel-empty">
              Transcribe this segment from the list to generate a transcript.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
