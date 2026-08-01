type KbItemDeleteConfirmModalProps = {
  mode: 'single' | 'bulk';
  documentName?: string;
  count?: number;
  deleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function KbItemDeleteConfirmModal({
  mode,
  documentName,
  count = 0,
  deleting = false,
  onCancel,
  onConfirm,
}: KbItemDeleteConfirmModalProps) {
  const title = mode === 'single' ? 'Remove knowledge item' : 'Remove knowledge items';

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card document-delete-confirm-modal"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
        aria-labelledby="kb-item-delete-title"
        aria-describedby="kb-item-delete-desc"
      >
        <h2 id="kb-item-delete-title">{title}</h2>
        <div id="kb-item-delete-desc" className="document-delete-confirm-body">
          <p className="document-delete-confirm-lead">
            {mode === 'single' ? (
              <>
                Remove <strong>{documentName ?? 'this item'}</strong> from the knowledge base?
              </>
            ) : (
              <>
                Remove <strong>{count}</strong> selected {count === 1 ? 'item' : 'items'} from the
                knowledge base?
              </>
            )}
          </p>
          <p className="document-delete-confirm-warn">
            This removes the imported snapshot from this knowledge base only. Source documents in
            Document Management are not deleted.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void onConfirm()}
            disabled={deleting}
          >
            {deleting ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
