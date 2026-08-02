import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import type { KbFaq } from '../api/knowledgeBases.ts';
import { Markdown } from '../chat/Markdown.tsx';
import { iconProps } from './icons/icon-props.ts';

type DetailTab = 'faq' | 'metadata';

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'faq', label: 'FAQ' },
  { id: 'metadata', label: 'Metadata' },
];

type KbFaqDetailPanelProps = {
  faq: KbFaq | null;
  loading: boolean;
  onClose: () => void;
};

function JsonBlock({ data }: { data: unknown }) {
  if (data == null) {
    return <p className="admin-muted">No data</p>;
  }
  return <pre className="kb-item-json">{JSON.stringify(data, null, 2)}</pre>;
}

function indexStatusClass(status: KbFaq['index_status']): string {
  if (status === 'indexed') return 'kb-status-completed';
  if (status === 'failed') return 'kb-status-failed';
  if (status === 'indexing' || status === 'pending') return 'kb-status-pending';
  return '';
}

export function KbFaqDetailPanel({ faq, loading, onClose }: KbFaqDetailPanelProps) {
  const [tab, setTab] = useState<DetailTab>('faq');

  useEffect(() => {
    setTab('faq');
  }, [faq?.id]);

  return (
    <aside className="kb-item-detail-panel">
      <header className="kb-item-detail-header">
        <div className="kb-item-detail-header-text">
          {faq ? (
            <>
              <div className="kb-faq-detail-title-row">
                <h2>{faq.question}</h2>
                {faq.index_status ? (
                  <span className={`kb-status-badge ${indexStatusClass(faq.index_status)}`}>
                    {faq.index_status}
                  </span>
                ) : (
                  <span className="kb-faq-detail-header-muted">Not indexed</span>
                )}
              </div>
              <p className="kb-item-detail-subtitle">
                {[
                  faq.publication_status === 'published' ? 'Published' : 'Draft',
                  faq.source_type === 'extracted' && faq.source_document_name
                    ? faq.source_document_name
                    : faq.source_type === 'manual'
                      ? 'Manual'
                      : null,
                  faq.indexed_at
                    ? `Indexed ${new Date(faq.indexed_at).toLocaleString()}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {faq.index_status === 'failed' && faq.index_error ? (
                <p className="kb-item-status-error kb-faq-detail-header-error" role="alert">
                  {faq.index_error}
                </p>
              ) : null}
            </>
          ) : (
            <h2>FAQ</h2>
          )}
        </div>
        <button type="button" className="session-explorer-close-btn" onClick={onClose} aria-label="Close detail">
          <X {...iconProps()} />
        </button>
      </header>

      <div className="kb-item-detail-tabs" role="tablist" aria-label="FAQ fields">
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
            Loading FAQ…
          </p>
        ) : !faq ? (
          <p className="admin-muted">Select an FAQ to view details.</p>
        ) : tab === 'metadata' ? (
          <JsonBlock data={faq.doc_metadata} />
        ) : (
          <>
            <section className="kb-faq-detail-section">
              <h3 className="kb-faq-detail-label">Question</h3>
              <p className="kb-faq-detail-text">{faq.question}</p>
            </section>

            <section className="kb-faq-detail-section">
              <h3 className="kb-faq-detail-label">Answer</h3>
              <div className="kb-item-markdown">
                <Markdown content={faq.answer} />
              </div>
            </section>

            {faq.source_document_id && faq.source_document_name ? (
              <section className="kb-faq-detail-section">
                <h3 className="kb-faq-detail-label">Source document</h3>
                <Link to={`/knowledge/documents/${faq.source_document_id}`} className="btn-link">
                  {faq.source_document_name}
                </Link>
              </section>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
