import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { SourceRef } from '../shared/source-ref.ts';
import {
  formatSourceLabel,
  resolveSourcePreviewUrl,
  supportsUdocViewer,
} from '../shared/source-ref.ts';
import { iconProps } from './icons/icon-props.ts';

export function SourceRefLinks({ source }: { source: SourceRef }) {
  const previewUrl = resolveSourcePreviewUrl(source);
  const showParsedLink = supportsUdocViewer(source.file_type);

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
