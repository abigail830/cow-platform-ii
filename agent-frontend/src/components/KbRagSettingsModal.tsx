import { useEffect, useState, type FormEvent } from 'react';
import {
  updateKnowledgeBase,
  type KbChunkConfig,
  type KnowledgeBase,
} from '../api/knowledgeBases.ts';
import type { ModelConfig } from '../api/models.ts';

const CHUNK_STRATEGIES: Array<{ value: NonNullable<KbChunkConfig['strategy']>; label: string }> = [
  { value: 'markdown_header', label: 'Markdown headers' },
  { value: 'paragraph', label: 'Paragraphs' },
  { value: 'fixed_size', label: 'Fixed size' },
];

type KbRagSettingsModalProps = {
  kb: KnowledgeBase;
  embeddingModels: ModelConfig[];
  onCancel: () => void;
  onSaved: (kb: KnowledgeBase) => void;
};

function resolveEmbeddingModelId(
  configuredId: string | null | undefined,
  models: ModelConfig[],
): string {
  if (configuredId && models.some((model) => model.id === configuredId)) {
    return configuredId;
  }
  return models.find((model) => model.isDefault)?.id ?? '';
}

export function KbRagSettingsModal({
  kb,
  embeddingModels,
  onCancel,
  onSaved,
}: KbRagSettingsModalProps) {
  const [embeddingModelId, setEmbeddingModelId] = useState(kb.embedding_model_config_id ?? '');
  const [embeddingDimensions, setEmbeddingDimensions] = useState(kb.embedding_dimensions ?? 1024);
  const [chunkStrategy, setChunkStrategy] = useState<NonNullable<KbChunkConfig['strategy']>>(
    kb.chunk_config?.strategy ?? 'markdown_header',
  );
  const [chunkSize, setChunkSize] = useState(kb.chunk_config?.chunk_size ?? 8000);
  const [chunkOverlap, setChunkOverlap] = useState(kb.chunk_config?.chunk_overlap ?? 50);
  const [metadataKeysText, setMetadataKeysText] = useState((kb.metadata_keys ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setEmbeddingModelId(resolveEmbeddingModelId(kb.embedding_model_config_id, embeddingModels));
    setEmbeddingDimensions(kb.embedding_dimensions ?? 1024);
    setChunkStrategy(kb.chunk_config?.strategy ?? 'markdown_header');
    setChunkSize(kb.chunk_config?.chunk_size ?? 8000);
    setChunkOverlap(kb.chunk_config?.chunk_overlap ?? 50);
    setMetadataKeysText((kb.metadata_keys ?? []).join(', '));
    setError('');
  }, [kb, embeddingModels]);

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
      const updated = await updateKnowledgeBase(kb.id, {
        name: kb.name,
        description: kb.description,
        embedding_model_config_id: embeddingModelId || null,
        embedding_dimensions: embeddingDimensions,
        chunk_config: {
          strategy: chunkStrategy,
          chunk_size: chunkSize,
          chunk_overlap: chunkOverlap,
        },
        metadata_keys: metadataKeys,
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
        className="modal-card model-config-form kb-rag-settings-modal"
        role="dialog"
        aria-labelledby="kb-rag-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="kb-rag-settings-title">RAG settings</h2>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <form className="form-grid" onSubmit={(e) => void handleSubmit(e)}>
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
          <label className="form-field">
            <span>Chunk strategy</span>
            <select
              value={chunkStrategy}
              onChange={(e) =>
                setChunkStrategy(e.target.value as NonNullable<KbChunkConfig['strategy']>)
              }
            >
              {CHUNK_STRATEGIES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Chunk size</span>
            <input
              type="number"
              min={100}
              max={100000}
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
              required
            />
          </label>
          <label className="form-field">
            <span>Chunk overlap</span>
            <input
              type="number"
              min={0}
              max={10000}
              value={chunkOverlap}
              onChange={(e) => setChunkOverlap(Number(e.target.value))}
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
            <span className="admin-form-hint kb-rag-form-hint">
              Changing embedding or chunk settings requires re-indexing.
            </span>
          </label>
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
