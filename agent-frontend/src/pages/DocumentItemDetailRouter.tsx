import { useParams } from 'react-router-dom';
import { DocumentCaptureDetailPage } from './DocumentCaptureDetailPage.tsx';
import { DocumentDetailPage } from './DocumentDetailPage.tsx';

export function DocumentItemDetailRouter() {
  const { captureId } = useParams<{ captureId?: string; documentId?: string }>();

  if (captureId) {
    return <DocumentCaptureDetailPage />;
  }

  return <DocumentDetailPage />;
}
