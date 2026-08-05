import { useEffect, useState } from 'react';
import { CircleHelp, X } from 'lucide-react';
import { iconProps } from './icons/icon-props.ts';
import { YamlCodeEditor } from './YamlCodeEditor.tsx';
import {
  DEFAULT_ALIYUN_PIPELINE_COMMAND_TEMPLATE,
  DEFAULT_BAIDU_PIPELINE_COMMAND_TEMPLATE,
  DEFAULT_PIPELINE_COMMAND_TEMPLATE,
  fetchDefaultPipelineConfigYaml,
  validatePipelineConfigYaml,
  type PipelineConfig,
  type PipelineConfigInput,
} from '../api/pipelines.ts';

const PIPELINE_TEMPLATE_COMMANDS = [
  {
    command: 'pipeline run-async',
    summary:
      'One CLI worker: cloud submit → poll → finalize. Backend spawns & receives PATCH stage updates.',
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
  if (pipelineName === 'baidu-doc-parse' || pipelineName === 'paddleocr-doc-parse') {
    return DEFAULT_BAIDU_PIPELINE_COMMAND_TEMPLATE;
  }
  return DEFAULT_PIPELINE_COMMAND_TEMPLATE;
}

function normalizeYamlText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').trim();
}

type FormTab = 'basic' | 'config';

type PipelineConfigFormProps = {
  initial?: PipelineConfig | null;
  onSubmit: (input: PipelineConfigInput | Partial<PipelineConfigInput>) => Promise<void>;
  onCancel: () => void;
};

function CliPipelineNameHelp({ pipelineName }: { pipelineName: string }) {
  return (
    <span className="field-tooltip">
      <button type="button" className="field-tooltip-trigger" aria-label="CLI pipeline name help">
        <CircleHelp {...iconProps({ size: 14 })} />
      </button>
      <div className="field-tooltip-panel" role="tooltip">
        <p className="field-tooltip-title">CLI pipeline name</p>
        <ul className="field-tooltip-list">
          <li>
            <span>
              Must match the CLI workflow id: <code>openkms-cli/workflows/&lt;name&gt;.yml</code>
            </span>
          </li>
          <li>
            <span>Runtime uses it to load default YAML, pick provider, and stamp jobs.</span>
          </li>
          <li>
            <span>
              Locked after create for system pipelines so the platform and CLI stay in sync
              {pipelineName ? (
                <>
                  {' '}
                  (<code>{pipelineName}</code>)
                </>
              ) : null}
              .
            </span>
          </li>
        </ul>
      </div>
    </span>
  );
}

export function PipelineConfigForm({ initial, onSubmit, onCancel }: PipelineConfigFormProps) {
  const isEdit = Boolean(initial);
  const isSystem = initial?.isSystem === true;
  const [tab, setTab] = useState<FormTab>('basic');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [pipelineName, setPipelineName] = useState(initial?.pipelineName ?? 'paddleocr-doc-parse');
  const [commandTemplate, setCommandTemplate] = useState(
    initial?.commandTemplate ?? defaultTemplateForPipelineName(initial?.pipelineName ?? 'paddleocr-doc-parse'),
  );
  const [configYaml, setConfigYaml] = useState(initial?.configYaml ?? '');
  const [packagedDefaultYaml, setPackagedDefaultYaml] = useState('');
  const [defaultLoading, setDefaultLoading] = useState(false);
  const [isEnabled, setIsEnabled] = useState(initial?.isEnabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [yamlStatus, setYamlStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [yamlMessage, setYamlMessage] = useState('');

  useEffect(() => {
    setTab('basic');
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setPipelineName(initial?.pipelineName ?? 'paddleocr-doc-parse');
    setCommandTemplate(
      initial?.commandTemplate ?? defaultTemplateForPipelineName(initial?.pipelineName ?? 'paddleocr-doc-parse'),
    );
    setConfigYaml(initial?.configYaml ?? '');
    setIsEnabled(initial?.isEnabled ?? true);
    setError('');
    setYamlStatus('idle');
    setYamlMessage('');
  }, [initial]);

  useEffect(() => {
    const nameForDefault = pipelineName.trim();
    if (!nameForDefault) {
      setPackagedDefaultYaml('');
      return;
    }
    let cancelled = false;
    setDefaultLoading(true);
    void fetchDefaultPipelineConfigYaml(nameForDefault)
      .then((yaml) => {
        if (cancelled) return;
        setPackagedDefaultYaml(yaml);
        if (!(initial?.configYaml ?? '').trim()) {
          setConfigYaml(yaml);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setPackagedDefaultYaml('');
        if (!(initial?.configYaml ?? '').trim()) {
          setYamlStatus('error');
          setYamlMessage(err instanceof Error ? err.message : 'Failed to load packaged default YAML');
        }
      })
      .finally(() => {
        if (!cancelled) setDefaultLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pipelineName, initial?.id, initial?.configYaml]);

  const usingPackagedDefault =
    Boolean(packagedDefaultYaml) &&
    normalizeYamlText(configYaml) === normalizeYamlText(packagedDefaultYaml);

  async function handleValidateYaml(): Promise<{ ok: boolean; message: string }> {
    setYamlStatus('idle');
    setYamlMessage('');
    const result = await validatePipelineConfigYaml(configYaml);
    if (result.ok) {
      const message = usingPackagedDefault
        ? 'Valid YAML (matches CLI packaged default).'
        : 'Valid YAML.';
      setYamlStatus('ok');
      setYamlMessage(message);
      return { ok: true, message };
    }
    setYamlStatus('error');
    setYamlMessage(result.error);
    return { ok: false, message: result.error };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const validation = await handleValidateYaml();
      if (!validation.ok) {
        setTab('config');
        throw new Error(validation.message);
      }
      const configToSave = usingPackagedDefault ? null : configYaml.trim() || null;
      if (isSystem) {
        await onSubmit({
          name: name.trim(),
          description: description.trim() || null,
          configYaml: configToSave,
        });
      } else {
        await onSubmit({
          name: name.trim(),
          description: description.trim() || null,
          pipelineName: pipelineName.trim(),
          commandTemplate: commandTemplate.trim(),
          configYaml: configToSave,
          isEnabled,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="pipeline-config-panel kb-item-detail-panel">
      <header className="kb-item-detail-header">
        <div className="kb-item-detail-header-text">
          <h2>{isEdit ? 'Edit pipeline' : 'Add pipeline'}</h2>
          <p className="kb-item-detail-subtitle">
            {initial
              ? `${initial.name}${isSystem ? ' · System' : ''}`
              : 'Create a new document pipeline'}
          </p>
        </div>
        <button
          type="button"
          className="session-explorer-close-btn"
          onClick={onCancel}
          aria-label="Close editor"
        >
          <X {...iconProps()} />
        </button>
      </header>

      <div className="kb-item-detail-tabs" role="tablist" aria-label="Pipeline editor">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'basic'}
          className={`kb-item-detail-tab${tab === 'basic' ? ' active' : ''}`}
          onClick={() => setTab('basic')}
        >
          Basic
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'config'}
          className={`kb-item-detail-tab${tab === 'config' ? ' active' : ''}`}
          onClick={() => setTab('config')}
        >
          Config YAML
        </button>
      </div>

      <form className="pipeline-config-panel-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="pipeline-form-body kb-item-detail-body">
          {tab === 'basic' ? (
            <div className="form-grid">
              <label className={`form-field${isSystem ? ' form-field-wide' : ''}`}>
                <span>Name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              {!isSystem && (
                <label className="form-field">
                  <span className="form-field-label-row">
                    <span>CLI pipeline name</span>
                    <CliPipelineNameHelp pipelineName={pipelineName} />
                  </span>
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
              )}
              <label className="form-field form-field-wide">
                <span>Description</span>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional"
                />
              </label>
              {!isSystem && (
                <>
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
                      </div>
                    </div>
                    <textarea
                      value={commandTemplate}
                      onChange={(event) => setCommandTemplate(event.target.value)}
                      rows={4}
                      required
                    />
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
                </>
              )}
            </div>
          ) : (
            <div className="pipeline-yaml-tab">
              <div className="pipeline-yaml-editor-head">
                <span className="pipeline-yaml-editor-label">Worker config</span>
                <span className="field-tooltip pipeline-yaml-help">
                  <button type="button" className="field-tooltip-trigger" aria-label="YAML config help">
                    <CircleHelp {...iconProps({ size: 14 })} />
                  </button>
                  <div className="field-tooltip-panel" role="tooltip">
                    <p className="field-tooltip-title">Worker config YAML</p>
                    <ul className="field-tooltip-list">
                      <li>
                        <span>
                          Pipeline: <code>{pipelineName.trim() || '…'}</code>
                        </span>
                      </li>
                      <li>
                        <span>
                          Use <code>model_name</code> from Admin → Models (bold display name).
                        </span>
                      </li>
                      <li>
                        <span>
                          Do not put <code>api_key</code> or <code>base_url</code> here.
                        </span>
                      </li>
                    </ul>
                  </div>
                </span>
              </div>
              <YamlCodeEditor
                className="pipeline-config-yaml"
                value={configYaml}
                disabled={defaultLoading && !configYaml}
                placeholder={defaultLoading ? 'Loading packaged default…' : ''}
                onChange={(next) => {
                  setConfigYaml(next);
                  setYamlStatus('idle');
                  setYamlMessage('');
                }}
              />
              <span className="admin-form-hint">
                {defaultLoading
                  ? 'Loading CLI packaged default…'
                  : usingPackagedDefault
                    ? 'Showing CLI packaged default. Save without edits keeps Default (null override).'
                    : 'Custom YAML — will be stored on this pipeline and snapshotted onto new jobs.'}
              </span>
              {yamlStatus === 'ok' && <p className="pipeline-yaml-ok">{yamlMessage}</p>}
              {yamlStatus === 'error' && <p className="error">{yamlMessage}</p>}
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </div>
        <div className="pipeline-config-panel-actions">
          {tab === 'config' ? (
            <div className="pipeline-config-panel-actions-left">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || defaultLoading || !packagedDefaultYaml}
                onClick={() => {
                  setConfigYaml(packagedDefaultYaml);
                  setYamlStatus('idle');
                  setYamlMessage('');
                }}
              >
                Reset to CLI default
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || defaultLoading}
                onClick={() => void handleValidateYaml()}
              >
                Check format
              </button>
            </div>
          ) : (
            <div className="pipeline-config-panel-actions-left" />
          )}
          <div className="pipeline-config-panel-actions-right">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || defaultLoading}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
}
