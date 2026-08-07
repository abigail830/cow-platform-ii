import { useEffect, useState } from 'react';
import {
  MODEL_API_TYPES,
  MODEL_API_TYPE_LABELS,
  type ModelApiType,
  type ModelConfig,
  type ModelConfigDetail,
  type ModelConfigInput,
} from '../api/models.ts';

type ModelConfigFormProps = {
  initial?: ModelConfig | null;
  /** Pre-filled from another model (create mode, includes API key). */
  duplicateFrom?: ModelConfigDetail | null;
  onSubmit: (input: ModelConfigInput) => Promise<void>;
  onCancel: () => void;
};

const CAPABILITY_SUGGESTIONS = ['Vision', 'Document parse', 'Function calling', 'JSON mode', 'Streaming'];
const VLM_CAPABILITY_SUGGESTIONS = ['Vision', 'OCR', 'Layout detection', 'Document parse'];

function placeholdersForApiType(apiType: ModelApiType) {
  if (apiType === 'vlm') {
    return {
      name: 'PaddleOCR-VL-1.5',
      modelId: 'PaddlePaddle/PaddleOCR-VL-1.5',
      provider: 'PaddlePaddle',
      baseUrl: 'http://localhost:8101/',
    };
  }
  if (apiType === 'rerank') {
    return {
      name: 'BGE Reranker v2 M3',
      modelId: 'BAAI/bge-reranker-v2-m3',
      provider: 'BAAI',
      baseUrl: 'https://api.siliconflow.cn/v1',
    };
  }
  if (apiType === 'audio-asr') {
    return {
      name: 'qwen-audio-3.0-asr-flash-filetrans',
      modelId: 'qwen-audio-3.0-asr-flash-filetrans',
      provider: 'Alibaba DashScope',
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    };
  }
  return {
    name: 'My model',
    modelId: 'provider/model-name',
    provider: 'Provider',
    baseUrl: 'https://api.example.com/v1',
  };
}

function copyDisplayName(name: string) {
  const suffix = ' (copy)';
  if (name.endsWith(suffix)) return name;
  return `${name}${suffix}`;
}

const THINKING_LEVEL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '', label: 'Default (medium)' },
  { id: 'off', label: 'Off' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

function readThinkingLevel(extraConfig: Record<string, unknown> | undefined): string {
  const raw = extraConfig?.thinkingLevel ?? extraConfig?.thinking_level;
  return typeof raw === 'string' ? raw : '';
}

export function ModelConfigForm({ initial, duplicateFrom, onSubmit, onCancel }: ModelConfigFormProps) {
  const isCopy = Boolean(duplicateFrom);
  const [name, setName] = useState(
    initial?.name ?? (duplicateFrom ? copyDisplayName(duplicateFrom.name) : ''),
  );
  const [modelId, setModelId] = useState(initial?.modelId ?? duplicateFrom?.modelId ?? '');
  const [provider, setProvider] = useState(initial?.provider ?? duplicateFrom?.provider ?? '');
  const [apiType, setApiType] = useState<ModelApiType>(
    initial?.apiType ?? duplicateFrom?.apiType ?? 'chat-completions',
  );
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? duplicateFrom?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(duplicateFrom?.apiKey ?? '');
  const [capabilities, setCapabilities] = useState<string[]>(
    initial?.capabilities ?? duplicateFrom?.capabilities ?? [],
  );
  const [capabilityInput, setCapabilityInput] = useState('');
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [thinkingLevel, setThinkingLevel] = useState(
    readThinkingLevel(initial?.extraConfig ?? duplicateFrom?.extraConfig),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setModelId(initial.modelId);
      setProvider(initial.provider);
      setApiType(initial.apiType);
      setBaseUrl(initial.baseUrl ?? '');
      setApiKey('');
      setCapabilities(initial.capabilities);
      setIsDefault(initial.isDefault);
      setThinkingLevel(readThinkingLevel(initial.extraConfig));
    } else if (duplicateFrom) {
      setName(copyDisplayName(duplicateFrom.name));
      setModelId(duplicateFrom.modelId);
      setProvider(duplicateFrom.provider);
      setApiType(duplicateFrom.apiType);
      setBaseUrl(duplicateFrom.baseUrl ?? '');
      setApiKey(duplicateFrom.apiKey ?? '');
      setCapabilities(duplicateFrom.capabilities);
      setIsDefault(false);
      setThinkingLevel(readThinkingLevel(duplicateFrom.extraConfig));
    } else {
      setName('');
      setModelId('');
      setProvider('');
      setApiType('chat-completions');
      setBaseUrl('');
      setApiKey('');
      setCapabilities([]);
      setIsDefault(false);
      setThinkingLevel('');
    }
    setCapabilityInput('');
    setError('');
  }, [initial, duplicateFrom]);

  function addCapability(value: string) {
    const trimmed = value.trim();
    if (!trimmed || capabilities.includes(trimmed)) return;
    setCapabilities((prev) => [...prev, trimmed]);
    setCapabilityInput('');
  }

  function removeCapability(value: string) {
    setCapabilities((prev) => prev.filter((item) => item !== value));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const extraConfig = {
        ...(initial?.extraConfig ?? duplicateFrom?.extraConfig ?? {}),
      };
      if (thinkingLevel) extraConfig.thinkingLevel = thinkingLevel;
      else delete extraConfig.thinkingLevel;
      delete extraConfig.thinking_level;

      const input: ModelConfigInput = {
        name: name.trim(),
        modelId: modelId.trim(),
        provider: provider.trim(),
        apiType,
        capabilities,
        baseUrl: baseUrl.trim() || null,
        isDefault,
        extraConfig,
      };
      if (apiKey.trim()) input.apiKey = apiKey.trim();
      await onSubmit(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  const fieldPlaceholders = placeholdersForApiType(apiType);
  const capabilitySuggestions =
    apiType === 'vlm'
      ? [...new Set([...VLM_CAPABILITY_SUGGESTIONS, ...CAPABILITY_SUGGESTIONS])]
      : CAPABILITY_SUGGESTIONS;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card model-config-form" onClick={(event) => event.stopPropagation()}>
        <h2>{initial ? 'Edit model' : isCopy ? 'Copy model' : 'Add model'}</h2>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field">
              <span>Display name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={fieldPlaceholders.name}
                required
              />
            </label>
            <label className="form-field">
              <span>Model ID</span>
              <input
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                placeholder={fieldPlaceholders.modelId}
                required
              />
            </label>
            <label className="form-field">
              <span>Provider</span>
              <input
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                placeholder={fieldPlaceholders.provider}
                required
              />
            </label>
            <label className="form-field">
              <span>API format</span>
              <select value={apiType} onChange={(event) => setApiType(event.target.value as ModelApiType)}>
                {MODEL_API_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {MODEL_API_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field form-field-wide">
              <span>Base URL</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={fieldPlaceholders.baseUrl}
              />
              {apiType === 'vlm' && (
                <span className="admin-form-hint">VLM inference server endpoint (e.g. mlx-vlm-server).</span>
              )}
            </label>
            <label className="form-field form-field-wide">
              <span>
                API Key{' '}
                {initial?.hasApiKey && !isCopy ? '(leave blank to keep current)' : ''}
              </span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  initial?.hasApiKey && !isCopy ? '••••••••' : isCopy && duplicateFrom?.apiKey ? 'Copied from source' : 'Optional'
                }
                autoComplete="new-password"
              />
            </label>
            <div className="form-field form-field-wide">
              <span>Capabilities</span>
              <div className="capability-editor">
                <div className="capability-tags">
                  {capabilities.map((cap) => (
                    <button key={cap} type="button" className="capability-tag" onClick={() => removeCapability(cap)}>
                      {cap} ×
                    </button>
                  ))}
                </div>
                <div className="capability-input-row">
                  <input
                    value={capabilityInput}
                    onChange={(event) => setCapabilityInput(event.target.value)}
                    placeholder="Type and press Enter"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addCapability(capabilityInput);
                      }
                    }}
                  />
                  <button type="button" className="btn-secondary" onClick={() => addCapability(capabilityInput)}>
                    Add
                  </button>
                </div>
                <div className="capability-suggestions">
                  {capabilitySuggestions.filter((item) => !capabilities.includes(item)).map((item) => (
                    <button key={item} type="button" className="capability-suggestion" onClick={() => addCapability(item)}>
                      + {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <label className="form-field">
              <span>Reasoning effort</span>
              <select
                value={thinkingLevel}
                onChange={(event) => setThinkingLevel(event.target.value)}
              >
                {THINKING_LEVEL_OPTIONS.map((option) => (
                  <option key={option.id || 'default'} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="admin-form-hint">
                Use Off for models that stall after a short Reasoning block (e.g. some Qwen 3.7 routes).
              </span>
            </label>
            <label className="form-checkbox">
              <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
              <span>Set as default for this API format</span>
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
