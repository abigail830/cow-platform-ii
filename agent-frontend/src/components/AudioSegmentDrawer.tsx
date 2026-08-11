import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AudioRecord } from '../api/audios.ts';
import { AudioSegmentDetailContent } from './AudioSegmentDetailContent.tsx';
import { iconProps } from './icons/icon-props.ts';

type AudioSegmentDrawerProps = {
  audioId: string | null;
  segmentLabel?: string | null;
  open: boolean;
  onClose: () => void;
  canRunPipeline?: boolean;
};

export function AudioSegmentDrawer({
  audioId,
  segmentLabel,
  open,
  onClose,
  canRunPipeline = false,
}: AudioSegmentDrawerProps) {
  const [audioTitle, setAudioTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setAudioTitle(null);
  }, [open, audioId]);

  const handleAudioLoaded = useCallback((audio: AudioRecord) => {
    setAudioTitle((current) => current ?? audio.name);
  }, []);

  if (!open || !audioId) return null;

  return (
    <div className="audio-segment-drawer-backdrop admin-drawer-backdrop" onClick={onClose}>
      <aside
        className="audio-segment-drawer admin-drawer"
        aria-label="Segment details"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-drawer-header">
          <div>
            <h2>{segmentLabel || audioTitle || 'Segment'}</h2>
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
            canRunPipeline={canRunPipeline}
            onAudioLoaded={handleAudioLoaded}
          />
        </div>
      </aside>
    </div>
  );
}
