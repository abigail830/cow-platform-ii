import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { resolveEffectiveAudioStatus, type AudioRecord } from '../api/audios.ts';
import { formatDocumentStatusLabel } from './DocumentPipelineStatus.tsx';
import { AudioSegmentDetailContent } from './AudioSegmentDetailContent.tsx';
import { iconProps } from './icons/icon-props.ts';

type AudioSegmentDrawerProps = {
  audioId: string | null;
  segmentLabel?: string | null;
  open: boolean;
  transcriptOnly?: boolean;
  onClose: () => void;
};

export function AudioSegmentDrawer({
  audioId,
  segmentLabel,
  open,
  transcriptOnly = false,
  onClose,
}: AudioSegmentDrawerProps) {
  const [audioTitle, setAudioTitle] = useState<string | null>(null);
  const [headerAudio, setHeaderAudio] = useState<AudioRecord | null>(null);

  useEffect(() => {
    if (!open) {
      setAudioTitle(null);
      setHeaderAudio(null);
    }
  }, [open, audioId]);

  const handleAudioLoaded = useCallback((audio: AudioRecord) => {
    setAudioTitle((current) => current ?? audio.name);
    setHeaderAudio(audio);
  }, []);

  if (!open || !audioId) return null;

  const effectiveStatus = headerAudio ? resolveEffectiveAudioStatus(headerAudio) : null;

  return (
    <div className="audio-segment-drawer-backdrop admin-drawer-backdrop" onClick={onClose}>
      <aside
        className="audio-segment-drawer admin-drawer"
        aria-label="Segment details"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-drawer-header">
          <div>
            <h2 className="audio-segment-drawer-title">
              <span>{segmentLabel || audioTitle || 'Segment'}</span>
              {effectiveStatus ? (
                <span className={`document-status-badge status-${effectiveStatus}`}>
                  {formatDocumentStatusLabel(effectiveStatus)}
                </span>
              ) : null}
            </h2>
            {segmentLabel && audioTitle && segmentLabel !== audioTitle ? (
              <p className="admin-drawer-subtitle">{audioTitle}</p>
            ) : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close segment details">
            <X {...iconProps()} />
          </button>
        </header>
        <div className="admin-drawer-body audio-segment-drawer-body">
          <AudioSegmentDetailContent
            key={audioId}
            audioId={audioId}
            transcriptOnly={transcriptOnly}
            onAudioLoaded={handleAudioLoaded}
          />
        </div>
      </aside>
    </div>
  );
}
