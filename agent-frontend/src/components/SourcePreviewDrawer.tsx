import type { ReactNode } from 'react';

export function SourcePreviewDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="source-preview-drawer-backdrop admin-drawer-backdrop" onClick={onClose}>
      <aside
        className="source-preview-drawer admin-drawer"
        aria-label="Document preview"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </aside>
    </div>
  );
}
