import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { SourceRef } from '../shared/source-ref.ts';
import { formatSourceLabel } from '../shared/source-ref.ts';
import { iconProps } from './icons/icon-props.ts';

export function SourceRefLinks({ source }: { source: SourceRef }) {
  return (
    <div className="source-ref-links">
      <Link to={source.parsed_url} className="source-ref-link">
        <ExternalLink {...iconProps({ size: 14 })} aria-hidden />
        <span>{formatSourceLabel(source)}</span>
      </Link>
      <Link to={source.original_url} className="source-ref-link source-ref-link-secondary">
        Original
      </Link>
    </div>
  );
}
