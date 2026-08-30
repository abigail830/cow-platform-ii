import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Download, Clock3, FileText, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import {
  createEvalDataset,
  deleteEvalDataset,
  deleteEvalDatasetItem,
  detectEvalDatasetItemDuration,
  evalDatasetItemDurationSec,
  evalDatasetItemHasReference,
  formatEvalFileBytes,
  getEvalDataset,
  getEvalDatasetItemDownloadUrl,
  importEvalDatasetItemReferences,
  listEvalDatasetItems,
  listEvalDatasets,
  updateEvalDataset,
  updateEvalDatasetItemDuration,
  updateEvalDatasetItemReference,
  type EvalDataset,
  type EvalDatasetItem,
} from '../api/evaluation/datasets.ts';
import {
  EvalDatasetCreateModal,
  EvalDatasetDurationEditModal,
  EvalDatasetEditModal,
  EvalDatasetReferenceImportModal,
  EvalDatasetReferenceUploadModal,
  EvalDatasetUploadModal,
} from '../components/EvalDatasetModals.tsx';
import { formatDatasetItemDuration, formatDatasetItemReferencePreview } from '../shared/reference-import.ts';
import { startEvalDatasetUpload } from '../shared/eval-dataset-upload-manager.ts';
import { useEvalDatasetUploadJob } from '../shared/use-eval-dataset-upload-job.ts';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { NavPageIcon } from '../components/icons/NavIcons.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const LIST_PAGE = getNavPage('/evaluation/datasets')!;

function downloadReferenceText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}.reference.txt`;
  anchor.rel = 'noopener noreferrer';
  anchor.click();
  URL.revokeObjectURL(url);
}

function mediaTypeLabel(mediaType: EvalDataset['media_type']): string {
  if (mediaType === 'audio') return 'Audio';
  return 'Document';
}

function EvalDatasetListRowActions({
  dataset,
  canWrite,
  onUpload,
  onEdit,
  onDelete,
}: {
  dataset: EvalDataset;
  canWrite: boolean;
  onUpload: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const uploadJob = useEvalDatasetUploadJob(dataset.id);
  const uploading = uploadJob?.inProgress ?? false;

  if (!canWrite) return null;

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        title={uploading ? `Uploading ${uploadJob?.completed ?? 0}/${uploadJob?.total ?? 0}…` : 'Upload files'}
        onClick={onUpload}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
        ) : (
          <Upload {...iconProps()} aria-hidden />
        )}
      </button>
      <button type="button" className="icon-btn" title="Edit" onClick={onEdit}>
        <Pencil {...iconProps()} aria-hidden />
      </button>
      <button type="button" className="icon-btn" title="Delete" onClick={onDelete}>
        <Trash2 {...iconProps()} aria-hidden />
      </button>
    </>
  );
}

export function EvalDatasetsListPage() {
  const navigate = useNavigate();
  const { user } = useAppOutletContext();
  const canWrite = useMemo(() => hasPermission(user, 'evaluation:datasets', 'write'), [user]);

  const [items, setItems] = useState<EvalDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EvalDataset | null>(null);
  const [uploadTarget, setUploadTarget] = useState<EvalDataset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EvalDataset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((row) => {
      return (
        row.name.toLowerCase().includes(query) ||
        (row.description ?? '').toLowerCase().includes(query)
      );
    });
  }, [items, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listEvalDatasets());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load datasets';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
        setForbidden(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreateModal() {
    setCreateOpen(true);
  }

  async function handleCreate(input: { name: string; description: string; files: File[] }) {
    const dataset = await createEvalDataset({
      name: input.name,
      description: input.description || undefined,
    });
    setCreateOpen(false);
    if (input.files.length > 0) {
      startEvalDatasetUpload(dataset.id, input.files, {
        onFileUploaded: () => void load(),
        onComplete: () => void load(),
      });
      navigate(`/evaluation/datasets/${dataset.id}`);
    } else {
      await load();
    }
  }

  function handleUploadToDataset(datasetId: string, files: File[]) {
    setUploadTarget(null);
    startEvalDatasetUpload(datasetId, files, {
      onFileUploaded: () => void load(),
      onComplete: () => void load(),
    });
  }

  async function handleEditSave(input: { name: string; description: string | null }) {
    if (!editTarget) return;
    await updateEvalDataset(editTarget.id, input);
    setEditTarget(null);
    await load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      await deleteEvalDataset(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete dataset');
    } finally {
      setDeleting(false);
    }
  }

  if (forbidden) return <Navigate to="/agents/playground" replace />;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <AdminPageTitle main={LIST_PAGE.titleMain} accent={LIST_PAGE.titleAccent} />
        <AdminPageDescription>
          Test datasets for ASR pipeline comparison. Upload audio files and reuse them in evaluation runs.
        </AdminPageDescription>
      </header>

      <div className="admin-toolbar">
        <div className="admin-search">
          <Search {...iconProps()} aria-hidden />
          <input
            type="search"
            placeholder="Search datasets…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {canWrite ? (
          <button type="button" className="btn-primary" onClick={openCreateModal}>
            <Plus {...iconProps()} aria-hidden />
            New dataset
          </button>
        ) : null}
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Files</th>
              <th>Updated</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="admin-table-empty">
                  Loading…
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-table-empty">
                  No datasets yet.
                </td>
              </tr>
            ) : (
              filteredItems.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="eval-dataset-list-entry">
                      <NavPageIcon
                        name="evaluation-dataset"
                        size={16}
                        className="eval-dataset-list-icon"
                        aria-hidden
                      />
                      <div className="eval-dataset-list-text">
                        <Link to={`/evaluation/datasets/${row.id}`} className="eval-dataset-list-name">
                          {row.name}
                        </Link>
                        {row.description ? (
                          <div className="admin-muted eval-dataset-list-desc">{row.description}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>{mediaTypeLabel(row.media_type)}</td>
                  <td>{row.item_count}</td>
                  <td>{new Date(row.updated_at).toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <EvalDatasetListRowActions
                        dataset={row}
                        canWrite={canWrite}
                        onUpload={() => setUploadTarget(row)}
                        onEdit={() => setEditTarget(row)}
                        onDelete={() => setDeleteTarget(row)}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <EvalDatasetCreateModal
          onCancel={() => setCreateOpen(false)}
          onCreate={handleCreate}
        />
      ) : null}

      {editTarget ? (
        <EvalDatasetEditModal
          dataset={editTarget}
          onCancel={() => setEditTarget(null)}
          onSave={handleEditSave}
        />
      ) : null}

      {uploadTarget ? (
        <EvalDatasetUploadModal
          datasetName={uploadTarget.name}
          onCancel={() => setUploadTarget(null)}
          onStartUpload={(files) => handleUploadToDataset(uploadTarget.id, files)}
        />
      ) : null}

      {deleteTarget ? (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Delete dataset</h2>
            <p>
              Delete <strong>{deleteTarget.name}</strong> and all uploaded files? This cannot be undone.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EvalDatasetDetailPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const { user } = useAppOutletContext();
  const canWrite = useMemo(() => hasPermission(user, 'evaluation:datasets', 'write'), [user]);

  const [dataset, setDataset] = useState<EvalDataset | null>(null);
  const [items, setItems] = useState<EvalDatasetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [referenceImportOpen, setReferenceImportOpen] = useState(false);
  const [referenceUploadTarget, setReferenceUploadTarget] = useState<EvalDatasetItem | null>(null);
  const [durationEditTarget, setDurationEditTarget] = useState<EvalDatasetItem | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EvalDatasetItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [retryingDurationIds, setRetryingDurationIds] = useState<Set<string>>(() => new Set());

  const uploadJob = useEvalDatasetUploadJob(datasetId);
  const uploading = uploadJob?.inProgress ?? false;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!datasetId) return;
    if (!opts?.silent) {
      setLoading(true);
    }
    setError('');
    try {
      const [datasetRow, itemRows] = await Promise.all([
        getEvalDataset(datasetId),
        listEvalDatasetItems(datasetId),
      ]);
      setDataset(datasetRow);
      setItems(itemRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dataset';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
        setForbidden(true);
      } else {
        setError(message);
      }
    } finally {
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }, [datasetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((row) => row.name.toLowerCase().includes(query));
  }, [items, search]);

  function handleStartUpload(files: File[]) {
    if (!datasetId || !canWrite) return;
    setUploadOpen(false);
    startEvalDatasetUpload(datasetId, files, {
      onFileUploaded: () => void load({ silent: true }),
      onComplete: () => void load({ silent: true }),
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Upload failed');
      },
    });
  }

  async function handleDownload(item: EvalDatasetItem) {
    if (!datasetId) return;
    try {
      const { download_url, filename } = await getEvalDatasetItemDownloadUrl(datasetId, item.id);
      const anchor = document.createElement('a');
      anchor.href = download_url;
      anchor.download = filename;
      anchor.rel = 'noopener noreferrer';
      anchor.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  function handleDownloadReference(item: EvalDatasetItem) {
    if (!item.reference_text?.trim()) return;
    downloadReferenceText(item.name, item.reference_text);
  }

  async function handleImportReferences(
    rows: Array<{ itemId: string; reference: string; durationSec: number | null }>,
  ) {
    if (!datasetId) return;
    await importEvalDatasetItemReferences(datasetId, rows);
    setReferenceImportOpen(false);
    await load();
  }

  async function handleSaveDuration(itemId: string, durationSec: number | null) {
    if (!datasetId) return;
    await updateEvalDatasetItemDuration(datasetId, itemId, durationSec);
    setDurationEditTarget(null);
    await load();
  }

  async function handleRetryDuration(item: EvalDatasetItem) {
    if (!datasetId || !canWrite) return;
    setRetryingDurationIds((prev) => new Set(prev).add(item.id));
    setError('');
    try {
      const updated = await detectEvalDatasetItemDuration(datasetId, item.id);
      setItems((prev) => prev.map((row) => (row.id === item.id ? updated : row)));
      setDataset((prev) =>
        prev ? { ...prev, updated_at: updated.updated_at } : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duration detection failed');
    } finally {
      setRetryingDurationIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function handleUploadReference(itemId: string, referenceText: string) {
    if (!datasetId) return;
    await updateEvalDatasetItemReference(datasetId, itemId, referenceText);
    setReferenceUploadTarget(null);
    await load();
  }

  async function handleDeleteItem() {
    if (!datasetId || !deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      await deleteEvalDatasetItem(datasetId, deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setDeleting(false);
    }
  }

  if (forbidden) return <Navigate to="/agents/playground" replace />;
  if (!datasetId) return <Navigate to="/evaluation/datasets" replace />;

  return (
    <div className="admin-page eval-dataset-detail-page">
      <Link to="/evaluation/datasets" className="kb-back-link">
        ← back DataSet
      </Link>

      <header className="admin-header">
        <AdminPageTitle main={dataset?.name ?? '…'} accent="" />
        {dataset ? (
          <AdminPageDescription>
            {mediaTypeLabel(dataset.media_type)} · {dataset.item_count} file
            {dataset.item_count === 1 ? '' : 's'}
            {uploading ? (
              <>
                {' '}
                · Uploading {uploadJob?.completed ?? 0}/{uploadJob?.total ?? 0}
                {uploadJob?.failed ? ` (${uploadJob.failed} failed)` : ''}…
              </>
            ) : null}
          </AdminPageDescription>
        ) : null}
      </header>

      <div className="admin-toolbar">
        <div className="admin-toolbar-left">
          <div className="admin-search">
            <Search {...iconProps()} aria-hidden />
            <input
              type="search"
              placeholder="Search files…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        {canWrite ? (
          <div className="admin-toolbar-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setReferenceImportOpen(true)}
              disabled={items.length === 0}
            >
              <FileText {...iconProps()} aria-hidden />
              Import references
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setUploadOpen(true)}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
              ) : (
                <Upload {...iconProps()} aria-hidden />
              )}
              {uploading
                ? `Uploading ${uploadJob?.completed ?? 0}/${uploadJob?.total ?? 0}…`
                : 'Upload files'}
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-table-wrap eval-dataset-items-table-wrap">
        <table className="admin-table eval-dataset-items-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Size</th>
              <th>Duration</th>
              <th>Reference</th>
              <th>Uploaded</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="admin-table-empty">
                  Loading…
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-table-empty">
                  {items.length === 0 ? (
                    <>
                      No files yet.{' '}
                      {canWrite ? (
                        <button type="button" className="btn-link" onClick={() => setUploadOpen(true)}>
                          Upload audio samples
                        </button>
                      ) : (
                        'Upload audio samples for evaluation.'
                      )}
                    </>
                  ) : (
                    'No files match your search.'
                  )}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const durationSec = evalDatasetItemDurationSec(item);
                const retryingDuration = retryingDurationIds.has(item.id);

                return (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.file_type}</td>
                  <td>{formatEvalFileBytes(item.size_bytes)}</td>
                  <td>{formatDatasetItemDuration(durationSec)}</td>
                  <td>
                    <span
                      className="eval-dataset-item-reference"
                      title={item.reference_text?.trim() || undefined}
                    >
                      {formatDatasetItemReferencePreview(item.reference_text)}
                    </span>
                  </td>
                  <td>{new Date(item.created_at).toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="Download audio"
                        onClick={() => void handleDownload(item)}
                      >
                        <Download {...iconProps()} aria-hidden />
                      </button>
                      {evalDatasetItemHasReference(item) ? (
                        <button
                          type="button"
                          className="icon-btn"
                          title="Download reference"
                          onClick={() => handleDownloadReference(item)}
                        >
                          <FileText {...iconProps()} aria-hidden />
                        </button>
                      ) : null}
                      {canWrite ? (
                        <>
                          {durationSec == null ? (
                            <button
                              type="button"
                              className="icon-btn"
                              title="Detect duration"
                              disabled={retryingDuration}
                              onClick={() => void handleRetryDuration(item)}
                            >
                              {retryingDuration ? (
                                <Loader2 {...iconProps({ className: 'icon-btn-spin' })} aria-hidden />
                              ) : (
                                <RefreshCw {...iconProps()} aria-hidden />
                              )}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="icon-btn"
                            title="Edit duration"
                            onClick={() => setDurationEditTarget(item)}
                          >
                            <Clock3 {...iconProps()} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title={evalDatasetItemHasReference(item) ? 'Replace reference' : 'Add reference'}
                            onClick={() => setReferenceUploadTarget(item)}
                          >
                            <Pencil {...iconProps()} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Delete"
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 {...iconProps()} aria-hidden />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {referenceImportOpen && dataset ? (
        <EvalDatasetReferenceImportModal
          datasetName={dataset.name}
          items={items}
          onCancel={() => setReferenceImportOpen(false)}
          onImport={handleImportReferences}
        />
      ) : null}

      {referenceUploadTarget ? (
        <EvalDatasetReferenceUploadModal
          item={referenceUploadTarget}
          onCancel={() => setReferenceUploadTarget(null)}
          onUpload={(referenceText) => handleUploadReference(referenceUploadTarget.id, referenceText)}
        />
      ) : null}

      {durationEditTarget ? (
        <EvalDatasetDurationEditModal
          item={durationEditTarget}
          onCancel={() => setDurationEditTarget(null)}
          onSave={(durationSec) => handleSaveDuration(durationEditTarget.id, durationSec)}
        />
      ) : null}

      {uploadOpen && dataset ? (
        <EvalDatasetUploadModal
          datasetName={dataset.name}
          onCancel={() => setUploadOpen(false)}
          onStartUpload={handleStartUpload}
        />
      ) : null}

      {deleteTarget ? (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Delete file</h2>
            <p>
              Delete <strong>{deleteTarget.name}</strong> from this dataset?
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={deleting}
                onClick={() => void handleDeleteItem()}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
