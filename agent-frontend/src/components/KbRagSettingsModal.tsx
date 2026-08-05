import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchRagProcessingOptions,
  updateKnowledgeBase,
  type FaqPipelineOption,
  type KnowledgeBase,
  type RagProcessingOptions,
} from '../api/knowledgeBases.ts';

type KbRagSettingsModalProps = {
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

export function KbRagSettingsModal({
  kb,
  onCancel,
  onSaved,
}: KbRagSettingsModalProps) {
  const [indexPipelineId, setIndexPipelineId] = useState('');
  const [metadataKeysText, setMetadataKeysText] = useState((kb.metadata_keys ?? []).join(', '));
  const [pipelineOptions, setPipelineOptions] = useState<RagProcessingOptions | null>(null);
  const [optionsError, setOptionsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchRagProcessingOptions()
      .then((pipelines) => {
        if (cancelled) return;
        setPipelineOptions(pipelines);
        setIndexPipelineId(
          resolvePipelineSelectValue(
            kb.pipeline_id,
            pipelines.index_pipelines,
            pipelines.default_index_pipeline_id,
          ),
        );
        setOptionsError('');
      })
      .catch((err) => {
        if (!cancelled) {
          setOptionsError(err instanceof Error ? err.message : 'Failed to load pipeline options');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kb]);

  useEffect(() => {
    setMetadataKeysText((kb.metadata_keys ?? []).join(', '));
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
      const updated = await updateKnowledgeBase(kb.id, {
        name: kb.name,
        description: kb.description,
        pipeline_id: indexPipelineId || null,
        metadata_keys: metadataKeys,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  const indexPipelines = pipelineOptions?.index_pipelines ?? [];
  const selectedIndex = indexPipelines.find((p) => p.id === indexPipelineId);

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
        {optionsError && <p className="admin-error" role="alert">{optionsError}</p>}
        <form className="form-grid" onSubmit={(e) => void handleSubmit(e)}>
          <label className="form-field form-field-wide">
            <span>RAG index pipeline</span>
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
              Embedding model, dimensions, and chunking come from this pipeline&apos;s Config YAML.
              Manage under{' '}
              <Link
                to="/admin/pipelines"
                target="_blank"
                rel="noreferrer"
                className="kb-faq-settings-hint-link"
              >
                Platform → Pipelines
              </Link>
              .
              {kb.embedding_model_name ? (
                <>
                  {' '}
                  Currently synced: {kb.embedding_model_name} ({kb.embedding_dimensions}d)
                  {selectedIndex ? ` via ${selectedIndex.name}` : ''}.
                </>
              ) : null}{' '}
              Changing pipeline settings requires re-indexing.
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
