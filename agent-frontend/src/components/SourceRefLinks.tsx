import { ExternalLink } from 'lucide-react';
import type { SourceRef } from '../shared/source-ref.ts';
import { formatSourceLabel, resolveSourcePreviewUrl, sourcePreviewKey } from '../shared/source-ref.ts';
import { iconProps } from './icons/icon-props.ts';

type SourceRefLinksProps = {
  source: SourceRef;
  /** Inline preview in the current page instead of navigating away. */
  onPreview?: (source: SourceRef) => void;
  activePreviewKey?: string | null;
};

export function SourceRefLinks({ source, onPreview, activePreviewKey }: SourceRefLinksProps) {
  const previewKey = sourcePreviewKey(source);

  if (onPreview) {
    return (
      <div className="source-ref-links">
        <button
          type="button"
          className={`source-ref-link source-ref-link-button${activePreviewKey === previewKey ? ' is-active' : ''}`}
          onClick={() => onPreview(source)}
        >
          <ExternalLink {...iconProps({ size: 14 })} aria-hidden />
          <span>{formatSourceLabel(source)}</span>
        </button>
      </div>
    );
  }

  const previewUrl = resolveSourcePreviewUrl(source);

  return (
    <div className="source-ref-links">
      <a href={previewUrl} className="source-ref-link">
        <ExternalLink {...iconProps({ size: 14 })} aria-hidden />
        <span>{formatSourceLabel(source)}</span>
      </a>
    </div>
  );
}
