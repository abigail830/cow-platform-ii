import type { SourceRef } from '../shared/source-ref.ts';
import { formatSourceLabel } from '../shared/source-ref.ts';
import { SourceOriginalPreviewPanel } from './SourceOriginalPreviewPanel.tsx';

export function HybridSearchSourcePreview({
  source,
  onClose,
}: {
  source: SourceRef;
  onClose: () => void;
}) {
  const page = source.locator?.page_num ?? null;

  return (
    <aside className="hybrid-search-preview-panel" aria-label="Source preview">
      <SourceOriginalPreviewPanel
        documentId={source.document_id}
        page={page}
        title={formatSourceLabel(source)}
        onClose={onClose}
      />
    </aside>
  );
}
