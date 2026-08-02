import { useEffect, useState, type FormEvent } from 'react';
import {
  updateKnowledgeBase,
  type KbFaqSettings,
  type KnowledgeBase,
} from '../api/knowledgeBases.ts';
import type { ModelConfig } from '../api/models.ts';

const DEFAULT_EXTRACTION_PROMPT =
  'Extract FAQ pairs from the document markdown below. Return a JSON array of objects with "question" and "answer" fields. Only include substantive Q&A from the content.\n\nDocument: {document_name}\n\n{markdown}';

const DEFAULT_POLISH_PROMPT =
  'Polish the following FAQ answer for clarity and professionalism. Keep the same language as the input. Return only the polished answer text.\n\nQuestion: {question}\n\nAnswer: {answer}';

type SettingsTab = 'indexing' | 'ai';

type KbFaqSettingsModalProps = {
  kb: KnowledgeBase;
  embeddingModels: ModelConfig[];
  chatModels: ModelConfig[];
  onCancel: () => void;
  onSaved: (kb: KnowledgeBase) => void;
};

function resolveModelId(
  configuredId: string | null | undefined,
  models: ModelConfig[],
): string {
  if (configuredId && models.some((model) => model.id === configuredId)) {
    return configuredId;
  }
  return models.find((model) => model.isDefault)?.id ?? '';
}

export function KbFaqSettingsModal({
  kb,
  embeddingModels,
  chatModels,
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
  const [extractionModelId, setExtractionModelId] = useState(
    settings.extraction_model_config_id ?? '',
  );
  const [extractionPrompt, setExtractionPrompt] = useState(
    settings.extraction_prompt ?? DEFAULT_EXTRACTION_PROMPT,
  );
  const [polishModelId, setPolishModelId] = useState(settings.polish_model_config_id ?? '');
  const [polishPrompt, setPolishPrompt] = useState(settings.polish_prompt ?? DEFAULT_POLISH_PROMPT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const nextSettings = kb.faq_settings ?? {};
    setEmbeddingModelId(resolveModelId(kb.embedding_model_config_id, embeddingModels));
    setEmbeddingDimensions(kb.embedding_dimensions ?? 1024);
    setMetadataKeysText((kb.metadata_keys ?? []).join(', '));
    setAutoIndexOnPublish(nextSettings.auto_index_on_publish ?? false);
    setExtractionModelId(resolveModelId(nextSettings.extraction_model_config_id, chatModels));
    setExtractionPrompt(nextSettings.extraction_prompt ?? DEFAULT_EXTRACTION_PROMPT);
    setPolishModelId(resolveModelId(nextSettings.polish_model_config_id, chatModels));
    setPolishPrompt(nextSettings.polish_prompt ?? DEFAULT_POLISH_PROMPT);
    setError('');
  }, [kb, embeddingModels, chatModels]);

  const defaultEmbeddingModel = embeddingModels.find((model) => model.isDefault) ?? null;
  const defaultChatModel = chatModels.find((model) => model.isDefault) ?? null;

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
        extraction_model_config_id: extractionModelId || null,
        extraction_prompt: extractionPrompt,
        polish_model_config_id: polishModelId || null,
        polish_prompt: polishPrompt,
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
            AI assistance
          </button>
        </div>

        <form className="form-grid" onSubmit={(e) => void handleSubmit(e)}>
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
              <label className="form-field form-field-wide">
                <span>Extraction model</span>
                <select
                  value={extractionModelId}
                  onChange={(e) => setExtractionModelId(e.target.value)}
                  required
                >
                  <option value="">Select a model…</option>
                  {chatModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.modelId}){model.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
                <span className="admin-form-hint kb-rag-form-hint">
                  {defaultChatModel
                    ? `Default: ${defaultChatModel.name}. Used when extracting FAQs from documents.`
                    : 'Configure chat models under Admin → Models.'}
                </span>
              </label>
              <label className="form-field form-field-wide">
                <span>Extraction prompt</span>
                <textarea
                  value={extractionPrompt}
                  onChange={(e) => setExtractionPrompt(e.target.value)}
                  rows={6}
                  required
                />
                <span className="admin-form-hint">
                  Placeholders: {'{document_name}'}, {'{markdown}'}
                </span>
              </label>
              <label className="form-field form-field-wide">
                <span>Polish model</span>
                <select
                  value={polishModelId}
                  onChange={(e) => setPolishModelId(e.target.value)}
                  required
                >
                  <option value="">Select a model…</option>
                  {chatModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.modelId}){model.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field form-field-wide">
                <span>Polish prompt</span>
                <textarea
                  value={polishPrompt}
                  onChange={(e) => setPolishPrompt(e.target.value)}
                  rows={5}
                  required
                />
                <span className="admin-form-hint">
                  Placeholders: {'{question}'}, {'{answer}'}
                </span>
              </label>
            </>
          )}

          <div className="modal-actions form-field-wide">
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
