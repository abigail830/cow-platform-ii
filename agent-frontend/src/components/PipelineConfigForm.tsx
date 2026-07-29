import { useEffect, useState } from 'react';
import { listModelConfigs, type ModelConfig } from '../api/models.ts';
import {
  DEFAULT_ALIYUN_PIPELINE_COMMAND_TEMPLATE,
  DEFAULT_BAIDU_PIPELINE_COMMAND_TEMPLATE,
  DEFAULT_PIPELINE_COMMAND_TEMPLATE,
  type PipelineConfig,
  type PipelineConfigInput,
} from '../api/pipelines.ts';

function defaultTemplateForPipelineName(pipelineName: string): string {
  if (pipelineName === 'aliyun-docmind-parse') return DEFAULT_ALIYUN_PIPELINE_COMMAND_TEMPLATE;
  if (pipelineName === 'baidu-doc-parse') return DEFAULT_BAIDU_PIPELINE_COMMAND_TEMPLATE;
  return DEFAULT_PIPELINE_COMMAND_TEMPLATE;
}

type PipelineConfigFormProps = {
  initial?: PipelineConfig | null;
  onSubmit: (input: PipelineConfigInput) => Promise<void>;
  onCancel: () => void;
};

export function PipelineConfigForm({ initial, onSubmit, onCancel }: PipelineConfigFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [pipelineName, setPipelineName] = useState(initial?.pipelineName ?? 'paddleocr-doc-parse');
  const [commandTemplate, setCommandTemplate] = useState(
    initial?.commandTemplate ?? defaultTemplateForPipelineName(initial?.pipelineName ?? 'paddleocr-doc-parse'),
  );
  const [modelConfigId, setModelConfigId] = useState(initial?.modelConfigId ?? '');
  const [isEnabled, setIsEnabled] = useState(initial?.isEnabled ?? true);
  const [vlmModels, setVlmModels] = useState<ModelConfig[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setPipelineName(initial?.pipelineName ?? 'paddleocr-doc-parse');
    setCommandTemplate(
      initial?.commandTemplate ?? defaultTemplateForPipelineName(initial?.pipelineName ?? 'paddleocr-doc-parse'),
    );
    setModelConfigId(initial?.modelConfigId ?? '');
    setIsEnabled(initial?.isEnabled ?? true);
    setError('');
  }, [initial]);

  useEffect(() => {
    void listModelConfigs({ apiType: 'vlm', limit: 100 })
      .then((data) => {
        const sorted = [...data.models].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        );
        setVlmModels(sorted);
      })
      .catch(() => setVlmModels([]));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        pipelineName: pipelineName.trim(),
        commandTemplate: commandTemplate.trim(),
        modelConfigId: modelConfigId || null,
        isEnabled,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card model-config-form pipeline-config-modal" onClick={(event) => event.stopPropagation()}>
        <h2>{initial ? 'Edit pipeline' : 'Add pipeline'}</h2>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field">
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="form-field">
              <span>CLI pipeline name</span>
              <input
                value={pipelineName}
                onChange={(event) => {
                  const next = event.target.value;
                  setPipelineName(next);
                  if (!initial) {
                    setCommandTemplate(defaultTemplateForPipelineName(next));
                  }
                }}
                placeholder="paddleocr-doc-parse"
                required
              />
            </label>
            <label className="form-field form-field-wide">
              <span>Description</span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="form-field form-field-wide">
              <span>VLM model (optional)</span>
              <select value={modelConfigId} onChange={(event) => setModelConfigId(event.target.value)}>
                <option value="">— None —</option>
                {vlmModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                    {model.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field form-field-wide">
              <span>Command template</span>
              <textarea
                value={commandTemplate}
                onChange={(event) => setCommandTemplate(event.target.value)}
                rows={3}
                required
              />
              <span className="admin-form-hint">
                Placeholders: {'{input}'}, {'{s3_prefix}'}, {'{document_id}'}, {'{api_url}'}, {'{vlm_args}'},{' '}
                {'{extraction_args}'}, {'{job_id}'} (async). Async pipelines: one command per line (submit, then
                finalize).
              </span>
            </label>
            <label className="form-checkbox">
              <input
                type="checkbox"
                className="brand-checkbox"
                checked={isEnabled}
                onChange={(event) => setIsEnabled(event.target.checked)}
              />
              <span>Enabled</span>
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
