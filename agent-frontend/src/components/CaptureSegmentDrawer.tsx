import { X } from 'lucide-react';
import { useEffect } from 'react';
import { resolveEffectiveAudioStatus } from '../api/capture-pipeline-utils.ts';
import type { DocumentCaptureSegment } from '../api/documentCaptures.ts';
import { formatDocumentStatusLabel } from './DocumentPipelineStatus.tsx';
import { CaptureSegmentDetailContent } from './CaptureSegmentDetailContent.tsx';
import { iconProps } from './icons/icon-props.ts';

type CaptureSegmentDrawerProps = {
  captureId: string;
  segment: DocumentCaptureSegment | null;
  segmentLabel?: string | null;
  open: boolean;
  transcriptOnly?: boolean;
  onClose: () => void;
};

export function CaptureSegmentDrawer({
  captureId,
  segment,
  segmentLabel,
  open,
  transcriptOnly = false,
  onClose,
}: CaptureSegmentDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !segment) return null;

  const effectiveStatus = resolveEffectiveAudioStatus(segment);
  const title = segmentLabel || segment.name;

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
              <span>{title}</span>
              {effectiveStatus ? (
                <span className={`document-status-badge status-${effectiveStatus}`}>
                  {formatDocumentStatusLabel(effectiveStatus)}
                </span>
              ) : null}
            </h2>
            {segmentLabel && segment.name && segmentLabel !== segment.name ? (
              <p className="admin-drawer-subtitle">{segment.name}</p>
            ) : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close segment details">
            <X {...iconProps()} />
          </button>
        </header>
        <div className="admin-drawer-body audio-segment-drawer-body">
          <CaptureSegmentDetailContent
            key={segment.id}
            captureId={captureId}
            segment={segment}
            transcriptOnly={transcriptOnly}
          />
        </div>
      </aside>
    </div>
  );
}
