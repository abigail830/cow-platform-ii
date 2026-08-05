import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchFaqProcessingOptions,
  updateKnowledgeBase,
  type FaqPipelineOption,
  type FaqProcessingOptions,
  type KbFaqSettings,
  type KnowledgeBase,
} from '../api/knowledgeBases.ts';
import {
  fetchBuiltinAgentOptions,
  resolveBuiltinAgentSelectValue,
} from '../api/builtinAgents.ts';

type SettingsTab = 'extract' | 'indexing' | 'polish';

type KbFaqSettingsModalProps = {
  kb: KnowledgeBase;
  onCancel: () => void;
  onSaved: (kb: KnowledgeBase) => void;
};

function resolvePipelineSelectValue(
  configuredId: string | null | undefined,
  options: FaqPipelineOption[],
  defaultId: string | null,
): string {
  if (configuredId && options.some((p) => p.id === configuredId)) return configuredId;
  if (defaultId && options.some((p) => p.id === defaultId)) return defaultId;
  return options[0]?.id ?? '';
}

function pipelineLabel(pipeline: FaqPipelineOption): string {
  const system = pipeline.is_system ? ' (system default)' : '';
  return `${pipeline.name}${system}`;
}

export function KbFaqSettingsModal({
  kb,
  onCancel,
  onSaved,
}: KbFaqSettingsModalProps) {
  const settings = kb.faq_settings ?? {};
  const [tab, setTab] = useState<SettingsTab>('extract');
  const [extractPipelineId, setExtractPipelineId] = useState('');
  const [indexPipelineId, setIndexPipelineId] = useState('');
  const [metadataKeysText, setMetadataKeysText] = useState((kb.metadata_keys ?? []).join(', '));
  const [autoIndexOnPublish, setAutoIndexOnPublish] = useState(
    settings.auto_index_on_publish ?? false,
  );
  const [polishAgentId, setPolishAgentId] = useState('');
  const [pipelineOptions, setPipelineOptions] = useState<FaqProcessingOptions | null>(null);
  const [polishOptions, setPolishOptions] = useState<
    Awaited<ReturnType<typeof fetchBuiltinAgentOptions>>['agents']
  >([]);
  const [optionsError, setOptionsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchFaqProcessingOptions(),
      fetchBuiltinAgentOptions('faq_polish'),
    ])
      .then(([pipelines, polish]) => {
        if (cancelled) return;
        setPipelineOptions(pipelines);
        setExtractPipelineId(
          resolvePipelineSelectValue(
            kb.faq_settings?.extract_pipeline_id,
            pipelines.extract_pipelines,
            pipelines.default_extract_pipeline_id,
          ),
        );
        setIndexPipelineId(
          resolvePipelineSelectValue(
            kb.pipeline_id,
            pipelines.index_pipelines,
            pipelines.default_index_pipeline_id,
          ),
        );
        setPolishOptions(polish.agents);
        setPolishAgentId(
          resolveBuiltinAgentSelectValue(
            kb.faq_settings?.polish_agent_def_id,
            polish.agents,
            polish.platform_default_agent_id,
          ),
        );
        setOptionsError('');
      })
      .catch((err) => {
        if (!cancelled) {
          setOptionsError(err instanceof Error ? err.message : 'Failed to load settings options');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kb]);

  useEffect(() => {
    const nextSettings = kb.faq_settings ?? {};
    setMetadataKeysText((kb.metadata_keys ?? []).join(', '));
    setAutoIndexOnPublish(nextSettings.auto_index_on_publish ?? false);
    setError('');
  }, [kb]);

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
        polish_agent_def_id: polishAgentId || null,
        extract_pipeline_id: extractPipelineId || null,
      };
      const updated = await updateKnowledgeBase(kb.id, {
        pipeline_id: indexPipelineId || null,
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

  const extractPipelines = pipelineOptions?.extract_pipelines ?? [];
  const indexPipelines = pipelineOptions?.index_pipelines ?? [];
  const selectedIndex = indexPipelines.find((p) => p.id === indexPipelineId);

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
            aria-selected={tab === 'extract'}
            className={`modal-tab${tab === 'extract' ? ' active' : ''}`}
            onClick={() => setTab('extract')}
          >
            Extract
          </button>
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
            aria-selected={tab === 'polish'}
            className={`modal-tab${tab === 'polish' ? ' active' : ''}`}
            onClick={() => setTab('polish')}
          >
            Answer polish
          </button>
        </div>

        <form className="form-grid kb-faq-settings-form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="kb-faq-settings-tab-body">
            {tab === 'extract' ? (
              <>
                <label className="form-field form-field-wide">
                  <span>FAQ extract pipeline</span>
                  <select
                    value={extractPipelineId}
                    onChange={(e) => setExtractPipelineId(e.target.value)}
                    required
                  >
                    {extractPipelines.length === 0 ? (
                      <option value="">No extract pipelines available</option>
                    ) : (
                      extractPipelines.map((pipeline) => (
                        <option key={pipeline.id} value={pipeline.id}>
                          {pipelineLabel(pipeline)}
                        </option>
                      ))
                    )}
                  </select>
                  <span className="admin-form-hint kb-rag-form-hint">
                    Used by Extract from documents. Model and prompts come from the pipeline Config
                    YAML. Manage pipelines under{' '}
                    <Link
                      to="/admin/pipelines"
                      target="_blank"
                      rel="noreferrer"
                      className="kb-faq-settings-hint-link"
                    >
                      Platform → Pipelines
                    </Link>
                    .
                  </span>
                </label>
              </>
            ) : tab === 'indexing' ? (
              <>
                <label className="form-field form-field-wide">
                  <span>FAQ index pipeline</span>
                  <select
                    value={indexPipelineId}
                    onChange={(e) => setIndexPipelineId(e.target.value)}
                    required
                  >
                    {indexPipelines.length === 0 ? (
                      <option value="">No index pipelines available</option>
                    ) : (
                      indexPipelines.map((pipeline) => (
                        <option key={pipeline.id} value={pipeline.id}>
                          {pipelineLabel(pipeline)}
                        </option>
                      ))
                    )}
                  </select>
                  <span className="admin-form-hint kb-rag-form-hint">
                    Embedding model and dimensions come from this pipeline&apos;s Config YAML
                    (<code>model_name</code> / <code>dimensions</code>).
                    {kb.embedding_model_name ? (
                      <>
                        {' '}
                        Currently synced: {kb.embedding_model_name} ({kb.embedding_dimensions}d)
                        {selectedIndex ? ` via ${selectedIndex.name}` : ''}.
                      </>
                    ) : null}
                  </span>
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
                <label className="form-field form-field-wide">
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
                <p className="admin-form-hint kb-faq-settings-hint form-field-wide">
                  Used by AI Polish Answer when editing an FAQ. Edit prompts and models in{' '}
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
