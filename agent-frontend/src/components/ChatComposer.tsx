import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import {
  fileToAgentPromptImage,
  type AgentPromptImage,
  type ChatSendPayload,
} from '../chat/prompt-images.ts';
import { ChatImageChip } from './ChatImageChip.tsx';
import { IconPaperclip, IconSend, IconStop, IconStopSpinner } from './icons/ChatIcons.tsx';

type PendingPromptImage = {
  id: string;
  image: AgentPromptImage;
  label: string;
  previewUrl: string;
};

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: (payload: ChatSendPayload) => void;
  onCancel?: () => void;
  disabled?: boolean;
  busy?: boolean;
  canceling?: boolean;
  placeholder?: string;
};

function createPendingImage(image: AgentPromptImage): PendingPromptImage {
  return {
    id: crypto.randomUUID(),
    image,
    label: image.filename?.trim() || 'Image',
    previewUrl: `data:${image.mimeType};base64,${image.data}`,
  };
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  onCancel,
  disabled = false,
  busy = false,
  canceling = false,
  placeholder = 'question',
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const [pendingImages, setPendingImages] = useState<PendingPromptImage[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const canSend = !disabled && !busy && (value.trim().length > 0 || pendingImages.length > 0);

  async function addImageFiles(files: FileList | File[]) {
    setAttachmentError(null);
    const additions: PendingPromptImage[] = [];
    for (const file of files) {
      try {
        const image = await fileToAgentPromptImage(file);
        additions.push(createPendingImage(image));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to add image.';
        setAttachmentError(message);
      }
    }
    if (additions.length > 0) {
      setPendingImages((current) => [...current, ...additions]);
    }
  }

  function removePendingImage(id: string) {
    setPendingImages((current) => current.filter((item) => item.id !== id));
  }

  function submit() {
    if (busy) {
      onCancel?.();
      return;
    }
    if (!canSend) return;
    onSend({
      text: value,
      images: pendingImages.map((item) => item.image),
    });
    setPendingImages([]);
    setAttachmentError(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.nativeEvent.isComposing || isComposingRef.current || event.keyCode === 229) return;
    event.preventDefault();
    if (busy) return;
    submit();
  }

  async function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const items = event.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (file) imageFiles.push(file);
    }
    if (imageFiles.length === 0) return;

    event.preventDefault();
    await addImageFiles(imageFiles);
  }

  return (
    <div className="chat-input-area">
      <div className="chat-column">
        {pendingImages.length > 0 ? (
          <div className="chat-pending-images" aria-label="Attached images">
            {pendingImages.map((pending) => (
              <ChatImageChip
                key={pending.id}
                label={pending.label}
                previewUrl={pending.previewUrl}
                variant="composer"
                onRemove={() => removePendingImage(pending.id)}
              />
            ))}
          </div>
        ) : null}
        {attachmentError ? <p className="chat-attachment-error">{attachmentError}</p> : null}
        <form
          className="input-bar"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <button
            type="button"
            className="attach-btn"
            title="Attach image"
            aria-label="Attach image"
            disabled={disabled || busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <IconPaperclip />
          </button>
          <input
            ref={fileInputRef}
            className="chat-file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(event) => {
              const files = event.target.files;
              if (files?.length) void addImageFiles(files);
              event.target.value = '';
            }}
          />
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            rows={2}
            disabled={disabled}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
            onKeyDown={onKeyDown}
            onPaste={(event) => void onPaste(event)}
          />
          {busy ? (
            <button
              type="button"
              className="send-btn stop-btn"
              disabled={disabled || canceling || !onCancel}
              title={canceling ? 'Stopping…' : 'Stop'}
              aria-label={canceling ? 'Stopping' : 'Stop'}
              onClick={() => onCancel?.()}
            >
              {canceling ? <IconStopSpinner /> : <IconStop />}
            </button>
          ) : (
            <button
              type="submit"
              className="send-btn"
              disabled={!canSend}
              title="Send"
              aria-label="Send"
            >
              <IconSend />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
