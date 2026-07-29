import { useEffect, useState } from 'react';
import {
  MODEL_API_TYPES,
  MODEL_API_TYPE_LABELS,
  type ModelApiType,
  type ModelConfig,
  type ModelConfigInput,
} from '../api/models.ts';

type ModelConfigFormProps = {
  initial?: ModelConfig | null;
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
  return {
    name: 'My model',
    modelId: 'provider/model-name',
    provider: 'Provider',
    baseUrl: 'https://api.example.com/v1',
  };
}

export function ModelConfigForm({ initial, onSubmit, onCancel }: ModelConfigFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [modelId, setModelId] = useState(initial?.modelId ?? '');
  const [provider, setProvider] = useState(initial?.provider ?? '');
  const [apiType, setApiType] = useState<ModelApiType>(initial?.apiType ?? 'chat-completions');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>(initial?.capabilities ?? []);
  const [capabilityInput, setCapabilityInput] = useState('');
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(initial?.name ?? '');
    setModelId(initial?.modelId ?? '');
    setProvider(initial?.provider ?? '');
    setApiType(initial?.apiType ?? 'chat-completions');
    setBaseUrl(initial?.baseUrl ?? '');
    setApiKey('');
    setCapabilities(initial?.capabilities ?? []);
    setIsDefault(initial?.isDefault ?? false);
    setError('');
  }, [initial]);

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
      const input: ModelConfigInput = {
        name: name.trim(),
        modelId: modelId.trim(),
        provider: provider.trim(),
        apiType,
        capabilities,
        baseUrl: baseUrl.trim() || null,
        isDefault,
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
        <h2>{initial ? 'Edit model' : 'Add model'}</h2>
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
              <span>API Key {initial?.hasApiKey ? '(leave blank to keep current)' : ''}</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={initial?.hasApiKey ? '••••••••' : 'Optional'}
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
