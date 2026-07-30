import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ICON_SIZE_LG, iconProps } from './icons/icon-props.ts';

const ACCEPTED_TYPES = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.epub,.xmind,.md,.markdown';

function fileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

type DocumentUploadModalProps = {
  channelName: string;
  onCancel: () => void;
  onUpload: (files: File[]) => Promise<void>;
};

export function DocumentUploadModal({ channelName, onCancel, onUpload }: DocumentUploadModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const incoming = Array.from(fileList);
    setFiles((current) => {
      const seen = new Set(current.map(fileKey));
      const merged = [...current];
      for (const file of incoming) {
        const key = fileKey(file);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(file);
      }
      return merged;
    });
    if (inputRef.current) inputRef.current.value = '';
  }

  function removeFile(targetKey: string) {
    setFiles((current) => current.filter((file) => fileKey(file) !== targetKey));
    setError('');
  }

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
      <div className="modal-card model-config-form" onClick={(event) => event.stopPropagation()}>
        <h2>Upload documents</h2>
        <p className="admin-form-hint">Upload to channel: {channelName}</p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div
            className={`document-upload-dropzone${dragOver ? ' drag-over' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              addFiles(event.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
          >
            <p className="document-upload-dropzone-title">
              Drag and drop files here, or click to browse (multiple files supported).
            </p>
            <p className="document-upload-dropzone-hint">
              PDF, images, DOCX, PPTX, XLSX, EPUB, XMind. Large files upload in chunks.
            </p>
            <div className="document-upload-plus-box" aria-hidden>
              <Plus {...iconProps({ size: ICON_SIZE_LG })} />
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              hidden
              onChange={(event) => addFiles(event.target.files)}
            />
          </div>

          {files.length > 0 && (
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
                      disabled={busy}
                      onClick={() => removeFile(key)}
                    >
                      <X {...iconProps()} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
