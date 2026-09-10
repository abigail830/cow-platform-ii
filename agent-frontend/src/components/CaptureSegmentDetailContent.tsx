import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  isTranscriptSegment,
  presignCaptureSegmentPreview,
  type DocumentCaptureSegment,
} from '../api/documentCaptures.ts';
import {
  displayAudioPipelineError,
  isAudioPipelineActive,
  resolveEffectiveAudioStatus,
} from '../api/capture-pipeline-utils.ts';
import { fetchPresignedStorageText } from '../api/storage-fetch.ts';
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

type CaptureSegmentDetailContentProps = {
  captureId: string;
  segment: DocumentCaptureSegment;
  transcriptOnly?: boolean;
};

export function CaptureSegmentDetailContent({
  captureId,
  segment,
  transcriptOnly = false,
}: CaptureSegmentDetailContentProps) {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(true);
  const [loadingAudioUrl, setLoadingAudioUrl] = useState(true);
  const [transcriptError, setTranscriptError] = useState('');
  const [audioUrlError, setAudioUrlError] = useState('');
  const audioUrlLoadedRef = useRef(false);
  const transcriptLoadedRef = useRef(false);
  const transcriptRetryRef = useRef(0);

  const isTranscriptOnly = transcriptOnly || isTranscriptSegment(segment);
  const effectiveStatus = resolveEffectiveAudioStatus(segment);
  const jobStage = segment.pipeline_job?.stage ?? null;

  useEffect(() => {
    audioUrlLoadedRef.current = false;
    transcriptLoadedRef.current = false;
    transcriptRetryRef.current = 0;
    setTranscript(null);
    setAudioUrl(null);
    setTranscriptError('');
    setAudioUrlError('');
    setLoadingTranscript(true);
    setLoadingAudioUrl(!isTranscriptOnly);
  }, [captureId, segment.id, isTranscriptOnly]);

  const loadPreview = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const status = resolveEffectiveAudioStatus({
        status: segment.status,
        pipeline_job: segment.pipeline_job,
      });
      const shouldLoadTranscript = isTranscriptOnly || status === 'completed';

      if (!silent) {
        if (shouldLoadTranscript && !transcriptLoadedRef.current) setLoadingTranscript(true);
        if (!isTranscriptOnly && !audioUrlLoadedRef.current) setLoadingAudioUrl(true);
      }

      try {
        const preview = await presignCaptureSegmentPreview(captureId, segment.id);

        if (!isTranscriptOnly && !audioUrlLoadedRef.current && preview.playback_url) {
          audioUrlLoadedRef.current = true;
          setAudioUrl(preview.playback_url);
          setAudioUrlError('');
        } else if (!isTranscriptOnly && !audioUrlLoadedRef.current && !preview.playback_url) {
          setAudioUrlError('Playback is unavailable.');
        }

        if (shouldLoadTranscript && !transcriptLoadedRef.current) {
          if (!preview.transcript_url) {
            if (!silent) setTranscript(null);
            else transcriptRetryRef.current += 1;
          } else {
            const text = await fetchPresignedStorageText(preview.transcript_url);
            if (text?.trim()) {
              transcriptLoadedRef.current = true;
              setTranscript(text);
              setTranscriptError('');
            } else if (!silent) {
              setTranscript(null);
            } else {
              transcriptRetryRef.current += 1;
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load segment preview';
        if (!isTranscriptOnly && !audioUrlLoadedRef.current) {
          setAudioUrlError(message);
        }
        if (shouldLoadTranscript && !transcriptLoadedRef.current) {
          setTranscriptError(message);
        }
      } finally {
        if (!silent) {
          setLoadingTranscript(false);
          setLoadingAudioUrl(false);
        }
      }
    },
    [captureId, isTranscriptOnly, jobStage, segment.id, segment.status],
  );

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    const shouldPoll =
      isAudioPipelineActive(segment) ||
      (effectiveStatus === 'completed' &&
        !transcript &&
        !transcriptError &&
        transcriptRetryRef.current < 12);

    if (!shouldPoll) return;

    const intervalId = window.setInterval(() => {
      void loadPreview({ silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [effectiveStatus, loadPreview, jobStage, segment.status, transcript, transcriptError]);

  const pipelineError = displayAudioPipelineError(segment.pipeline_job?.error_message);

  return (
    <div className="audio-segment-detail-content">
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
                    downloadTextFile(transcript, withDownloadExtension(segment.name, 'txt'))
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
              <button type="button" className="btn-secondary" onClick={() => void loadPreview()}>
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
              <button type="button" className="btn-secondary" onClick={() => void loadPreview()}>
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
