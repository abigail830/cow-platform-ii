import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { SourceOriginalPreviewPanel } from '../components/SourceOriginalPreviewPanel.tsx';
import { SourcePreviewDrawer } from '../components/SourcePreviewDrawer.tsx';
import type { SourcePreviewTarget } from '../shared/source-preview-href.ts';

export type SourcePreviewOpenTarget = SourcePreviewTarget & {
  title?: string;
};

type SourcePreviewHostValue = {
  open: (target: SourcePreviewOpenTarget) => void;
  close: () => void;
};

const SourcePreviewHostContext = createContext<SourcePreviewHostValue | undefined>(undefined);

type PreviewState = {
  documentId: string;
  page: number | null;
  title: string;
};

export function SourcePreviewHostProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const open = useCallback((target: SourcePreviewOpenTarget) => {
    setPreview({
      documentId: target.documentId,
      page: target.page,
      title: target.title?.trim() || 'Document',
    });
  }, []);

  const close = useCallback(() => {
    setPreview(null);
  }, []);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <SourcePreviewHostContext.Provider value={value}>
      {children}
      <SourcePreviewDrawer open={preview != null} onClose={close}>
        {preview ? (
          <SourceOriginalPreviewPanel
            documentId={preview.documentId}
            page={preview.page}
            title={preview.title}
            onClose={close}
          />
        ) : null}
      </SourcePreviewDrawer>
    </SourcePreviewHostContext.Provider>
  );
}

export function useSourcePreviewHost(): SourcePreviewHostValue | undefined {
  return useContext(SourcePreviewHostContext);
}
