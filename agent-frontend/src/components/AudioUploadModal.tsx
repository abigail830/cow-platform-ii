import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ICON_SIZE_LG, iconProps } from './icons/icon-props.ts';

const ACCEPTED_TYPES = '.m4a,.mp3,.wav,.flac,.aac,.amr,.ogg,.opus,.webm';

function fileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

type AudioUploadModalProps = {
  channelName: string;
  onCancel: () => void;
  onUpload: (files: File[]) => Promise<void>;
};

export function AudioUploadModal({ channelName, onCancel, onUpload }: AudioUploadModalProps) {
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
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2>Upload audio</h2>
        <p className="admin-muted">Channel: {channelName}</p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div
            className={`upload-dropzone${dragOver ? ' drag-over' : ''}`}
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
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              hidden
              onChange={(event) => addFiles(event.target.files)}
            />
            <Plus {...iconProps({ size: ICON_SIZE_LG })} aria-hidden />
            <p>Drop audio files here or click to browse</p>
            <p className="admin-form-hint">Supported: m4a, mp3, wav, flac, aac, and more</p>
          </div>

          {files.length > 0 && (
            <ul className="upload-file-list">
              {files.map((file) => {
                const key = fileKey(file);
                return (
                  <li key={key}>
                    <span>{file.name}</span>
                    <button type="button" className="icon-btn" onClick={() => removeFile(key)} aria-label="Remove">
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
            <button type="submit" className="btn-primary" disabled={busy || files.length === 0}>
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
