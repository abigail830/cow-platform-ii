import { useRef, type KeyboardEvent } from 'react';
import { IconPaperclip, IconSend } from './icons/ChatIcons.tsx';

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
};

export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  busy = false,
  placeholder = 'question',
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.nativeEvent.isComposing || isComposingRef.current || event.keyCode === 229) return;
    event.preventDefault();
    onSend();
  }

  return (
    <div className="chat-input-area">
      <div className="chat-column">
        <form
          className="input-bar"
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
        >
          <button
            type="button"
            className="attach-btn"
            title="Attach file"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <IconPaperclip />
          </button>
          <input
            ref={fileInputRef}
            className="chat-file-input"
            type="file"
            multiple
            hidden
            onChange={() => {
              if (fileInputRef.current) fileInputRef.current.value = '';
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
          />
          <button
            type="submit"
            className="send-btn"
            disabled={disabled || busy || !value.trim()}
            title="Send"
            aria-label="Send"
          >
            <IconSend />
          </button>
        </form>
      </div>
    </div>
  );
}
