import { useEffect, useRef, useState } from 'react';
import {
  fetchChannelProcessingOptions,
  type ChannelProcessingOptions,
} from '../api/documentChannels.ts';
import type { AudioChannelProcessingOptions } from '../api/audioChannels.ts';
import { ResourceAccessPanel, type ResourceAccessPanelHandle } from './ResourceAccessPanel.tsx';
import type { ResourceType } from '../api/resourceAccess.ts';

type ChannelSettingsModalProps = {
  channelId: string;
  initialName: string;
  initialDescription: string;
  initialPipelineId: string | null;
  initialPostProcessPipelineId?: string | null;
  initialAutoStartPipeline: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    name: string;
    description: string;
    pipelineId: string | null;
    postProcessPipelineId?: string | null;
    autoStartPipeline: boolean;
  }) => Promise<void>;
  resourceType?: ResourceType;
  fetchProcessingOptions?: () => Promise<ChannelProcessingOptions | AudioChannelProcessingOptions>;
  pipelineHint?: string;
  postProcessPipelineHint?: string;
  audioPipelineMode?: boolean;
  sharingInheritHint?: string;
};

type SettingsTab = 'general' | 'pipeline' | 'sharing';

function isAudioProcessingOptions(
  options: ChannelProcessingOptions | AudioChannelProcessingOptions,
): options is AudioChannelProcessingOptions {
  return 'transcriptionPipelines' in options;
}

export function ChannelSettingsModal({
  channelId,
  initialName,
  initialDescription,
  initialPipelineId,
  initialPostProcessPipelineId = null,
  initialAutoStartPipeline,
  onCancel,
  onSubmit,
  resourceType = 'document_channel',
  fetchProcessingOptions = fetchChannelProcessingOptions,
  pipelineHint = 'When set, documents in this channel run this parse pipeline (CLI worker + Config YAML, including metadata extract).',
  postProcessPipelineHint = 'Runs after all segments are transcribed (merge → structure → classify → extract).',
  audioPipelineMode = false,
  sharingInheritHint = 'Documents inherit access rules from their channel. Sub-channels inherit parent channel rules.',
}: ChannelSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [pipelineId, setPipelineId] = useState(initialPipelineId ?? '');
  const [postProcessPipelineId, setPostProcessPipelineId] = useState(initialPostProcessPipelineId ?? '');
  const [autoStartPipeline, setAutoStartPipeline] = useState(initialAutoStartPipeline);
  const [options, setOptions] = useState<ChannelProcessingOptions | AudioChannelProcessingOptions | null>(
    null,
  );
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
    setPostProcessPipelineId(initialPostProcessPipelineId ?? '');
    setAutoStartPipeline(initialAutoStartPipeline);
    setError('');
    setTab('general');
    setSharingCanManage(false);
  }, [
    initialAutoStartPipeline,
    initialDescription,
    initialName,
    initialPipelineId,
    initialPostProcessPipelineId,
  ]);

  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    setOptionsError('');
    void fetchProcessingOptions()
      .then((data) => {
        if (cancelled) return;
        setOptions(data);
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
  }, [fetchProcessingOptions]);

  const documentPipelines =
    options && !isAudioProcessingOptions(options) ? options.pipelines : [];
  const transcriptionPipelines =
    options && isAudioProcessingOptions(options) ? options.transcriptionPipelines : [];
  const postProcessPipelines =
    options && isAudioProcessingOptions(options) ? options.postProcessPipelines : [];

  const selectedPipelineLabel = audioPipelineMode
    ? (pipelineId
        ? (transcriptionPipelines.find((pipeline) => pipeline.id === pipelineId)?.name ?? null)
        : null)
    : pipelineId
      ? (documentPipelines.find((pipeline) => pipeline.id === pipelineId)?.name ?? null)
      : null;

  const selectedPostProcessLabel = postProcessPipelineId
    ? (postProcessPipelines.find((pipeline) => pipeline.id === postProcessPipelineId)?.name ?? null)
    : null;

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
        ...(audioPipelineMode
          ? { postProcessPipelineId: postProcessPipelineId || null }
          : {}),
        autoStartPipeline: pipelineId ? autoStartPipeline : false,
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
                ) : audioPipelineMode ? (
                  <>
                    <div className="channel-transcription-section">
                      <label className="form-field">
                        <span>Transcription pipeline</span>
                        <select
                          value={pipelineId}
                          onChange={(event) => {
                            const value = event.target.value;
                            setPipelineId(value);
                            if (!value) setAutoStartPipeline(false);
                          }}
                        >
                          <option value="">— None —</option>
                          {transcriptionPipelines.map((pipeline) => (
                            <option key={pipeline.id} value={pipeline.id}>
                              {pipeline.name}
                            </option>
                          ))}
                        </select>
                        <span className="admin-form-hint">
                          {pipelineHint}
                          {selectedPipelineLabel
                            ? ` Selected: ${selectedPipelineLabel}.`
                            : ' No transcription pipeline selected.'}
                        </span>
                      </label>
                      {pipelineId ? (
                        <label className="channel-auto-start-field">
                          <span className="checkbox-row">
                            <input
                              type="checkbox"
                              className="brand-checkbox"
                              checked={autoStartPipeline}
                              onChange={(event) => setAutoStartPipeline(event.target.checked)}
                            />
                            Auto-start transcription after segment upload
                          </span>
                        </label>
                      ) : null}
                    </div>
                    <label className="form-field form-field-wide">
                      <span>Post-process pipeline</span>
                      <select
                        value={postProcessPipelineId}
                        onChange={(event) => setPostProcessPipelineId(event.target.value)}
                      >
                        <option value="">— System default —</option>
                        {postProcessPipelines.map((pipeline) => (
                          <option key={pipeline.id} value={pipeline.id}>
                            {pipeline.name}
                          </option>
                        ))}
                      </select>
                      <span className="admin-form-hint">
                        {postProcessPipelineHint}
                        {selectedPostProcessLabel
                          ? ` Selected: ${selectedPostProcessLabel}.`
                          : ' Uses the enabled system default when unset.'}
                      </span>
                    </label>
                  </>
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
                        {documentPipelines.map((pipeline) => (
                          <option key={pipeline.id} value={pipeline.id}>
                            {pipeline.name}
                          </option>
                        ))}
                      </select>
                      <span className="admin-form-hint">
                        {pipelineHint}
                        {selectedPipelineLabel
                          ? ` Selected: ${selectedPipelineLabel}.`
                          : ' No pipeline selected.'}
                      </span>
                    </label>
                    {pipelineId ? (
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
                    ) : null}
                  </>
                )}
              </div>
            )}

            {tab === 'sharing' && (
              <ResourceAccessPanel
                ref={sharingRef}
                showFooter={false}
                resourceType={resourceType}
                resourceId={channelId}
                resourceLabel={name.trim() || initialName}
                inheritHint={sharingInheritHint}
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
