import { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { KbItem } from '../api/knowledgeBases.ts';
import { Markdown } from '../chat/Markdown.tsx';
import { MindmapMetadataPanel, parseMindmapParsingResult } from './MindmapMetadataPanel.tsx';
import { PageIndexTreePanel, type PageIndexTree } from './PageIndexTree.tsx';
import { iconProps } from './icons/icon-props.ts';

type DetailTab = 'metadata' | 'page_index' | 'markdown' | 'parsing_result';

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'metadata', label: 'Metadata' },
  { id: 'page_index', label: 'Page index' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'parsing_result', label: 'Parse result' },
];

type KbItemDetailPanelProps = {
  item: KbItem | null;
  loading: boolean;
  onClose: () => void;
};

function JsonBlock({ data }: { data: unknown }) {
  if (data == null) {
    return <p className="admin-muted">No data</p>;
  }
  return <pre className="kb-item-json">{JSON.stringify(data, null, 2)}</pre>;
}

export function KbItemDetailPanel({ item, loading, onClose }: KbItemDetailPanelProps) {
  const [tab, setTab] = useState<DetailTab>('metadata');

  const pageIndex = (item?.page_index as PageIndexTree | null) ?? null;
  const mindmap = useMemo(
    () => (item?.parsing_result ? parseMindmapParsingResult(item.parsing_result) : null),
    [item?.parsing_result],
  );

  return (
    <aside className="kb-item-detail-panel">
      <header className="kb-item-detail-header">
        <div className="kb-item-detail-header-text">
          <h2>{item?.document_name ?? 'Knowledge item'}</h2>
          {item && (
            <p className="kb-item-detail-subtitle">
              {item.channel_path || '—'} · {item.document_id}
            </p>
          )}
        </div>
        <button type="button" className="session-explorer-close-btn" onClick={onClose} aria-label="Close detail">
          <X {...iconProps()} />
        </button>
      </header>

      <div className="kb-item-detail-tabs" role="tablist" aria-label="Knowledge item fields">
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
            Loading item…
          </p>
        ) : !item ? (
          <p className="admin-muted">Select an item to view details.</p>
        ) : tab === 'metadata' ? (
          <JsonBlock data={item.metadata} />
        ) : tab === 'page_index' ? (
          pageIndex?.structure?.length ? (
            <PageIndexTreePanel
              tree={pageIndex}
              activeNodeId={null}
              onSelectNode={() => undefined}
            />
          ) : (
            <JsonBlock data={item.page_index} />
          )
        ) : tab === 'markdown' ? (
          item.markdown?.trim() ? (
            <div className="kb-item-markdown">
              <Markdown content={item.markdown} />
            </div>
          ) : (
            <p className="admin-muted">No markdown</p>
          )
        ) : mindmap ? (
          <MindmapMetadataPanel parsingResult={mindmap} />
        ) : (
          <JsonBlock data={item.parsing_result} />
        )}
      </div>
    </aside>
  );
}
