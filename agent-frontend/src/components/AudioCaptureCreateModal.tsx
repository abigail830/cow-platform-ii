import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  AUDIENCE_LABELS,
  CAPTURE_INPUT_MODE_LABELS,
  RECORDING_MODE_LABELS,
} from '../api/audioCaptures.ts';
import { ICON_SIZE_LG, iconProps } from './icons/icon-props.ts';

const AUDIO_ACCEPTED_TYPES = '.m4a,.mp3,.wav,.flac,.aac,.amr,.ogg,.opus,.webm';
const TRANSCRIPT_ACCEPTED_TYPES = '.md,.markdown,.docx';

function fileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

type CaptureInputMode = 'audio' | 'transcript';

type AudioCaptureCreateModalProps = {
  channelName: string;
  onCancel: () => void;
  onSubmit: (input: {
    title: string;
    brief?: string;
    participantsHint?: string;
    recordingMode?: string;
    audience?: string;
    inputMode: CaptureInputMode;
    files: File[];
  }) => Promise<void>;
};

export function AudioCaptureCreateModal({ channelName, onCancel, onSubmit }: AudioCaptureCreateModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [participantsHint, setParticipantsHint] = useState('');
  const [recordingMode, setRecordingMode] = useState('general');
  const [audience, setAudience] = useState('unknown');
  const [inputMode, setInputMode] = useState<CaptureInputMode>('audio');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const acceptedTypes = inputMode === 'transcript' ? TRANSCRIPT_ACCEPTED_TYPES : AUDIO_ACCEPTED_TYPES;

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

  function handleInputModeChange(nextMode: CaptureInputMode) {
    setInputMode(nextMode);
    setFiles([]);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (files.length === 0) {
      setError(
        inputMode === 'transcript'
          ? 'Add at least one transcript segment'
          : 'Add at least one audio segment',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        title: title.trim(),
        brief: brief.trim() || undefined,
        participantsHint: participantsHint.trim() || undefined,
        recordingMode: recordingMode || undefined,
        audience,
        inputMode,
        files,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create capture');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card model-config-form audio-capture-create-modal"
        role="dialog"
        aria-labelledby="capture-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="capture-create-title">New audio capture</h2>
        <p className="admin-form-hint">Channel: {channelName}</p>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field form-field-wide">
              <span>Input type</span>
              <select
                value={inputMode}
                onChange={(event) => handleInputModeChange(event.target.value as CaptureInputMode)}
                disabled={busy}
              >
                {Object.entries(CAPTURE_INPUT_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field form-field-wide">
              <span>Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                autoFocus
                disabled={busy}
              />
            </label>

            <label className="form-field form-field-wide">
              <span>Brief (optional)</span>
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                rows={2}
                disabled={busy}
              />
            </label>

            <label className="form-field form-field-wide">
              <span>Participants hint (optional)</span>
              <input
                value={participantsHint}
                onChange={(event) => setParticipantsHint(event.target.value)}
                placeholder="e.g. Alice, Bob, client PM"
                disabled={busy}
              />
            </label>

            <label className="form-field">
              <span>Recording mode</span>
              <select
                value={recordingMode}
                onChange={(event) => setRecordingMode(event.target.value)}
                disabled={busy}
              >
                {Object.entries(RECORDING_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Audience</span>
              <select
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                disabled={busy}
              >
                {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
              {inputMode === 'transcript'
                ? 'Drag and drop transcript files here, or click to browse (multiple files supported).'
                : 'Drag and drop audio segments here, or click to browse (multiple files supported).'}
            </p>
            <p className="document-upload-dropzone-hint">
              {inputMode === 'transcript'
                ? 'Markdown (.md) or Word (.docx). Each file becomes one segment in order. Structured markdown with speaker timestamps works best.'
                : 'M4A, MP3, WAV, FLAC, AAC, and more. Each file becomes one segment in order.'}
            </p>
            <div className="document-upload-plus-box" aria-hidden>
              <Plus {...iconProps({ size: ICON_SIZE_LG })} />
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={acceptedTypes}
              multiple
              hidden
              onChange={(event) => addFiles(event.target.files)}
            />
          </div>

          {files.length > 0 && (
            <ul className="document-upload-file-list" aria-label="Segments to upload">
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
                      onClick={(event) => {
                        event.stopPropagation();
                        removeFile(key);
                      }}
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
              {busy ? 'Creating…' : 'Create capture'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
