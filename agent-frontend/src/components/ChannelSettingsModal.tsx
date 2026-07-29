import { useEffect, useMemo, useState } from 'react';
import {
  fetchChannelProcessingOptions,
  type ChannelProcessingOptions,
} from '../api/documentChannels.ts';

type ChannelSettingsModalProps = {
  initialName: string;
  initialDescription: string;
  initialPipelineId: string | null;
  initialMetadataExtractionModelId: string | null;
  onCancel: () => void;
  onSubmit: (input: {
    name: string;
    description: string;
    pipelineId: string | null;
    metadataExtractionModelId: string | null;
  }) => Promise<void>;
};

type SettingsTab = 'general' | 'pipeline';

export function ChannelSettingsModal({
  initialName,
  initialDescription,
  initialPipelineId,
  initialMetadataExtractionModelId,
  onCancel,
  onSubmit,
}: ChannelSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [pipelineId, setPipelineId] = useState(initialPipelineId ?? '');
  const [extractionModelId, setExtractionModelId] = useState(initialMetadataExtractionModelId ?? '');
  const [options, setOptions] = useState<ChannelProcessingOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(initialName);
    setDescription(initialDescription);
    setPipelineId(initialPipelineId ?? '');
    setExtractionModelId(initialMetadataExtractionModelId ?? '');
    setError('');
    setTab('general');
  }, [initialDescription, initialMetadataExtractionModelId, initialName, initialPipelineId]);

  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    setOptionsError('');
    void fetchChannelProcessingOptions()
      .then((data) => {
        if (cancelled) return;
        setOptions(data);
        const validIds = new Set(data.extractionModels.map((model) => model.id));

        if (initialMetadataExtractionModelId && validIds.has(initialMetadataExtractionModelId)) {
          setExtractionModelId(initialMetadataExtractionModelId);
          return;
        }

        if (!initialMetadataExtractionModelId) {
          const defaultModel = data.extractionModels.find((model) => model.isDefault);
          if (defaultModel) {
            setExtractionModelId(defaultModel.id);
            return;
          }
        }

        setExtractionModelId('');
      })
      .catch((err) => {
        if (!cancelled) {
          setOptionsError(err instanceof Error ? err.message : 'Failed to load processing options');
        }
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialMetadataExtractionModelId]);

  const selectedPipelineLabel = useMemo(() => {
    if (!pipelineId || !options) return null;
    return options.pipelines.find((pipeline) => pipeline.id === pipelineId)?.name ?? null;
  }, [options, pipelineId]);

  const selectedExtractionLabel = useMemo(() => {
    if (!extractionModelId || !options) return null;
    return options.extractionModels.find((model) => model.id === extractionModelId)?.name ?? null;
  }, [extractionModelId, options]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        pipelineId: pipelineId || null,
        metadataExtractionModelId: extractionModelId || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save channel settings');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card model-config-form channel-settings-modal" onClick={(event) => event.stopPropagation()}>
        <div className="channel-settings-modal-header">
          <h2>Channel settings</h2>
        </div>

        <div className="modal-tabs" role="tablist" aria-label="Channel settings">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'general'}
            className={`modal-tab${tab === 'general' ? ' active' : ''}`}
            onClick={() => setTab('general')}
          >
            General
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pipeline'}
            className={`modal-tab${tab === 'pipeline' ? ' active' : ''}`}
            onClick={() => setTab('pipeline')}
          >
            Pipeline
          </button>
        </div>

        <form className="channel-settings-modal-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="channel-settings-modal-body">
          {tab === 'general' && (
            <div className="form-grid">
              <label className="form-field form-field-wide">
                <span>Name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
              </label>
              <label className="form-field form-field-wide">
                <span>Description</span>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
          )}

          {tab === 'pipeline' && (
            <div className="form-grid">
              {optionsLoading ? (
                <p className="admin-form-hint form-field-wide">Loading options…</p>
              ) : optionsError ? (
                <p className="error form-field-wide">{optionsError}</p>
              ) : (
                <>
                  <label className="form-field form-field-wide">
                    <span>Pipeline (optional)</span>
                    <select value={pipelineId} onChange={(event) => setPipelineId(event.target.value)}>
                      <option value="">— None —</option>
                      {options?.pipelines.map((pipeline) => (
                        <option key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
                        </option>
                      ))}
                    </select>
                    <span className="admin-form-hint">
                      When set, documents in this channel can run the configured parse pipeline.
                      {selectedPipelineLabel ? ` Selected: ${selectedPipelineLabel}.` : ' No pipeline selected.'}
                      {pipelineId && options?.pipelines.find((p) => p.id === pipelineId)?.pipelineName === 'baidu-doc-parse'
                        ? ' Baidu uses async submit → finalize (baidu-layouts PageIndex) → extract-metadata. No VLM on pipeline config.'
                        : ''}
                    </span>
                  </label>
                  <label className="form-field form-field-wide">
                    <span>Metadata extraction model (optional)</span>
                    <select
                      value={extractionModelId}
                      onChange={(event) => setExtractionModelId(event.target.value)}
                    >
                      <option value="">— None —</option>
                      {options?.extractionModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                          {model.isDefault ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                    <span className="admin-form-hint">
                      Chat-completions models from Model configuration for metadata extraction. Independent of the pipeline step.
                      {selectedExtractionLabel
                        ? ` Selected: ${selectedExtractionLabel}.`
                        : ' No extraction model selected.'}
                    </span>
                  </label>
                </>
              )}
            </div>
          )}

          </div>

          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
