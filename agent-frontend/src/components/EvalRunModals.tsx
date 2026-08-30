import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import type { EvalRunProcessingOption } from '../api/evaluation/runs.ts';
import {
  deleteEvalRunFile,
  listEvalRunFiles,
  uploadEvalRunFile,
  type EvalRunDatasetItemRef,
} from '../api/evaluation/runs.ts';
import { formatEvalFileBytes, type EvalDataset } from '../api/evaluation/datasets.ts';
import { EvalDatasetFileDropzone } from './EvalDatasetModals.tsx';
import { iconProps } from './icons/icon-props.ts';

type EvalRunCreateModalProps = {
  audioPipelines: EvalRunProcessingOption[];
  documentPipelines: EvalRunProcessingOption[];
  datasets: EvalDataset[];
  onCancel: () => void;
  onCreate: (input: {
    name: string;
    description: string;
    pipelineConfigIds: string[];
    datasetId: string;
  }) => Promise<void>;
};

export function EvalRunCreateModal({
  audioPipelines,
  documentPipelines,
  datasets,
  onCancel,
  onCreate,
}: EvalRunCreateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [mediaTab, setMediaTab] = useState<'audio' | 'document'>('audio');
  const [selectedPipelineIds, setSelectedPipelineIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tabDatasets = datasets.filter((row) => row.media_type === mediaTab);
  const pipelines = mediaTab === 'document' ? documentPipelines : audioPipelines;
  const selectedDataset = tabDatasets.find((row) => row.id === datasetId) ?? null;

  function togglePipeline(id: string) {
    setSelectedPipelineIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || selectedPipelineIds.length === 0) return;
    setBusy(true);
    setError('');
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        pipelineConfigIds: selectedPipelineIds,
        datasetId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create run');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(name.trim() && datasetId && selectedPipelineIds.length > 0);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card model-config-form eval-run-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eval-run-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="eval-run-create-title">New evaluation run</h2>
        <p className="admin-form-hint">
          Name the evaluation set, then configure type-specific settings. Audio runs compare ASR pipelines;
          document runs compare parse pipelines (DocumentMind, Baidu, Paddle, etc.) on the same files.
        </p>
        <form className="eval-run-create-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="eval-run-create-form-body">
            <div className="form-grid">
            <label className="form-field form-field-wide">
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={256}
                disabled={busy}
                autoFocus
              />
            </label>
            <label className="form-field form-field-wide">
              <span>Description</span>
              <textarea
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={busy}
              />
            </label>
          </div>

          <div className="modal-tabs" role="tablist" aria-label="Evaluation type">
            <button
              type="button"
              role="tab"
              aria-selected={mediaTab === 'audio'}
              className={`modal-tab${mediaTab === 'audio' ? ' active' : ''}`}
              onClick={() => {
                setMediaTab('audio');
                setDatasetId('');
                setSelectedPipelineIds([]);
              }}
            >
              Audio
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mediaTab === 'document'}
              className={`modal-tab${mediaTab === 'document' ? ' active' : ''}`}
              onClick={() => {
                setMediaTab('document');
                setDatasetId('');
                setSelectedPipelineIds([]);
              }}
            >
              Document
            </button>
          </div>

          <div className="eval-run-create-tab-body form-grid">
            <>
                <div className="form-field form-field-wide">
                  <span>Dataset</span>
                  {tabDatasets.length === 0 ? (
                    <p className="admin-muted">
                      No {mediaTab} datasets yet.{' '}
                      <Link to="/evaluation/datasets" className="btn-link">
                        Create a dataset
                      </Link>{' '}
                      and upload {mediaTab === 'document' ? 'documents' : 'audio files'} first.
                    </p>
                  ) : (
                    <>
                      <select
                        value={datasetId}
                        onChange={(event) => setDatasetId(event.target.value)}
                        disabled={busy}
                        required
                      >
                        <option value="">Select a dataset…</option>
                        {tabDatasets.map((dataset) => (
                          <option key={dataset.id} value={dataset.id}>
                            {dataset.name} ({dataset.item_count} file{dataset.item_count === 1 ? '' : 's'})
                          </option>
                        ))}
                      </select>
                      {selectedDataset && selectedDataset.item_count === 0 ? (
                        <p className="error eval-run-create-dataset-warning">
                          This dataset has no files. Upload files on the{' '}
                          <Link to={`/evaluation/datasets/${selectedDataset.id}`} className="btn-link">
                            dataset page
                          </Link>{' '}
                          before starting a run.
                        </p>
                      ) : selectedDataset ? (
                        <p className="admin-form-hint">
                          Files and ground-truth references are managed on the dataset page — not here.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="form-field form-field-wide">
                  <span>Pipelines to compare</span>
                  {pipelines.length === 0 ? (
                    <p className="admin-muted">
                      No enabled async {mediaTab === 'document' ? 'document parse' : 'transcription'} pipelines
                      found.
                    </p>
                  ) : (
                    <div className="eval-run-pipeline-list">
                      {pipelines.map((pipeline) => (
                        <label key={pipeline.id} className="form-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedPipelineIds.includes(pipeline.id)}
                            onChange={() => togglePipeline(pipeline.id)}
                            disabled={busy}
                          />
                          <span>
                            {pipeline.name}{' '}
                            <span className="admin-muted">({pipeline.pipeline_name})</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
          </div>
            {error ? <p className="error">{error}</p> : null}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !canSubmit}>
              {busy ? 'Creating…' : 'Create run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type EvalRunFilesModalProps = {
  runId: string;
  datasetId: string;
  runName: string;
  runStatus: string;
  fileCount: number;
  canWrite: boolean;
  onCancel: () => void;
  onChanged: () => void;
};

export function EvalRunFilesModal({
  runId,
  datasetId,
  runName,
  runStatus,
  fileCount,
  canWrite,
  onCancel,
  onChanged,
}: EvalRunFilesModalProps) {
  const [items, setItems] = useState<EvalRunDatasetItemRef[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EvalRunDatasetItemRef | null>(null);

  const filesLocked = runStatus === 'running';

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listEvalRunFiles(runId, datasetId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [runId, datasetId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    if (files.length === 0 || filesLocked) return;
    setBusy(true);
    setError('');
    try {
      for (const file of files) {
        await uploadEvalRunFile(runId, file, datasetId);
      }
      setFiles([]);
      await loadItems();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || filesLocked) return;
    setBusy(true);
    setError('');
    try {
      await deleteEvalRunFile(runId, deleteTarget.id, datasetId);
      setDeleteTarget(null);
      await loadItems();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card model-config-form eval-run-files-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eval-run-files-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="eval-run-files-title">Manage files</h2>
        <p className="admin-form-hint">
          {runName} · {loading ? fileCount : items.length} file
          {(loading ? fileCount : items.length) === 1 ? '' : 's'}
          {filesLocked ? ' · Run in progress — files are locked until it finishes.' : ''}
        </p>

        {loading ? (
          <p className="admin-muted">Loading files…</p>
        ) : items.length === 0 ? (
          <p className="admin-muted">No files yet. Upload audio below.</p>
        ) : (
          <div className="admin-table-wrap eval-run-files-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  {canWrite ? <th aria-label="Actions" /> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.size_bytes != null ? formatEvalFileBytes(item.size_bytes) : '—'}</td>
                    {canWrite ? (
                      <td>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Delete file"
                          disabled={busy || filesLocked}
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 {...iconProps()} aria-hidden />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canWrite ? (
          <form onSubmit={(event) => void handleUpload(event)}>
            <EvalDatasetFileDropzone files={files} onFilesChange={setFiles} disabled={busy || filesLocked} />
            {error ? <p className="error">{error}</p> : null}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
                Close
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={busy || files.length === 0 || filesLocked}
              >
                {busy ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </form>
        ) : (
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Close
            </button>
          </div>
        )}

        {deleteTarget ? (
          <div className="modal-backdrop eval-run-files-delete-backdrop" onClick={() => setDeleteTarget(null)}>
            <div
              className="modal-card"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <h3>Delete file?</h3>
              <p>
                Remove <strong>{deleteTarget.name}</strong> from this evaluation set?
              </p>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={() => void handleDelete()} disabled={busy}>
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type EvalRunEditModalProps = {
  run: { id: string; name: string; description: string | null };
  onCancel: () => void;
  onSave: (input: { name: string; description: string | null }) => Promise<void>;
};

export function EvalRunEditModal({ run, onCancel, onSave }: EvalRunEditModalProps) {
  const [name, setName] = useState(run.name);
  const [description, setDescription] = useState(run.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Run name is required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save run');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card model-config-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eval-run-edit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="eval-run-edit-title">Edit run</h2>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field form-field-wide">
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={256}
                disabled={busy}
                autoFocus
              />
            </label>
            <label className="form-field form-field-wide">
              <span>Description</span>
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={busy}
              />
            </label>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
