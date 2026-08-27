import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { EvalDataset, EvalDatasetItem } from '../api/evaluation/datasets.ts';
import { ICON_SIZE_LG, iconProps } from './icons/icon-props.ts';
import {
  buildReferenceImportPreview,
  readReferenceImportFile,
  type ReferenceImportPreview,
} from '../shared/reference-import.ts';

export const EVAL_DATASET_AUDIO_ACCEPT =
  'audio/*,video/mp4,.m4a,.mp3,.wav,.flac,.aac,.amr,.ogg,.opus,.webm,.mp4';

export const EVAL_DATASET_REFERENCE_MANIFEST_ACCEPT =
  '.csv,.tsv,.txt,text/csv,text/tab-separated-values';

function fileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

type EvalDatasetFileDropzoneProps = {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
  accept?: string;
  multiple?: boolean;
  title?: string;
  hint?: string;
};

export function EvalDatasetFileDropzone({
  files,
  onFilesChange,
  disabled,
  accept = EVAL_DATASET_AUDIO_ACCEPT,
  multiple = true,
  title = 'Drag and drop audio files here, or click to browse (multiple files supported).',
  hint = 'M4A, MP3, WAV, FLAC, AAC, MP4, and more.',
}: EvalDatasetFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length || disabled) return;
    const incoming = Array.from(fileList);
    if (!multiple) {
      onFilesChange(incoming.slice(0, 1));
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    onFilesChange(
      (() => {
        const seen = new Set(files.map(fileKey));
        const merged = [...files];
        for (const file of incoming) {
          const key = fileKey(file);
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(file);
        }
        return merged;
      })(),
    );
    if (inputRef.current) inputRef.current.value = '';
  }

  function removeFile(targetKey: string) {
    if (disabled) return;
    onFilesChange(files.filter((file) => fileKey(file) !== targetKey));
  }

  return (
    <>
      <div
        className={`document-upload-dropzone${dragOver ? ' drag-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(event.dataTransfer.files);
        }}
        onMouseDown={(event) => {
          // Keep click-to-browse without selecting dropzone label text (orange ::selection).
          if (event.button === 0) event.preventDefault();
        }}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <p className="document-upload-dropzone-title">{title}</p>
        <p className="document-upload-dropzone-hint">{hint}</p>
        <div className="document-upload-plus-box" aria-hidden>
          <Plus {...iconProps({ size: ICON_SIZE_LG })} />
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          hidden
          disabled={disabled}
          onChange={(event) => addFiles(event.target.files)}
        />
      </div>

      {files.length > 0 ? (
        <ul className="document-upload-file-list" aria-label="Files to upload">
          {files.map((file) => {
            const key = fileKey(file);
            return (
              <li key={key}>
                <span className="document-upload-file-name" title={file.name}>
                  {file.name}
                </span>
                <span className="document-upload-file-size">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </span>
                <button
                  type="button"
                  className="icon-btn document-upload-file-remove"
                  title="Remove from list"
                  aria-label={`Remove ${file.name}`}
                  disabled={disabled}
                  onClick={() => removeFile(key)}
                >
                  <X {...iconProps()} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

type EvalDatasetUploadModalProps = {
  datasetName: string;
  onCancel: () => void;
  onUpload: (files: File[]) => Promise<void>;
};

export function EvalDatasetUploadModal({ datasetName, onCancel, onUpload }: EvalDatasetUploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (files.length === 0) {
      setError('Choose at least one file');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onUpload(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
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
        aria-labelledby="eval-dataset-upload-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="eval-dataset-upload-title">Upload files</h2>
        <p className="admin-form-hint">Add audio samples to dataset: {datasetName}</p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <EvalDatasetFileDropzone files={files} onFilesChange={setFiles} disabled={busy} />
          {error ? <p className="error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || files.length === 0}>
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type EvalDatasetCreateModalProps = {
  onCancel: () => void;
  onCreate: (input: { name: string; description: string; files: File[] }) => Promise<void>;
};

export function EvalDatasetCreateModal({ onCancel, onCreate }: EvalDatasetCreateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Dataset name is required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        files,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create dataset');
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
        aria-labelledby="eval-dataset-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="eval-dataset-create-title">New dataset</h2>
        <p className="admin-form-hint">Create a test dataset and optionally upload audio files in one step.</p>
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
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={busy}
              />
            </label>
            <div className="form-field form-field-wide">
              <span>Audio files</span>
              <EvalDatasetFileDropzone files={files} onFilesChange={setFiles} disabled={busy} />
            </div>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : files.length > 0 ? 'Create & upload' : 'Create dataset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type EvalDatasetEditModalProps = {
  dataset: Pick<EvalDataset, 'id' | 'name' | 'description'>;
  onCancel: () => void;
  onSave: (input: { name: string; description: string | null }) => Promise<void>;
};

export function EvalDatasetEditModal({ dataset, onCancel, onSave }: EvalDatasetEditModalProps) {
  const [name, setName] = useState(dataset.name);
  const [description, setDescription] = useState(dataset.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Dataset name is required');
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
      setError(err instanceof Error ? err.message : 'Failed to save dataset');
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
        aria-labelledby="eval-dataset-edit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="eval-dataset-edit-title">Edit dataset</h2>
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

type EvalDatasetReferenceImportModalProps = {
  datasetName: string;
  items: EvalDatasetItem[];
  onCancel: () => void;
  onImport: (rows: Array<{ itemId: string; reference: string }>) => Promise<void>;
};

export function EvalDatasetReferenceImportModal({
  datasetName,
  items,
  onCancel,
  onImport,
}: EvalDatasetReferenceImportModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<ReferenceImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const itemByName = new Map(items.map((item) => [item.name, item]));

  async function handleFilesChange(nextFiles: File[]) {
    setFiles(nextFiles);
    setError('');
    const file = nextFiles[0];
    if (!file) {
      setPreview(null);
      return;
    }
    try {
      const text = await readReferenceImportFile(file);
      setPreview(buildReferenceImportPreview(text, items.map((item) => item.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
      setPreview(null);
    }
  }

  const matchedRows =
    preview?.rows.filter((row) => itemByName.has(row.filename) && !preview.duplicateFilenames.includes(row.filename)) ??
    [];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!preview || matchedRows.length === 0) {
      setError('No matched rows to import');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = matchedRows.map((row) => ({
        itemId: itemByName.get(row.filename)!.id,
        reference: row.reference,
      }));
      await onImport(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card model-config-form eval-dataset-reference-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eval-dataset-reference-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="eval-dataset-reference-import-title">Import references</h2>
        <p className="admin-form-hint eval-dataset-reference-import-dataset-hint">
          Import ground-truth transcripts for dataset:{' '}
          <span className="eval-dataset-reference-import-dataset-name">{datasetName}</span>
        </p>
        <p className="eval-dataset-reference-import-format">
          CSV or TSV with columns filename (full name including extension, e.g. clip001.wav) and
          reference (transcript text). Filename must match an uploaded audio file exactly.
        </p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <EvalDatasetFileDropzone
            files={files}
            onFilesChange={(nextFiles) => void handleFilesChange(nextFiles)}
            disabled={busy}
            accept={EVAL_DATASET_REFERENCE_MANIFEST_ACCEPT}
            multiple={false}
            title="Drag and drop a CSV or TSV manifest here, or click to browse."
            hint="CSV or TSV supported."
          />

          {preview ? (
            <div className="eval-dataset-reference-import-preview">
              <p className="eval-dataset-reference-import-summary">
                Parsed {preview.rows.length} row(s); {matchedRows.length} will upload (exact filename match).
              </p>
              {preview.unmatchedFilenames.length > 0 ? (
                <div className="eval-dataset-reference-import-issues" role="alert">
                  <p className="eval-dataset-reference-import-issues-title error">
                    Unmatched filenames ({preview.unmatchedFilenames.length})
                  </p>
                  <ul>
                    {preview.unmatchedFilenames.map((filename) => (
                      <li key={filename}>{filename}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.duplicateFilenames.length > 0 ? (
                <div className="eval-dataset-reference-import-issues" role="alert">
                  <p className="eval-dataset-reference-import-issues-title error">
                    Duplicate filenames skipped ({preview.duplicateFilenames.length})
                  </p>
                  <ul>
                    {preview.duplicateFilenames.map((filename) => (
                      <li key={filename}>{filename}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || matchedRows.length === 0}>
              {busy
                ? 'Importing…'
                : preview
                  ? `Import ${matchedRows.length} reference(s)`
                  : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type EvalDatasetReferenceUploadModalProps = {
  item: EvalDatasetItem;
  onCancel: () => void;
  onUpload: (referenceText: string) => Promise<void>;
};

export function EvalDatasetReferenceUploadModal({
  item,
  onCancel,
  onUpload,
}: EvalDatasetReferenceUploadModalProps) {
  const [referenceText, setReferenceText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!referenceText.trim()) {
      setError('Reference text is required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onUpload(referenceText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
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
        aria-labelledby="eval-dataset-reference-upload-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="eval-dataset-reference-upload-title">Upload reference</h2>
        <p className="admin-form-hint">
          Ground-truth transcript for <strong>{item.name}</strong>
        </p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label className="form-field form-field-wide">
            <span>Reference text</span>
            <textarea
              rows={8}
              value={referenceText}
              onChange={(event) => setReferenceText(event.target.value)}
              disabled={busy}
              autoFocus
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !referenceText.trim()}>
              {busy ? 'Uploading…' : 'Upload reference'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
