import { useEffect, useRef, useState } from 'react';
import {
  fetchChannelProcessingOptions,
  type ChannelProcessingOptions,
} from '../api/documentChannels.ts';
import {
  fetchBuiltinAgentOptions,
  type BuiltinAgentOption,
} from '../api/builtinAgents.ts';
import { ResourceAccessPanel, type ResourceAccessPanelHandle } from './ResourceAccessPanel.tsx';

type ChannelSettingsModalProps = {
  channelId: string;
  initialName: string;
  initialDescription: string;
  initialPipelineId: string | null;
  initialAutoStartPipeline: boolean;
  initialMetadataExtractionAgentDefId: string | null;
  onCancel: () => void;
  onSubmit: (input: {
    name: string;
    description: string;
    pipelineId: string | null;
    autoStartPipeline: boolean;
    metadataExtractionAgentDefId: string | null;
  }) => Promise<void>;
};

type SettingsTab = 'general' | 'pipeline' | 'sharing';

function resolveMetadataAgentSelectValue(
  configuredId: string | null | undefined,
  options: BuiltinAgentOption[],
): string {
  if (!configuredId) return '';
  if (options.some((agent) => agent.id === configuredId)) {
    return configuredId;
  }
  return '';
}

export function ChannelSettingsModal({
  channelId,
  initialName,
  initialDescription,
  initialPipelineId,
  initialAutoStartPipeline,
  initialMetadataExtractionAgentDefId,
  onCancel,
  onSubmit,
}: ChannelSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [pipelineId, setPipelineId] = useState(initialPipelineId ?? '');
  const [autoStartPipeline, setAutoStartPipeline] = useState(initialAutoStartPipeline);
  const [metadataAgentId, setMetadataAgentId] = useState('');
  const [metadataAgentOptions, setMetadataAgentOptions] = useState<BuiltinAgentOption[]>([]);
  const [options, setOptions] = useState<ChannelProcessingOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sharingCanManage, setSharingCanManage] = useState(false);
  const sharingRef = useRef<ResourceAccessPanelHandle>(null);

  useEffect(() => {
    setName(initialName);
    setDescription(initialDescription);
    setPipelineId(initialPipelineId ?? '');
    setAutoStartPipeline(initialAutoStartPipeline);
    setError('');
    setTab('general');
    setSharingCanManage(false);
  }, [
    initialAutoStartPipeline,
    initialDescription,
    initialName,
    initialPipelineId,
  ]);

  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    setOptionsError('');
    void Promise.all([fetchChannelProcessingOptions(), fetchBuiltinAgentOptions('metadata_extract')])
      .then(([data, agentOptions]) => {
        if (cancelled) return;
        setOptions(data);
        setMetadataAgentOptions(agentOptions.agents);
        setMetadataAgentId(
          resolveMetadataAgentSelectValue(initialMetadataExtractionAgentDefId, agentOptions.agents),
        );
        setOptionsError('');
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
  }, [initialMetadataExtractionAgentDefId]);

  const selectedPipelineLabel =
    pipelineId && options
      ? (options.pipelines.find((pipeline) => pipeline.id === pipelineId)?.name ?? null)
      : null;

  const selectedMetadataAgentLabel =
    metadataAgentOptions.find((agent) => agent.id === metadataAgentId)?.name ?? null;

  async function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (tab === 'sharing') {
        const saved = await sharingRef.current?.save();
        if (saved) onCancel();
        return;
      }

      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        pipelineId: pipelineId || null,
        autoStartPipeline: pipelineId ? autoStartPipeline : false,
        metadataExtractionAgentDefId: metadataAgentId || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save channel settings');
    } finally {
      setBusy(false);
    }
  }

  const saveDisabled = busy || (tab === 'sharing' && !sharingCanManage);

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
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'sharing'}
            className={`modal-tab${tab === 'sharing' ? ' active' : ''}`}
            onClick={() => setTab('sharing')}
          >
            Sharing
          </button>
        </div>

        <form className="channel-settings-modal-form" onSubmit={(event) => void handleFormSubmit(event)}>
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
                      <select
                        value={pipelineId}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPipelineId(value);
                          if (!value) setAutoStartPipeline(false);
                        }}
                      >
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
                      </span>
                    </label>
                    {pipelineId && (
                      <label className="form-field form-field-wide channel-auto-start-field">
                        <span className="checkbox-row">
                          <input
                            type="checkbox"
                            className="brand-checkbox"
                            checked={autoStartPipeline}
                            onChange={(event) => setAutoStartPipeline(event.target.checked)}
                          />
                          Auto-start pipeline after upload
                        </span>
                      </label>
                    )}
                    <label className="form-field form-field-wide">
                      <span>Metadata extraction agent (optional)</span>
                      <select
                        value={metadataAgentId}
                        onChange={(event) => setMetadataAgentId(event.target.value)}
                      >
                        <option value="">— None —</option>
                        {metadataAgentOptions.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                            {agent.model_name ? ` (${agent.model_name})` : ''}
                          </option>
                        ))}
                      </select>
                      <span className="admin-form-hint">
                        Builtin agent for structured metadata extraction after parse.
                        {selectedMetadataAgentLabel
                          ? ` Selected: ${selectedMetadataAgentLabel}.`
                          : ' Metadata extraction disabled.'}
                      </span>
                    </label>
                  </>
                )}
              </div>
            )}

            {tab === 'sharing' && (
              <ResourceAccessPanel
                ref={sharingRef}
                showFooter={false}
                resourceType="document_channel"
                resourceId={channelId}
                resourceLabel={name.trim() || initialName}
                inheritHint="Documents inherit access rules from their channel. Sub-channels inherit parent channel rules."
                onCapabilitiesChange={({ canManage }) => setSharingCanManage(canManage)}
              />
            )}
          </div>

          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saveDisabled}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
