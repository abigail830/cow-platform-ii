type KbDeleteConfirmModalProps = {
  knowledgeBaseName: string;
  itemCount: number;
  deleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function KbDeleteConfirmModal({
  knowledgeBaseName,
  itemCount,
  deleting = false,
  onCancel,
  onConfirm,
}: KbDeleteConfirmModalProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card document-delete-confirm-modal"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
        aria-labelledby="kb-delete-title"
        aria-describedby="kb-delete-desc"
      >
        <h2 id="kb-delete-title">Delete knowledge base</h2>
        <div id="kb-delete-desc" className="document-delete-confirm-body">
          <p className="document-delete-confirm-lead">
            Delete <strong>{knowledgeBaseName}</strong>?
          </p>
          <p className="document-delete-confirm-warn">
            This permanently removes the knowledge base, all imported knowledge items ({itemCount}{' '}
            {itemCount === 1 ? 'item' : 'items'}), and import job history. Source documents in
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
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
