import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  getDocumentCapture,
  isDocumentFileCapture,
  resolveCaptureArtifactDocumentId,
  type DocumentCaptureDetail,
} from '../api/documentCaptures.ts';
import { iconProps } from '../components/icons/icon-props.ts';
import { DocumentCaptureDetailPage } from './DocumentCaptureDetailPage.tsx';
import { DocumentDetailPage } from './DocumentDetailPage.tsx';

/**
 * Routes capture detail by input_mode:
 * - document → parse/original viewer (DocumentDetailPage via artifact document id)
 * - audio / transcript → capture workspace (segments, ASR, post-process)
 */
export function DocumentItemDetailRouter() {
  const { captureId } = useParams<{ captureId: string }>();
  const [capture, setCapture] = useState<DocumentCaptureDetail | null>(null);
  const [artifactDocumentId, setArtifactDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!captureId) {
      setLoading(false);
      setError('Capture id is required');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    void getDocumentCapture(captureId)
      .then((detail) => {
        if (cancelled) return;
        setCapture(detail);
        if (isDocumentFileCapture(detail)) {
          setArtifactDocumentId(resolveCaptureArtifactDocumentId(detail));
        } else {
          setArtifactDocumentId(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load capture');
        setCapture(null);
        setArtifactDocumentId(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [captureId]);

  if (loading) {
    return (
      <div className="document-detail-page">
        <p className="document-detail-loading" role="status" aria-live="polite">
          <Loader2 {...iconProps({ size: 18, className: 'document-detail-loading-icon' })} aria-hidden />
          Loading…
        </p>
      </div>
    );
  }

  if (error || !capture) {
    return (
      <div className="document-detail-page">
        <p className="error">{error || 'Capture not found'}</p>
      </div>
    );
  }

  if (isDocumentFileCapture(capture) && artifactDocumentId) {
    return <DocumentDetailPage documentIdOverride={artifactDocumentId} />;
  }

  return <DocumentCaptureDetailPage />;
}
