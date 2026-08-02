import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { getKnowledgeBase, type KnowledgeBase } from '../api/knowledgeBases.ts';
import { KnowledgeBaseDetailPage } from './KnowledgeBaseDetailPage.tsx';
import { RagKnowledgeBaseDetailPage } from './RagKnowledgeBaseDetailPage.tsx';

export function KnowledgeBaseDetailRouter() {
  const { knowledgeBaseId } = useParams<{ knowledgeBaseId: string }>();
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!knowledgeBaseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void getKnowledgeBase(knowledgeBaseId)
      .then((row) => {
        setKb(row);
        setNotFound(false);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
          setForbidden(true);
        } else if (message.toLowerCase().includes('not found') || message.includes('404')) {
          setNotFound(true);
        }
        setKb(null);
      })
      .finally(() => setLoading(false));
  }, [knowledgeBaseId]);

  if (forbidden) {
    return <Navigate to="/agents/playground" replace />;
  }

  if (!knowledgeBaseId || notFound) {
    return <Navigate to="/knowledge/knowledge-bases" replace />;
  }

  if (loading) {
    return (
      <main className="admin-page kb-page">
        <p className="admin-muted">Loading…</p>
      </main>
    );
  }

  if (kb?.type === 'rag') {
    return <RagKnowledgeBaseDetailPage initialKb={kb} />;
  }

  return <KnowledgeBaseDetailPage />;
}
