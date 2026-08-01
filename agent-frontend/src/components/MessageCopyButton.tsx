import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { iconProps } from './icons/icon-props.ts';

type MessageCopyButtonProps = {
  text: string;
};

export function MessageCopyButton({ text }: MessageCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const trimmed = text.trim();
  if (!trimmed) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('[chat] copy failed', err);
    }
  }

  return (
    <button
      type="button"
      className="message-copy-btn"
      onClick={() => void handleCopy()}
      aria-label={copied ? 'Copied' : 'Copy message'}
      title={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check {...iconProps({ size: 14 })} /> : <Copy {...iconProps({ size: 14 })} />}
    </button>
  );
}
