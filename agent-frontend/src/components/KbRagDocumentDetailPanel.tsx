import { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { KbDocumentChunks } from '../api/knowledgeBases.ts';
import { Markdown } from '../chat/Markdown.tsx';
import { iconProps } from './icons/icon-props.ts';

type DetailTab = 'chunks' | 'metadata';

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'chunks', label: 'Chunks' },
  { id: 'metadata', label: 'Metadata' },
];

type KbRagDocumentDetailPanelProps = {
  detail: KbDocumentChunks | null;
  loading: boolean;
  onClose: () => void;
};

function chunkHeading(chunkMetadata: Record<string, unknown> | null): string | null {
  const heading = chunkMetadata?.heading;
  return typeof heading === 'string' && heading.trim() ? heading.trim() : null;
}

function JsonBlock({ data }: { data: unknown }) {
  if (data == null) {
    return <p className="admin-muted">No data</p>;
  }
  return <pre className="kb-item-json">{JSON.stringify(data, null, 2)}</pre>;
}

export function KbRagDocumentDetailPanel({ detail, loading, onClose }: KbRagDocumentDetailPanelProps) {
  const [tab, setTab] = useState<DetailTab>('chunks');
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);

  const docMetadata = useMemo(() => {
    if (!detail?.items.length) return null;
    return detail.items.find((chunk) => chunk.doc_metadata)?.doc_metadata ?? null;
  }, [detail]);

  return (
    <aside className="kb-item-detail-panel">
      <header className="kb-item-detail-header">
        <div className="kb-item-detail-header-text">
          <h2>{detail?.document_name ?? 'Indexed document'}</h2>
          {detail && (
            <p className="kb-item-detail-subtitle">
              {detail.channel_path || '—'} · {detail.chunk_count} chunks · {detail.document_id}
            </p>
          )}
        </div>
        <button type="button" className="session-explorer-close-btn" onClick={onClose} aria-label="Close detail">
          <X {...iconProps()} />
        </button>
      </header>

      <div className="kb-item-detail-tabs" role="tablist" aria-label="Indexed document fields">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`kb-item-detail-tab${tab === entry.id ? ' active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="kb-item-detail-body">
        {loading ? (
          <p className="session-explorer-loading" role="status">
            <Loader2 {...iconProps({ size: 18, className: 'session-explorer-loading-icon' })} aria-hidden />
            Loading chunks…
          </p>
        ) : !detail ? (
          <p className="admin-muted">Select a document to view chunks.</p>
        ) : tab === 'metadata' ? (
          <JsonBlock data={docMetadata} />
        ) : detail.items.length === 0 ? (
          <p className="admin-muted">No chunks indexed for this document.</p>
        ) : (
          <ul className="kb-chunk-list">
            {detail.items.map((chunk) => {
              const heading = chunkHeading(chunk.chunk_metadata);
              const expanded = expandedChunkId === chunk.id;
              const preview =
                chunk.content.length > 180 ? `${chunk.content.slice(0, 180).trim()}…` : chunk.content;

              return (
                <li key={chunk.id} className={`kb-chunk-card${expanded ? ' expanded' : ''}`}>
                  <button
                    type="button"
                    className="kb-chunk-card-header"
                    aria-expanded={expanded}
                    onClick={() => setExpandedChunkId(expanded ? null : chunk.id)}
                  >
                    <span className="kb-chunk-index">#{chunk.chunk_index}</span>
                    <span className="kb-chunk-title">{heading || preview || 'Chunk'}</span>
                    <span className="kb-chunk-meta">
                      {chunk.content.length.toLocaleString()} chars
                    </span>
                  </button>
                  {expanded ? (
                    <div className="kb-chunk-card-body">
                      {chunk.chunk_metadata ? (
                        <pre className="kb-chunk-metadata">{JSON.stringify(chunk.chunk_metadata, null, 2)}</pre>
                      ) : null}
                      <div className="kb-item-markdown">
                        <Markdown content={chunk.content} />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
