import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getToken } from '../api/auth.ts';
import { apiUrl } from '../api/base.ts';
import { normalizeAttachmentDownloadUrl } from '../chat/published-artifacts.ts';
import { iconProps } from './icons/icon-props.ts';

type ChatImageChipProps = {
  label: string;
  previewUrl?: string | null;
  onRemove?: () => void;
  variant?: 'composer' | 'message';
};

async function resolvePreviewSrc(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;

  const normalized = normalizeAttachmentDownloadUrl(trimmed);
  const fetchUrl =
    normalized.startsWith('http://') || normalized.startsWith('https://')
      ? normalized
      : apiUrl(normalized);
  const token = getToken();
  if (!token) return normalized;

  try {
    const response = await fetch(fetchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function ChatImageChip({
  label,
  previewUrl,
  onRemove,
  variant = 'message',
}: ChatImageChipProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) {
      setLightboxSrc(null);
      return;
    }
    if (!previewUrl) return;

    let cancelled = false;
    let objectUrl: string | null = null;
    setLoadingPreview(true);

    void resolvePreviewSrc(previewUrl).then((src) => {
      if (cancelled) return;
      if (src?.startsWith('blob:')) objectUrl = src;
      setLightboxSrc(src);
      setLoadingPreview(false);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [lightboxOpen, previewUrl]);

  const canPreview = Boolean(previewUrl);

  return (
    <>
      <span className={`chat-image-chip${variant === 'composer' ? ' chat-image-chip-composer' : ''}`}>
        <button
          type="button"
          className="chat-image-chip-button"
          disabled={!canPreview}
          title={canPreview ? 'View image' : label}
          aria-label={canPreview ? `View image ${label}` : label}
          onClick={() => {
            if (canPreview) setLightboxOpen(true);
          }}
        >
          {label}
        </button>
        {onRemove ? (
          <button
            type="button"
            className="chat-image-chip-remove"
            onClick={onRemove}
            title="Remove image"
            aria-label="Remove image"
          >
            <X {...iconProps({ size: 14 })} />
          </button>
        ) : null}
      </span>

      {lightboxOpen ? (
        <div
          className="chat-image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="chat-image-lightbox-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="chat-image-lightbox-close"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close preview"
            >
              <X {...iconProps({ size: 18 })} />
            </button>
            {loadingPreview ? (
              <p className="chat-image-lightbox-status">Loading…</p>
            ) : lightboxSrc ? (
              <img src={lightboxSrc} alt={label} className="chat-image-lightbox-img" />
            ) : (
              <p className="chat-image-lightbox-status">Image preview is not available.</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
