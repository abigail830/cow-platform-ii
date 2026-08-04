import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { SourceRef } from '../shared/source-ref.ts';
import {
  defaultSourcePreviewView,
  formatSourceLabel,
  resolveSourcePreviewUrl,
  sourcePreviewKey,
  type SourcePreviewView,
} from '../shared/source-ref.ts';
import { iconProps } from './icons/icon-props.ts';

type SourceRefLinksProps = {
  source: SourceRef;
  /** Inline preview in the current page instead of navigating away. */
  onPreview?: (source: SourceRef, view: SourcePreviewView) => void;
  activePreviewKey?: string | null;
};

export function SourceRefLinks({ source, onPreview, activePreviewKey }: SourceRefLinksProps) {
  const primaryView = defaultSourcePreviewView(source);
  const primaryKey = sourcePreviewKey(source, primaryView);

  if (onPreview) {
    return (
      <div className="source-ref-links">
        <button
          type="button"
          className={`source-ref-link source-ref-link-button${activePreviewKey === primaryKey ? ' is-active' : ''}`}
          onClick={() => onPreview(source, primaryView)}
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
      <Link to={previewUrl} className="source-ref-link">
        <ExternalLink {...iconProps({ size: 14 })} aria-hidden />
        <span>{formatSourceLabel(source)}</span>
      </Link>
    </div>
  );
}
