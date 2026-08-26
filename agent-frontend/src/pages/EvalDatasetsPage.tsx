import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Download, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import {
  createEvalDataset,
  deleteEvalDataset,
  deleteEvalDatasetItem,
  formatEvalFileBytes,
  getEvalDataset,
  getEvalDatasetItemDownloadUrl,
  listEvalDatasetItems,
  listEvalDatasets,
  updateEvalDataset,
  uploadEvalDatasetItem,
  type EvalDataset,
  type EvalDatasetItem,
} from '../api/evaluation/datasets.ts';
import {
  EvalDatasetCreateModal,
  EvalDatasetEditModal,
  EvalDatasetUploadModal,
} from '../components/EvalDatasetModals.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const LIST_PAGE = getNavPage('/evaluation/datasets')!;

function mediaTypeLabel(mediaType: EvalDataset['media_type']): string {
  if (mediaType === 'audio') return 'Audio';
  return 'Document';
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
    for (const file of input.files) {
      await uploadEvalDatasetItem(dataset.id, file);
    }
    setCreateOpen(false);
    await load();
    if (input.files.length > 0) {
      navigate(`/evaluation/datasets/${dataset.id}`);
    }
  }

  async function handleUploadToDataset(datasetId: string, files: File[]) {
    for (const file of files) {
      await uploadEvalDatasetItem(datasetId, file);
    }
    setUploadTarget(null);
    await load();
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
                    <Link to={`/evaluation/datasets/${row.id}`} className="admin-link">
                      {row.name}
                    </Link>
                    {row.description ? (
                      <div className="admin-muted">{row.description}</div>
                    ) : null}
                  </td>
                  <td>{mediaTypeLabel(row.media_type)}</td>
                  <td>{row.item_count}</td>
                  <td>{new Date(row.updated_at).toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      {canWrite ? (
                        <>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Upload files"
                            onClick={() => setUploadTarget(row)}
                          >
                            <Upload {...iconProps()} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Edit"
                            onClick={() => setEditTarget(row)}
                          >
                            <Pencil {...iconProps()} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Delete"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 {...iconProps()} aria-hidden />
                          </button>
                        </>
                      ) : null}
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
          onUpload={(files) => handleUploadToDataset(uploadTarget.id, files)}
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
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EvalDatasetItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
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
      setLoading(false);
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

  async function handleUpload(files: File[]) {
    if (!datasetId || !canWrite) return;
    for (const file of files) {
      await uploadEvalDatasetItem(datasetId, file);
    }
    setUploadOpen(false);
    await load();
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
    <div className="admin-page">
      <Link to="/evaluation/datasets" className="kb-back-link">
        ← back DataSet
      </Link>

      <header className="admin-header">
        <AdminPageTitle main={dataset?.name ?? '…'} accent="" />
        {dataset ? (
          <AdminPageDescription>
            {mediaTypeLabel(dataset.media_type)} · {dataset.item_count} file
            {dataset.item_count === 1 ? '' : 's'}
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
          <button type="button" className="btn-primary" onClick={() => setUploadOpen(true)}>
            <Upload {...iconProps()} aria-hidden />
            Upload files
          </button>
        ) : null}
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Size</th>
              <th>Uploaded</th>
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
              filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.file_type}</td>
                  <td>{formatEvalFileBytes(item.size_bytes)}</td>
                  <td>{new Date(item.created_at).toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="Download"
                        onClick={() => void handleDownload(item)}
                      >
                        <Download {...iconProps()} aria-hidden />
                      </button>
                      {canWrite ? (
                        <button
                          type="button"
                          className="icon-btn"
                          title="Delete"
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 {...iconProps()} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {uploadOpen && dataset ? (
        <EvalDatasetUploadModal
          datasetName={dataset.name}
          onCancel={() => setUploadOpen(false)}
          onUpload={handleUpload}
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
