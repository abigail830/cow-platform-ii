type DocumentDeleteConfirmModalProps = {
  documentName: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function DocumentDeleteConfirmModal({
  documentName,
  onCancel,
  onConfirm,
}: DocumentDeleteConfirmModalProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card document-delete-confirm-modal"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
        aria-labelledby="document-delete-title"
        aria-describedby="document-delete-desc"
      >
        <h2 id="document-delete-title">Delete document</h2>
        <div id="document-delete-desc" className="document-delete-confirm-body">
          <p className="document-delete-confirm-lead">
            Delete <strong>{documentName}</strong>?
          </p>
          <p className="document-delete-confirm-warn">
            This removes the file and all parsed artifacts from storage. This cannot be undone.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => void onConfirm()}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
