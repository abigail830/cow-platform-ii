import { useEffect, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { listModelConfigs, type ModelConfig } from '../api/models.ts';
import { iconProps } from './icons/icon-props.ts';
import {
  DEFAULT_ALIYUN_PIPELINE_COMMAND_TEMPLATE,
  DEFAULT_BAIDU_PIPELINE_COMMAND_TEMPLATE,
  DEFAULT_PIPELINE_COMMAND_TEMPLATE,
  type PipelineConfig,
  type PipelineConfigInput,
} from '../api/pipelines.ts';

/** Async template commands (cloud pipelines). */
/** Async cloud pipeline: one worker command line (finalize bundles parse + page index + metadata). */
const PIPELINE_TEMPLATE_COMMANDS = [
  {
    command: 'pipeline run-async',
    summary:
      'One CLI process: cloud submit → poll (OPENKMS_ASYNC_POLL_INTERVAL_SECONDS) → finalize. Backend only spawns & receives PATCH.',
  },
] as const;

const ASYNC_TEMPLATE_PLACEHOLDERS = [
  { token: '{job_id}', summary: 'Pipeline job UUID.' },
  {
    token: '--page-index-strategy …',
    summary: 'CLI flag on the run-async line (not a {placeholder}).',
  },
] as const;

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
            <label className="form-field form-field-wide pipeline-command-field">
              <div className="pipeline-command-header">
                <span className="form-field-label-row">
                  <span>Command template</span>
                  <span className="field-tooltip">
                    <button
                      type="button"
                      className="field-tooltip-trigger"
                      aria-label="Template commands and placeholders"
                    >
                      <CircleHelp {...iconProps({ size: 14 })} />
                    </button>
                  </span>
                </span>
                <div className="field-tooltip-panel pipeline-command-tooltip" role="tooltip">
                  <p className="field-tooltip-title">Commands (template)</p>
                  <ul className="field-tooltip-list">
                    {PIPELINE_TEMPLATE_COMMANDS.map((item) => (
                      <li key={item.command}>
                        <code>{item.command}</code>
                        <span>{item.summary}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="field-tooltip-title">Placeholders</p>
                  <ul className="field-tooltip-list field-tooltip-list-compact">
                    {ASYNC_TEMPLATE_PLACEHOLDERS.map((item) => (
                      <li key={item.token}>
                        <code>{item.token}</code>
                        <span>{item.summary}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="field-tooltip-foot">
                    One line: pipeline run-async (submit + poll + finalize inside CLI). Poll interval:
                    OPENKMS_ASYNC_POLL_INTERVAL_SECONDS in openkms-cli/.env. Lines starting with # are ignored.
                  </p>
                </div>
              </div>
              <textarea
                value={commandTemplate}
                onChange={(event) => setCommandTemplate(event.target.value)}
                rows={4}
                required
              />
              <span className="admin-form-hint">
                Cloud pipelines: one run-async command; legacy finalize lines are normalized to run-async.
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
