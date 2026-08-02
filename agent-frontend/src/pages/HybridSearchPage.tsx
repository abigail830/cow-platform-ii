import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Search, Settings2 } from 'lucide-react';
import {
  getHybridSearchPreferences,
  groupKnowledgeBasesByEmbedding,
  listHybridSearchKnowledgeBases,
  patchHybridSearchPreferences,
  runHybridSearch,
  type HybridSearchPreferences,
  type HybridSearchResponse,
  type HybridSearchResult,
  type SearchableKnowledgeBase,
} from '../api/hybridSearch.ts';
import { listModelConfigs } from '../api/models.ts';
import { iconProps } from '../components/icons/icon-props.ts';
import { HybridSearchKbMultiSelect } from '../components/HybridSearchKbMultiSelect.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = getNavPage('/knowledge/hybrid-search')!;

function formatScore(value?: number): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toFixed(4);
}

function ResultCard({ item }: { item: HybridSearchResult }) {
  const debug = item.retrieval_debug;
  return (
    <article className="hybrid-search-result-card">
      <header className="hybrid-search-result-header">
        <div className="hybrid-search-result-badges">
          <span className="kb-status-badge">{item.source_type}</span>
          <span className="admin-muted">{item.knowledge_base_name}</span>
        </div>
        <strong className="hybrid-search-result-score">{formatScore(item.score)}</strong>
      </header>
      {item.source_name ? (
        <p className="hybrid-search-result-source">
          {item.source_name}
          {item.chunk_index != null ? ` · chunk #${item.chunk_index}` : ''}
        </p>
      ) : null}
      <pre className="hybrid-search-result-content">{item.content}</pre>
      {debug ? (
        <p className="hybrid-search-result-debug admin-muted">
          dense {formatScore(debug.dense_score)} · lexical {formatScore(debug.lexical_score)} · rrf{' '}
          {formatScore(debug.rrf_score)} · rerank {formatScore(debug.rerank_score)}
        </p>
      ) : null}
    </article>
  );
}

export function HybridSearchPage() {
  const { user } = useAppOutletContext();
  const canRead = hasPermission(user, 'knowledge-management:hybrid-search', 'read');
  const canWrite = hasPermission(user, 'knowledge-management:hybrid-search', 'write');

  const [knowledgeBases, setKnowledgeBases] = useState<SearchableKnowledgeBase[]>([]);
  const [preferences, setPreferences] = useState<HybridSearchPreferences | null>(null);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<HybridSearchResponse | null>(null);
  const [rerankModels, setRerankModels] = useState<Array<{ id: string; name: string }>>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [error, setError] = useState('');

  const groupedKbs = useMemo(() => groupKnowledgeBasesByEmbedding(knowledgeBases), [knowledgeBases]);
  const selectedGroups = useMemo(() => {
    const selected = new Set(selectedKbIds);
    return groupedKbs.filter((group) => group.items.some((kb) => selected.has(kb.id)));
  }, [groupedKbs, selectedKbIds]);
  const requiresRerank = selectedGroups.length > 1;

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [kbs, prefs, models] = await Promise.all([
        listHybridSearchKnowledgeBases(),
        getHybridSearchPreferences(),
        listModelConfigs({ apiType: 'rerank', limit: 100 }),
      ]);
      setKnowledgeBases(kbs);
      setPreferences(prefs);
      setSelectedKbIds(prefs.selected_knowledge_base_ids);
      setRerankModels(models.models.map((model) => ({ id: model.id, name: model.name })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hybrid search');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void loadPage();
  }, [canRead, loadPage]);

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!preferences || !query.trim() || selectedKbIds.length === 0) return;
    if (requiresRerank && !preferences.rerank_model_config_id) {
      setError('Select a rerank model in Settings when searching across multiple embedding models.');
      setSettingsOpen(true);
      return;
    }

    setSearching(true);
    setError('');
    try {
      const result = await runHybridSearch({
        query: query.trim(),
        knowledge_base_ids: selectedKbIds,
        search_type: preferences.search_type,
        top_k: preferences.top_k,
        settings: {
          bm25_enabled: preferences.bm25_enabled,
          rrf_k: preferences.rrf_k,
          recall_k: preferences.recall_k,
          rerank_model_config_id: preferences.rerank_model_config_id,
          rerank_instruct: preferences.rerank_instruct,
        },
      });
      setResponse(result);
      if (canWrite) {
        await patchHybridSearchPreferences({ selected_knowledge_base_ids: selectedKbIds });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function savePreferences(next: HybridSearchPreferences) {
    if (!canWrite) {
      setPreferences(next);
      setSettingsOpen(false);
      return;
    }
    setSavingPrefs(true);
    setError('');
    try {
      const saved = await patchHybridSearchPreferences(next);
      setPreferences(saved);
      setSettingsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingPrefs(false);
    }
  }

  if (!canRead) return <Navigate to="/agents/playground" replace />;

  return (
    <main className="admin-page hybrid-search-page">
      <header className="admin-header">
        <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
        <AdminPageDescription>
          Search across RAG and FAQ knowledge bases with dense recall, global lexical recall, and rerank.
        </AdminPageDescription>
      </header>

      <form className="hybrid-search-toolbar" onSubmit={(event) => void handleSearch(event)}>
        <div className="hybrid-search-query-wrap">
          <HybridSearchKbMultiSelect
            knowledgeBases={knowledgeBases}
            selectedIds={selectedKbIds}
            onChange={setSelectedKbIds}
            loading={loading}
            disabled={searching}
          />
          <div className="hybrid-search-bar-divider" aria-hidden />
          <Search {...iconProps({ className: 'hybrid-search-query-icon' })} aria-hidden />
          <input
            className="hybrid-search-query-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Enter your search query…"
            aria-label="Search query"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={searching || loading || selectedKbIds.length === 0}>
          {searching ? <Loader2 {...iconProps({ className: 'btn-spinner' })} aria-hidden /> : null}
          Search
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open search settings"
        >
          <Settings2 {...iconProps()} aria-hidden />
          Settings
        </button>
      </form>

      {requiresRerank ? (
        <p className="admin-form-hint hybrid-search-rerank-hint">
          Multiple embedding model groups selected — rerank model is required in Settings.
        </p>
      ) : null}

      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="hybrid-search-results-section">
        <h2 className="hybrid-search-section-title">
          Results{response ? ` (${response.results.length})` : ''}
        </h2>
        {searching ? (
          <p className="admin-muted" role="status">
            Searching…
          </p>
        ) : response ? (
          <>
            <p className="admin-muted">
              {response.meta.kbs_searched} knowledge bases · {response.meta.embedding_groups} embedding groups ·{' '}
              {response.meta.duration_ms} ms
              {response.meta.rerank_failed ? ' · rerank failed, showing fallback ranking' : ''}
            </p>
            {response.results.length === 0 ? (
              <p className="admin-muted">No results.</p>
            ) : (
              <div className="hybrid-search-results">
                {response.results.map((item) => (
                  <ResultCard key={`${item.knowledge_base_id}:${item.source_type}:${item.id}`} item={item} />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="admin-muted">Run a search to see ranked chunks and FAQs.</p>
        )}
      </section>

      {settingsOpen && preferences ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
          <div
            className="modal-card model-config-form hybrid-search-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hybrid-search-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="hybrid-search-settings-title">Search settings</h2>
            <div className="form-grid">
              <label>
                Top K
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={preferences.top_k}
                  onChange={(event) =>
                    setPreferences({ ...preferences, top_k: Number(event.target.value) || 10 })
                  }
                />
              </label>
              <label>
                Recall K (per embedding group)
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={preferences.recall_k}
                  onChange={(event) =>
                    setPreferences({ ...preferences, recall_k: Number(event.target.value) || 25 })
                  }
                />
              </label>
              <label>
                Search type
                <select
                  value={preferences.search_type}
                  onChange={(event) =>
                    setPreferences({
                      ...preferences,
                      search_type: event.target.value as HybridSearchPreferences['search_type'],
                    })
                  }
                >
                  <option value="all">All</option>
                  <option value="chunks">Chunks only</option>
                  <option value="faqs">FAQs only</option>
                </select>
              </label>
              <label>
                Rerank model
                <select
                  value={preferences.rerank_model_config_id ?? ''}
                  onChange={(event) =>
                    setPreferences({
                      ...preferences,
                      rerank_model_config_id: event.target.value || null,
                    })
                  }
                >
                  <option value="">None</option>
                  {rerankModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-grid-full">
                <span className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={preferences.bm25_enabled}
                    onChange={(event) =>
                      setPreferences({ ...preferences, bm25_enabled: event.target.checked })
                    }
                  />
                  Enable lexical (BM25) recall
                </span>
              </label>
              <label className="form-grid-full">
                Rerank instruct (optional)
                <textarea
                  rows={3}
                  value={preferences.rerank_instruct ?? ''}
                  onChange={(event) =>
                    setPreferences({
                      ...preferences,
                      rerank_instruct: event.target.value.trim() ? event.target.value : null,
                    })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setSettingsOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={savingPrefs}
                onClick={() => void savePreferences(preferences)}
              >
                {savingPrefs ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
