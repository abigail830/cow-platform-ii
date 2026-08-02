import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getKnowledgeBase, type KnowledgeBase } from '../api/knowledgeBases.ts';
import { KbPageLoadingState } from '../components/KbPageLoadingState.tsx';
import { FaqKnowledgeBaseDetailPage } from './FaqKnowledgeBaseDetailPage.tsx';
import { KnowledgeBaseDetailPage } from './KnowledgeBaseDetailPage.tsx';
import { RagKnowledgeBaseDetailPage } from './RagKnowledgeBaseDetailPage.tsx';

function RouterLoadingState() {
  return (
    <main className="admin-page kb-page kb-detail-page">
      <Link to="/knowledge/knowledge-bases" className="kb-back-link">← Knowledge bases</Link>
      <KbPageLoadingState label="Loading knowledge base…" />
    </main>
  );
}

export function KnowledgeBaseDetailRouter() {
  const { knowledgeBaseId } = useParams<{ knowledgeBaseId: string }>();
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!knowledgeBaseId) {
      setLoading(false);
      setKb(null);
      setError('');
      setNotFound(false);
      setForbidden(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setNotFound(false);
    setForbidden(false);

    void getKnowledgeBase(knowledgeBaseId)
      .then((row) => {
        if (cancelled) return;
        setKb(row);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setKb(null);
        if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
          setForbidden(true);
          return;
        }
        if (message.toLowerCase().includes('not found') || message.includes('404')) {
          setNotFound(true);
          return;
        }
        setError(message || 'Failed to load knowledge base');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [knowledgeBaseId]);

  if (forbidden) {
    return <Navigate to="/agents/playground" replace />;
  }

  if (!knowledgeBaseId || notFound) {
    return <Navigate to="/knowledge/knowledge-bases" replace />;
  }

  if (loading) {
    return <RouterLoadingState />;
  }

  if (!kb) {
    return (
      <main className="admin-page kb-page kb-detail-page">
        <Link to="/knowledge/knowledge-bases" className="kb-back-link">← Knowledge bases</Link>
        <p className="admin-error" role="alert">
          {error || 'Failed to load knowledge base.'}
        </p>
      </main>
    );
  }

  if (kb.type === 'rag') {
    return <RagKnowledgeBaseDetailPage initialKb={kb} />;
  }

  if (kb.type === 'faq') {
    return <FaqKnowledgeBaseDetailPage initialKb={kb} />;
  }

  return <KnowledgeBaseDetailPage initialKb={kb} />;
}
