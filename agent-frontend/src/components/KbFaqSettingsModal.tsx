import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  updateKnowledgeBase,
  type KbFaqSettings,
  type KnowledgeBase,
} from '../api/knowledgeBases.ts';
import {
  fetchBuiltinAgentOptions,
  resolveBuiltinAgentSelectValue,
} from '../api/builtinAgents.ts';
import type { ModelConfig } from '../api/models.ts';

type SettingsTab = 'indexing' | 'ai';

type KbFaqSettingsModalProps = {
  kb: KnowledgeBase;
  embeddingModels: ModelConfig[];
  onCancel: () => void;
  onSaved: (kb: KnowledgeBase) => void;
};

export function KbFaqSettingsModal({
  kb,
  embeddingModels,
  onCancel,
  onSaved,
}: KbFaqSettingsModalProps) {
  const settings = kb.faq_settings ?? {};
  const [tab, setTab] = useState<SettingsTab>('indexing');
  const [embeddingModelId, setEmbeddingModelId] = useState(kb.embedding_model_config_id ?? '');
  const [embeddingDimensions, setEmbeddingDimensions] = useState(kb.embedding_dimensions ?? 1024);
  const [metadataKeysText, setMetadataKeysText] = useState((kb.metadata_keys ?? []).join(', '));
  const [autoIndexOnPublish, setAutoIndexOnPublish] = useState(
    settings.auto_index_on_publish ?? false,
  );
  const [extractionAgentId, setExtractionAgentId] = useState('');
  const [polishAgentId, setPolishAgentId] = useState('');
  const [extractOptions, setExtractOptions] = useState<
    Awaited<ReturnType<typeof fetchBuiltinAgentOptions>>['agents']
  >([]);
  const [polishOptions, setPolishOptions] = useState<
    Awaited<ReturnType<typeof fetchBuiltinAgentOptions>>['agents']
  >([]);
  const [optionsError, setOptionsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchBuiltinAgentOptions('faq_extract'), fetchBuiltinAgentOptions('faq_polish')])
      .then(([extract, polish]) => {
        if (cancelled) return;
        setExtractOptions(extract.agents);
        setPolishOptions(polish.agents);
        const nextSettings = kb.faq_settings ?? {};
        setExtractionAgentId(
          resolveBuiltinAgentSelectValue(
            nextSettings.extraction_agent_def_id,
            extract.agents,
            extract.platform_default_agent_id,
          ),
        );
        setPolishAgentId(
          resolveBuiltinAgentSelectValue(
            nextSettings.polish_agent_def_id,
            polish.agents,
            polish.platform_default_agent_id,
          ),
        );
        setOptionsError('');
      })
      .catch((err) => {
        if (!cancelled) {
          setOptionsError(err instanceof Error ? err.message : 'Failed to load agent options');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kb]);

  useEffect(() => {
    const nextSettings = kb.faq_settings ?? {};
    setEmbeddingModelId(kb.embedding_model_config_id ?? '');
    setEmbeddingDimensions(kb.embedding_dimensions ?? 1024);
    setMetadataKeysText((kb.metadata_keys ?? []).join(', '));
    setAutoIndexOnPublish(nextSettings.auto_index_on_publish ?? false);
    setError('');
  }, [kb]);

  const defaultEmbeddingModel = embeddingModels.find((model) => model.isDefault) ?? null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const metadataKeys = metadataKeysText
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const faqSettings: KbFaqSettings = {
        auto_index_on_publish: autoIndexOnPublish,
        extraction_agent_def_id: extractionAgentId || null,
        polish_agent_def_id: polishAgentId || null,
      };
      const updated = await updateKnowledgeBase(kb.id, {
        embedding_model_config_id: embeddingModelId || null,
        embedding_dimensions: embeddingDimensions,
        metadata_keys: metadataKeys,
        faq_settings: faqSettings,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card model-config-form kb-faq-settings-modal"
        role="dialog"
        aria-labelledby="kb-faq-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="kb-faq-settings-title">FAQ settings</h2>
        {error && <p className="admin-error" role="alert">{error}</p>}
        {optionsError && <p className="admin-error" role="alert">{optionsError}</p>}

        <div className="modal-tabs" role="tablist" aria-label="FAQ settings">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'indexing'}
            className={`modal-tab${tab === 'indexing' ? ' active' : ''}`}
            onClick={() => setTab('indexing')}
          >
            Indexing
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ai'}
            className={`modal-tab${tab === 'ai' ? ' active' : ''}`}
            onClick={() => setTab('ai')}
          >
            Builtin agents
          </button>
        </div>

        <form className="form-grid kb-faq-settings-form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="kb-faq-settings-tab-body">
          {tab === 'indexing' ? (
            <>
              <label className="form-field form-field-wide">
                <span>Embedding model</span>
                <select
                  value={embeddingModelId}
                  onChange={(e) => setEmbeddingModelId(e.target.value)}
                  required
                >
                  <option value="">Select a model…</option>
                  {embeddingModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.modelId}){model.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
                <span className="admin-form-hint kb-rag-form-hint">
                  {defaultEmbeddingModel
                    ? `Default: ${defaultEmbeddingModel.name}. Configure models under Admin → Models.`
                    : 'Configure embedding models under Admin → Models.'}
                </span>
              </label>
              <label className="form-field">
                <span>Vector dimensions</span>
                <input
                  type="number"
                  min={1}
                  max={65536}
                  value={embeddingDimensions}
                  onChange={(e) => setEmbeddingDimensions(Number(e.target.value))}
                  required
                />
              </label>
              <label className="form-field form-field-wide">
                <span>Metadata keys (comma-separated)</span>
                <input
                  value={metadataKeysText}
                  onChange={(e) => setMetadataKeysText(e.target.value)}
                  placeholder="e.g. author, tags"
                />
              </label>
              <label className="form-field form-field-wide kb-faq-checkbox-field">
                <span className="kb-faq-checkbox-label">
                  <input
                    type="checkbox"
                    className="brand-checkbox"
                    checked={autoIndexOnPublish}
                    onChange={(e) => setAutoIndexOnPublish(e.target.checked)}
                  />
                  Auto-index on publish
                </span>
                <span className="admin-form-hint">
                  When enabled, publishing an FAQ automatically queues indexing.
                </span>
              </label>
            </>
          ) : (
            <>
              <div className="kb-faq-settings-agent-fields form-field-wide">
              <label className="form-field">
                <span>FAQ extraction agent</span>
                <select
                  value={extractionAgentId}
                  onChange={(e) => setExtractionAgentId(e.target.value)}
                  required
                >
                  {extractOptions.length === 0 ? (
                    <option value="">No agents available</option>
                  ) : (
                    extractOptions.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                        {agent.model_name ? ` (${agent.model_name})` : ''}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="form-field">
                <span>FAQ polish agent</span>
                <select
                  value={polishAgentId}
                  onChange={(e) => setPolishAgentId(e.target.value)}
                  required
                >
                  {polishOptions.length === 0 ? (
                    <option value="">No agents available</option>
                  ) : (
                    polishOptions.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                        {agent.model_name ? ` (${agent.model_name})` : ''}
                      </option>
                    ))
                  )}
                </select>
              </label>
              </div>
              <p className="admin-form-hint kb-faq-settings-hint form-field-wide">
                Edit prompts and models in{' '}
                <Link
                  to="/admin/builtin-agents"
                  target="_blank"
                  rel="noreferrer"
                  className="kb-faq-settings-hint-link"
                >
                  Platform → Builtin agents
                </Link>
                .
              </p>
            </>
          )}

          </div>

          <div className="modal-actions form-field-wide kb-faq-settings-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
