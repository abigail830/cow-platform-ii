import { useMemo, useState } from 'react';
import { Loader2, Play, Plus, Trash2 } from 'lucide-react';
import { testBuiltinAgent, type BuiltinWorkflowKey } from '../api/builtinAgents.ts';
import type { ModelConfig } from '../api/models.ts';
import { BUILTIN_SAMPLE_VARIABLES } from '../builtin-agents/constants.ts';
import { iconProps } from './icons/icon-props.ts';

const MAX_VARIANTS = 3;

export type PlaygroundVariant = {
  id: string;
  label: string;
  modelConfigId: string;
  systemPrompt: string;
  userPromptTemplate: string;
  temperature: string;
};

export type PlaygroundVariantResult = {
  rawText: string;
  parsed: unknown;
  latencyMs: number;
  modelName?: string;
  error?: string;
};

type BuiltinAgentPlaygroundProps = {
  agentId: string;
  workflowKey: BuiltinWorkflowKey;
  models: ModelConfig[];
  baseConfig: {
    modelConfigId: string;
    systemPrompt: string;
    userPromptTemplate: string;
    temperature: string;
  };
};

function createVariantId(): string {
  return `v-${Math.random().toString(36).slice(2, 9)}`;
}

function makeVariant(
  index: number,
  base: BuiltinAgentPlaygroundProps['baseConfig'],
): PlaygroundVariant {
  const label = String.fromCharCode(65 + index);
  return {
    id: createVariantId(),
    label: `Variant ${label}`,
    modelConfigId: base.modelConfigId,
    systemPrompt: base.systemPrompt,
    userPromptTemplate: base.userPromptTemplate,
    temperature: base.temperature,
  };
}

function formatOutput(result: PlaygroundVariantResult | undefined): string {
  if (!result) return '';
  if (result.error) return result.error;
  if (result.parsed !== undefined && result.parsed !== null) {
    return typeof result.parsed === 'string'
      ? result.parsed
      : JSON.stringify(result.parsed, null, 2);
  }
  return result.rawText;
}

export function BuiltinAgentPlayground({
  agentId,
  workflowKey,
  models,
  baseConfig,
}: BuiltinAgentPlaygroundProps) {
  const [variables, setVariables] = useState<Record<string, string>>(
    () => ({ ...BUILTIN_SAMPLE_VARIABLES[workflowKey] }),
  );
  const [variants, setVariants] = useState<PlaygroundVariant[]>(() => [makeVariant(0, baseConfig)]);
  const [results, setResults] = useState<Record<string, PlaygroundVariantResult>>({});
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');

  const variableKeys = useMemo(
    () => Object.keys(BUILTIN_SAMPLE_VARIABLES[workflowKey]),
    [workflowKey],
  );

  function updateVariant(id: string, patch: Partial<PlaygroundVariant>) {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  function addVariant() {
    if (variants.length >= MAX_VARIANTS) return;
    setVariants((prev) => [...prev, makeVariant(prev.length, baseConfig)]);
  }

  function removeVariant(id: string) {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((v) => v.id !== id));
    setResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function syncVariantFromConfig(index: number) {
    setVariants((prev) =>
      prev.map((v, i) =>
        i === index
          ? {
              ...v,
              modelConfigId: baseConfig.modelConfigId,
              systemPrompt: baseConfig.systemPrompt,
              userPromptTemplate: baseConfig.userPromptTemplate,
              temperature: baseConfig.temperature,
            }
          : v,
      ),
    );
  }

  async function runVariant(variant: PlaygroundVariant) {
    setRunning(true);
    setRunError('');
    const modelName = models.find((model) => model.id === variant.modelConfigId)?.name;
    try {
      const result = await testBuiltinAgent(agentId, {
        variables,
        draft: {
          model_config_id: variant.modelConfigId,
          system_prompt: variant.systemPrompt,
          user_prompt_template: variant.userPromptTemplate,
          temperature: variant.temperature || null,
        },
      });
      setResults((prev) => ({
        ...prev,
        [variant.id]: {
          rawText: result.raw_text,
          parsed: result.parsed,
          latencyMs: result.latency_ms,
          modelName: result.model_name ?? modelName,
        },
      }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [variant.id]: {
          rawText: '',
          parsed: null,
          latencyMs: 0,
          modelName,
          error: err instanceof Error ? err.message : 'Test run failed',
        },
      }));
    } finally {
      setRunning(false);
    }
  }

  async function runAll() {
    setRunning(true);
    setRunError('');
    const nextResults: Record<string, PlaygroundVariantResult> = {};

    await Promise.all(
      variants.map(async (variant) => {
        const modelName = models.find((model) => model.id === variant.modelConfigId)?.name;
        try {
          const result = await testBuiltinAgent(agentId, {
            variables,
            draft: {
              model_config_id: variant.modelConfigId,
              system_prompt: variant.systemPrompt,
              user_prompt_template: variant.userPromptTemplate,
              temperature: variant.temperature || null,
            },
          });
          nextResults[variant.id] = {
            rawText: result.raw_text,
            parsed: result.parsed,
            latencyMs: result.latency_ms,
            modelName: result.model_name ?? modelName,
          };
        } catch (err) {
          nextResults[variant.id] = {
            rawText: '',
            parsed: null,
            latencyMs: 0,
            modelName,
            error: err instanceof Error ? err.message : 'Test run failed',
          };
        }
      }),
    );

    setResults(nextResults);
    setRunning(false);
  }

  return (
    <div className="builtin-agent-playground">
      <section className="builtin-agent-playground-section">
        <h3>Input</h3>
        <div className="form-grid">
          {variableKeys.map((key) => (
            <label key={key} className="form-field form-field-wide">
              {variableKeys.length > 1 ? <span>{key}</span> : null}
              <textarea
                value={variables[key] ?? ''}
                onChange={(e) => setVariables((prev) => ({ ...prev, [key]: e.target.value }))}
                rows={key === 'markdown' ? 8 : 2}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="builtin-agent-playground-section">
        <div className="builtin-agent-playground-toolbar">
          <h3>Compare variants</h3>
          <div className="builtin-agent-playground-toolbar-actions">
            {variants.length < MAX_VARIANTS && (
              <button type="button" className="btn-secondary" onClick={addVariant}>
                <Plus {...iconProps({ size: 16 })} aria-hidden />
                Add variant
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={running}
              onClick={() => void runAll()}
            >
              {running ? (
                <Loader2 {...iconProps({ size: 16, className: 'icon-btn-spin' })} aria-hidden />
              ) : (
                <Play {...iconProps({ size: 16 })} aria-hidden />
              )}
              Run all
            </button>
          </div>
        </div>

        {runError && <p className="admin-error" role="alert">{runError}</p>}

        <div
          className="builtin-agent-variant-grid"
          style={{ gridTemplateColumns: `repeat(${variants.length}, minmax(0, 1fr))` }}
        >
          {variants.map((variant, index) => {
            const result = results[variant.id];
            return (
              <div key={variant.id} className="builtin-agent-variant-card">
                <div className="builtin-agent-variant-card-header">
                  <strong>{variant.label}</strong>
                  <div className="builtin-agent-variant-card-actions">
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => syncVariantFromConfig(index)}
                    >
                      Sync from config
                    </button>
                    {variants.length > 1 && (
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Remove variant"
                        onClick={() => removeVariant(variant.id)}
                      >
                        <Trash2 {...iconProps()} aria-hidden />
                      </button>
                    )}
                  </div>
                </div>

                <label className="form-field form-field-wide">
                  <span>Model</span>
                  <select
                    value={variant.modelConfigId}
                    onChange={(e) => updateVariant(variant.id, { modelConfigId: e.target.value })}
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.modelId})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field form-field-wide">
                  <span>System prompt</span>
                  <textarea
                    value={variant.systemPrompt}
                    onChange={(e) => updateVariant(variant.id, { systemPrompt: e.target.value })}
                    rows={3}
                  />
                </label>

                <label className="form-field form-field-wide">
                  <span>User prompt template</span>
                  <textarea
                    value={variant.userPromptTemplate}
                    onChange={(e) =>
                      updateVariant(variant.id, { userPromptTemplate: e.target.value })
                    }
                    rows={6}
                  />
                </label>

                <label className="form-field">
                  <span>Temperature</span>
                  <input
                    value={variant.temperature}
                    onChange={(e) => updateVariant(variant.id, { temperature: e.target.value })}
                  />
                </label>

                <div className="builtin-agent-variant-output">
                  <div className="builtin-agent-variant-output-header">
                    <span>
                      Output
                      {result?.modelName ? (
                        <span className="admin-muted"> · {result.modelName}</span>
                      ) : null}
                    </span>
                    {result && !result.error ? (
                      <span className="admin-muted">{result.latencyMs} ms</span>
                    ) : null}
                  </div>
                  <pre className="builtin-agent-test-result">
                    {running && !result
                      ? 'Running…'
                      : formatOutput(result) || 'Run to see output'}
                  </pre>
                  <button
                    type="button"
                    className="btn-secondary builtin-agent-variant-run-btn"
                    disabled={running}
                    onClick={() => void runVariant(variant)}
                  >
                    {running ? (
                      <Loader2 {...iconProps({ size: 16, className: 'icon-btn-spin' })} aria-hidden />
                    ) : (
                      <Play {...iconProps({ size: 16 })} aria-hidden />
                    )}
                    Run variant
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
