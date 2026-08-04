import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { SourceRef } from '../shared/source-ref.ts';
import {
  defaultSourcePreviewView,
  formatSourceLabel,
  resolveSourcePreviewUrl,
  sourcePreviewKey,
  supportsUdocViewer,
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
  const showParsedLink = supportsUdocViewer(source.file_type);
  const primaryView = defaultSourcePreviewView(source);
  const primaryKey = sourcePreviewKey(source, primaryView);
  const parsedKey = sourcePreviewKey(source, 'parsed');

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
        {showParsedLink ? (
          <button
            type="button"
            className={`source-ref-link source-ref-link-secondary source-ref-link-button${
              activePreviewKey === parsedKey ? ' is-active' : ''
            }`}
            onClick={() => onPreview(source, 'parsed')}
          >
            Parsed
          </button>
        ) : null}
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
      {showParsedLink ? (
        <Link to={source.parsed_url} className="source-ref-link source-ref-link-secondary">
          Parsed
        </Link>
      ) : null}
    </div>
  );
}
