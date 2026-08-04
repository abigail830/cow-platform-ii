import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { CircleHelp, Loader2, Search, Settings2 } from 'lucide-react';
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
import { HybridSearchSourcePreview } from '../components/HybridSearchSourcePreview.tsx';
import { SourceRefLinks } from '../components/SourceRefLinks.tsx';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';
import {
  defaultSourcePreviewView,
  sourcePreviewKey,
  type SourcePreviewSelection,
  type SourcePreviewView,
} from '../shared/source-ref.ts';

const PAGE = getNavPage('/knowledge/hybrid-search')!;

type SettingsTab = 'retrieval' | 'rerank';

function formatScore(value?: number): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toFixed(4);
}

function SettingsFieldTooltip({ label, text }: { label: string; text: string }) {
  return (
    <span className="field-tooltip">
      <button type="button" className="field-tooltip-trigger" aria-label={`${label} help`}>
        <CircleHelp {...iconProps({ size: 14 })} aria-hidden />
      </button>
      <span className="field-tooltip-panel" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function ResultScoresHelpTooltip() {
  return (
    <span className="field-tooltip hybrid-search-results-scores-tooltip">
      <button type="button" className="field-tooltip-trigger" aria-label="Result score legend">
        <CircleHelp {...iconProps({ size: 14 })} aria-hidden />
      </button>
      <span className="field-tooltip-panel" role="tooltip">
        <ul className="field-tooltip-list field-tooltip-list-compact hybrid-search-results-scores-list">
          <li>
            <strong>dense</strong>
            <span>Vector similarity from embedding search.</span>
          </li>
          <li>
            <strong>lexical</strong>
            <span>BM25 keyword match (full-text search).</span>
          </li>
          <li>
            <strong>rrf</strong>
            <span>Rank fusion score combining dense and lexical order.</span>
          </li>
          <li>
            <strong>rerank</strong>
            <span>Final relevance from the rerank model (orange score).</span>
          </li>
        </ul>
      </span>
    </span>
  );
}

function SettingsInlineRow({
  label,
  tooltip,
  control,
}: {
  label: string;
  tooltip: string;
  control: ReactNode;
}) {
  return (
    <div className="hybrid-search-settings-inline-row">
      <div className="hybrid-search-settings-inline-label">
        <span className="form-field-label-row">
          <span>{label}</span>
          <SettingsFieldTooltip label={label} text={tooltip} />
        </span>
      </div>
      <div className="hybrid-search-settings-inline-control">{control}</div>
    </div>
  );
}

function SettingsNumberRow({
  id,
  label,
  tooltip,
  value,
  min,
  max,
  fallback,
  onChange,
}: {
  id: string;
  label: string;
  tooltip: string;
  value: number;
  min: number;
  max: number;
  fallback: number;
  onChange: (value: number) => void;
}) {
  return (
    <SettingsInlineRow
      label={label}
      tooltip={tooltip}
      control={
        <input
          id={id}
          className="hybrid-search-settings-inline-input"
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || fallback)}
          aria-label={label}
        />
      }
    />
  );
}

function RecallScores({ debug }: { debug?: HybridSearchResult['retrieval_debug'] }) {
  return (
    <div className="hybrid-search-result-recall-scores" aria-label="Retrieval scores">
      <span className="hybrid-search-recall-cell">
        <span className="hybrid-search-recall-label">dense</span>
        <span className="hybrid-search-recall-value">{formatScore(debug?.dense_score)}</span>
      </span>
      <span className="hybrid-search-recall-sep" aria-hidden>
        ·
      </span>
      <span className="hybrid-search-recall-cell">
        <span className="hybrid-search-recall-label">lexical</span>
        <span className="hybrid-search-recall-value">{formatScore(debug?.lexical_score)}</span>
      </span>
      <span className="hybrid-search-recall-sep" aria-hidden>
        ·
      </span>
      <span className="hybrid-search-recall-cell">
        <span className="hybrid-search-recall-label">rrf</span>
        <span className="hybrid-search-recall-value">{formatScore(debug?.rrf_score)}</span>
      </span>
    </div>
  );
}

function ResultCard({
  item,
  onPreview,
  activePreviewKey,
  isPreviewTarget,
}: {
  item: HybridSearchResult;
  onPreview?: (source: NonNullable<HybridSearchResult['source']>, view: SourcePreviewView) => void;
  activePreviewKey?: string | null;
  isPreviewTarget?: boolean;
}) {
  const debug = item.retrieval_debug;

  return (
    <article
      className={`hybrid-search-result-card${isPreviewTarget ? ' is-preview-target' : ''}`}
    >
      <div className="hybrid-search-result-summary">
        <div className="hybrid-search-result-summary-left">
          <div className="hybrid-search-result-summary-line1">
            <span
              className={`kb-status-badge hybrid-search-source-badge hybrid-search-source-badge--${item.source_type}`}
            >
              {item.source_type}
            </span>
            <span className="hybrid-search-result-kb">{item.knowledge_base_name}</span>
          </div>
          {item.source ? (
            <div className="hybrid-search-result-summary-line2">
              <SourceRefLinks
                source={item.source}
                onPreview={
                  onPreview
                    ? (source, view) => {
                        onPreview(source, view);
                      }
                    : undefined
                }
                activePreviewKey={activePreviewKey}
              />
            </div>
          ) : null}
        </div>
        <RecallScores debug={debug} />
        <div className="hybrid-search-result-summary-side">
          <strong className="hybrid-search-result-score" title="Final score">
            {formatScore(item.score)}
          </strong>
        </div>
      </div>
    </article>
  );
}

export function HybridSearchPage() {
  const { user } = useAppOutletContext();
  const canAccess = hasPermission(user, 'knowledge-management:hybrid-search', 'read');

  const [knowledgeBases, setKnowledgeBases] = useState<SearchableKnowledgeBase[]>([]);
  const [preferences, setPreferences] = useState<HybridSearchPreferences | null>(null);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<HybridSearchResponse | null>(null);
  const [rerankModels, setRerankModels] = useState<Array<{ id: string; name: string; isDefault: boolean }>>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<HybridSearchPreferences | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('retrieval');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [error, setError] = useState('');
  const [previewSelection, setPreviewSelection] = useState<SourcePreviewSelection | null>(null);
  const [previewResultKey, setPreviewResultKey] = useState<string | null>(null);

  const previewOpen = previewSelection != null;
  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('hybrid-search-split', 48, {
    minPct: 28,
    maxPct: 72,
  });
  const activePreviewKey = previewSelection
    ? sourcePreviewKey(previewSelection.source, previewSelection.view)
    : null;

  const openPreview = useCallback(
    (resultKey: string, source: NonNullable<HybridSearchResult['source']>, view?: SourcePreviewView) => {
      setPreviewResultKey(resultKey);
      setPreviewSelection({
        source,
        view: view ?? defaultSourcePreviewView(source),
      });
    },
    [],
  );

  const handlePreviewViewChange = useCallback((view: SourcePreviewView) => {
    setPreviewSelection((current) => (current ? { ...current, view } : current));
  }, []);

  const closePreview = useCallback(() => {
    setPreviewSelection(null);
    setPreviewResultKey(null);
  }, []);

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
      setRerankModels(
        models.models.map((model) => ({
          id: model.id,
          name: model.name,
          isDefault: model.isDefault,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hybrid search');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void loadPage();
  }, [canAccess, loadPage]);

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!preferences || !query.trim() || selectedKbIds.length === 0) return;
    if (requiresRerank && !preferences.rerank_model_config_id) {
      setError('Select a rerank model in Settings when searching across multiple embedding models.');
      if (preferences) {
        setSettingsDraft({ ...preferences });
        setSettingsTab('rerank');
        setSettingsOpen(true);
      }
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
      closePreview();
      try {
        await patchHybridSearchPreferences({ selected_knowledge_base_ids: selectedKbIds });
      } catch (prefErr) {
        console.warn('Failed to save hybrid search KB selection:', prefErr);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  function openSettings() {
    if (!preferences) return;
    setSettingsDraft({ ...preferences });
    setSettingsTab('retrieval');
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsOpen(false);
    setSettingsDraft(null);
    setSettingsTab('retrieval');
  }

  async function savePreferences(next: HybridSearchPreferences) {
    setSavingPrefs(true);
    setError('');
    try {
      const saved = await patchHybridSearchPreferences(next);
      setPreferences(saved);
      closeSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingPrefs(false);
    }
  }

  if (!canAccess) return <Navigate to="/agents/playground" replace />;

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
          className="btn-dark hybrid-search-settings-btn"
          onClick={openSettings}
          disabled={!preferences}
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

      <div
        ref={containerRef}
        className={`hybrid-search-workspace${previewOpen ? ' has-preview' : ''}`}
        style={previewOpen ? { ['--hybrid-search-left-pct' as string]: `${leftPct}%` } : undefined}
      >
        <section className="hybrid-search-results-section">
          <h2 className="hybrid-search-section-title hybrid-search-section-title-row">
            <span>Results{response ? ` (${response.results.length})` : ''}</span>
            <ResultScoresHelpTooltip />
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
              </p>
              {response.results.length === 0 ? (
                <p className="admin-muted">No results.</p>
              ) : (
                <div className="hybrid-search-results">
                  {response.results.map((item) => {
                    const resultKey = `${item.knowledge_base_id}:${item.source_type}:${item.id}`;
                    return (
                      <ResultCard
                        key={resultKey}
                        item={item}
                        onPreview={
                          item.source
                            ? (source, view) => openPreview(resultKey, source, view)
                            : undefined
                        }
                        activePreviewKey={activePreviewKey}
                        isPreviewTarget={previewResultKey === resultKey}
                      />
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="admin-muted">Run a search to see ranked chunks and FAQs.</p>
          )}
        </section>

        {previewOpen && previewSelection ? (
          <>
            <div
              className="hybrid-search-split-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panels"
              onMouseDown={onHandleMouseDown}
            />
            <HybridSearchSourcePreview
              selection={previewSelection}
              onClose={closePreview}
              onViewChange={handlePreviewViewChange}
            />
          </>
        ) : null}
      </div>

      {settingsOpen && settingsDraft ? (
        <div className="modal-backdrop" role="presentation" onClick={closeSettings}>
          <div
            className="modal-card model-config-form hybrid-search-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hybrid-search-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="hybrid-search-settings-title">Search settings</h2>

            <div className="modal-tabs" role="tablist" aria-label="Search settings">
              <button
                type="button"
                role="tab"
                aria-selected={settingsTab === 'retrieval'}
                className={`modal-tab${settingsTab === 'retrieval' ? ' active' : ''}`}
                onClick={() => setSettingsTab('retrieval')}
              >
                Retrieval
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={settingsTab === 'rerank'}
                className={`modal-tab${settingsTab === 'rerank' ? ' active' : ''}`}
                onClick={() => setSettingsTab('rerank')}
              >
                Rerank
              </button>
            </div>

            <div className="hybrid-search-settings-body">
              {settingsTab === 'retrieval' ? (
                <div className="hybrid-search-settings-fields">
                  <SettingsNumberRow
                    id="hybrid-recall-k"
                    label="Recall K (per embedding group)"
                    tooltip="Candidates per dense/lexical path before fusion."
                    value={settingsDraft.recall_k}
                    min={1}
                    max={100}
                    fallback={25}
                    onChange={(recall_k) => setSettingsDraft({ ...settingsDraft, recall_k })}
                  />
                  <SettingsNumberRow
                    id="hybrid-top-k"
                    label="Top K"
                    tooltip="Final number of results returned."
                    value={settingsDraft.top_k}
                    min={1}
                    max={50}
                    fallback={10}
                    onChange={(top_k) => setSettingsDraft({ ...settingsDraft, top_k })}
                  />
                  <SettingsInlineRow
                    label="Search type"
                    tooltip="Limit retrieval to document chunks, FAQ entries, or both."
                    control={
                      <select
                        id="hybrid-search-type"
                        className="hybrid-search-settings-inline-select"
                        value={settingsDraft.search_type}
                        onChange={(event) =>
                          setSettingsDraft({
                            ...settingsDraft,
                            search_type: event.target.value as HybridSearchPreferences['search_type'],
                          })
                        }
                        aria-label="Search type"
                      >
                        <option value="all">All</option>
                        <option value="chunks">Chunks only</option>
                        <option value="faqs">FAQs only</option>
                      </select>
                    }
                  />
                  <SettingsInlineRow
                    label="Enable lexical (BM25) recall"
                    tooltip="Run global BM25 lexical recall in parallel with dense vector search before fusion."
                    control={
                      <input
                        id="hybrid-bm25-enabled"
                        type="checkbox"
                        className="brand-checkbox"
                        checked={settingsDraft.bm25_enabled}
                        onChange={(event) =>
                          setSettingsDraft({ ...settingsDraft, bm25_enabled: event.target.checked })
                        }
                        aria-label="Enable lexical (BM25) recall"
                      />
                    }
                  />
                </div>
              ) : (
                <div className="form-grid">
                  <label className="form-field form-field-wide">
                    <span>Rerank model</span>
                    <select
                      value={settingsDraft.rerank_model_config_id ?? ''}
                      onChange={(event) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          rerank_model_config_id: event.target.value || null,
                        })
                      }
                    >
                      <option value="">None (skip rerank)</option>
                      {rerankModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                          {model.isDefault ? ' (platform default)' : ''}
                        </option>
                      ))}
                    </select>
                    <span className="admin-form-hint">
                      Required when searching across multiple embedding model groups.
                    </span>
                  </label>
                  <label className="form-field form-field-wide">
                    <span>Rerank instruct (optional)</span>
                    <textarea
                      rows={4}
                      value={settingsDraft.rerank_instruct ?? ''}
                      placeholder="Optional instruction passed to the rerank model."
                      onChange={(event) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          rerank_instruct: event.target.value.trim() ? event.target.value : null,
                        })
                      }
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={closeSettings}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={savingPrefs}
                onClick={() => void savePreferences(settingsDraft)}
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
