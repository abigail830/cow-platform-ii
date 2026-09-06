import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DEFAULT_KNOWLEDGE_POST_PROCESS_PIPELINE_NAME,
  DEFAULT_KNOWLEDGE_TRANSCRIPTION_PIPELINE_NAME,
  fetchChannelProcessingOptions,
  fetchDocumentChannelAsrHotwords,
  type ChannelProcessingOptions,
  type KnowledgeChannelProcessingOptions,
} from '../api/documentChannels.ts';
import type { AudioChannelProcessingOptions } from '../api/audioChannels.ts';
import { fetchChannelAsrHotwords, type ChannelAsrHotwordsResponse } from '../api/audioChannels.ts';
import { ResourceAccessPanel, type ResourceAccessPanelHandle } from './ResourceAccessPanel.tsx';
import type { ResourceType } from '../api/resourceAccess.ts';

type ChannelSettingsModalProps = {
  channelId: string;
  initialName: string;
  initialDescription: string;
  initialPipelineId: string | null;
  initialTranscriptionPipelineId?: string | null;
  initialPostProcessPipelineId?: string | null;
  initialAutoStartPipeline: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    name: string;
    description: string;
    pipelineId: string | null;
    transcriptionPipelineId?: string | null;
    postProcessPipelineId?: string | null;
    autoStartPipeline: boolean;
  }) => Promise<void>;
  resourceType?: ResourceType;
  fetchProcessingOptions?: () => Promise<
    ChannelProcessingOptions | AudioChannelProcessingOptions | KnowledgeChannelProcessingOptions
  >;
  audioPipelineMode?: boolean;
  knowledgePipelineMode?: boolean;
  sharingInheritHint?: string;
  /** When false, hide the Sharing tab (resource ACL editing requires manage). */
  canManageSharing?: boolean;
};

type SettingsTab = 'general' | 'pipeline' | 'hotwords' | 'sharing';

function isKnowledgeProcessingOptions(
  options: ChannelProcessingOptions | AudioChannelProcessingOptions | KnowledgeChannelProcessingOptions,
): options is KnowledgeChannelProcessingOptions {
  return 'documentPipelines' in options;
}

function isAudioProcessingOptions(
  options: ChannelProcessingOptions | AudioChannelProcessingOptions | KnowledgeChannelProcessingOptions,
): options is AudioChannelProcessingOptions {
  return 'transcriptionPipelines' in options && !('documentPipelines' in options);
}

export function ChannelSettingsModal({
  channelId,
  initialName,
  initialDescription,
  initialPipelineId,
  initialTranscriptionPipelineId = null,
  initialPostProcessPipelineId = null,
  initialAutoStartPipeline,
  onCancel,
  onSubmit,
  resourceType = 'document_channel',
  fetchProcessingOptions = fetchChannelProcessingOptions,
  audioPipelineMode = false,
  knowledgePipelineMode = false,
  sharingInheritHint = 'Documents inherit access rules from their channel. Sub-channels inherit parent channel rules.',
  canManageSharing = false,
}: ChannelSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [pipelineId, setPipelineId] = useState(initialPipelineId ?? '');
  const [transcriptionPipelineId, setTranscriptionPipelineId] = useState(initialTranscriptionPipelineId ?? '');
  const [postProcessPipelineId, setPostProcessPipelineId] = useState(initialPostProcessPipelineId ?? '');
  const [autoStartPipeline, setAutoStartPipeline] = useState(initialAutoStartPipeline);
  const [options, setOptions] = useState<
    ChannelProcessingOptions | AudioChannelProcessingOptions | KnowledgeChannelProcessingOptions | null
  >(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sharingCanManage, setSharingCanManage] = useState(false);
  const sharingRef = useRef<ResourceAccessPanelHandle>(null);
  const knowledgeDefaultsAppliedRef = useRef(false);
  const [channelHotwords, setChannelHotwords] = useState<ChannelAsrHotwordsResponse | null>(null);
  const [channelHotwordsLoading, setChannelHotwordsLoading] = useState(false);
  const [channelHotwordsError, setChannelHotwordsError] = useState('');

  useEffect(() => {
    setName(initialName);
    setDescription(initialDescription);
    setPipelineId(initialPipelineId ?? '');
    setTranscriptionPipelineId(initialTranscriptionPipelineId ?? '');
    setPostProcessPipelineId(initialPostProcessPipelineId ?? '');
    setAutoStartPipeline(initialAutoStartPipeline);
    setError('');
    setTab('general');
    setSharingCanManage(false);
    knowledgeDefaultsAppliedRef.current = false;
  }, [
    channelId,
    initialAutoStartPipeline,
    initialDescription,
    initialName,
    initialPipelineId,
    initialTranscriptionPipelineId,
    initialPostProcessPipelineId,
  ]);

  useEffect(() => {
    if (tab === 'sharing' && !canManageSharing) setTab('general');
  }, [canManageSharing, tab]);

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

  const showHotwordsTab = audioPipelineMode || knowledgePipelineMode;
  const fetchHotwords = knowledgePipelineMode ? fetchDocumentChannelAsrHotwords : fetchChannelAsrHotwords;

  useEffect(() => {
    if (!showHotwordsTab || tab !== 'hotwords') return;
    let cancelled = false;
    setChannelHotwordsLoading(true);
    setChannelHotwordsError('');
    void fetchHotwords(channelId)
      .then((data) => {
        if (!cancelled) setChannelHotwords(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setChannelHotwordsError(err instanceof Error ? err.message : 'Failed to load hotwords');
        }
      })
      .finally(() => {
        if (!cancelled) setChannelHotwordsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, fetchHotwords, showHotwordsTab, tab]);

  const documentPipelines =
    options && isKnowledgeProcessingOptions(options)
      ? options.documentPipelines
      : options && !isAudioProcessingOptions(options)
        ? options.pipelines
        : [];
  const transcriptionPipelines =
    options && isKnowledgeProcessingOptions(options)
      ? options.transcriptionPipelines
      : options && isAudioProcessingOptions(options)
        ? options.transcriptionPipelines
        : [];
  const postProcessPipelines =
    options && isKnowledgeProcessingOptions(options)
      ? options.postProcessPipelines
      : options && isAudioProcessingOptions(options)
        ? options.postProcessPipelines
        : [];

  const resolvedPostProcessPipelineId =
    postProcessPipelineId ||
    postProcessPipelines.find((pipeline) => pipeline.pipelineName === DEFAULT_KNOWLEDGE_POST_PROCESS_PIPELINE_NAME)
      ?.id ||
    postProcessPipelines[0]?.id ||
    '';

  useEffect(() => {
    if (!knowledgePipelineMode || !options || optionsLoading || knowledgeDefaultsAppliedRef.current) return;
    knowledgeDefaultsAppliedRef.current = true;

    if (!initialTranscriptionPipelineId) {
      const qwen = transcriptionPipelines.find(
        (pipeline) => pipeline.pipelineName === DEFAULT_KNOWLEDGE_TRANSCRIPTION_PIPELINE_NAME,
      );
      if (qwen) setTranscriptionPipelineId(qwen.id);
    }

    if (!initialPostProcessPipelineId) {
      const postProcess =
        postProcessPipelines.find(
          (pipeline) => pipeline.pipelineName === DEFAULT_KNOWLEDGE_POST_PROCESS_PIPELINE_NAME,
        ) ?? postProcessPipelines[0];
      if (postProcess) setPostProcessPipelineId(postProcess.id);
    }
  }, [
    initialPostProcessPipelineId,
    initialTranscriptionPipelineId,
    knowledgePipelineMode,
    options,
    optionsLoading,
    postProcessPipelines,
    transcriptionPipelines,
  ]);

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
        ...(audioPipelineMode || knowledgePipelineMode
          ? {
              postProcessPipelineId: knowledgePipelineMode
                ? resolvedPostProcessPipelineId || null
                : postProcessPipelineId || null,
            }
          : {}),
        ...(knowledgePipelineMode
          ? { transcriptionPipelineId: transcriptionPipelineId || null }
          : {}),
        autoStartPipeline: knowledgePipelineMode
          ? Boolean(pipelineId) && autoStartPipeline
          : pipelineId || transcriptionPipelineId
            ? autoStartPipeline
            : false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save channel settings');
    } finally {
      setBusy(false);
    }
  }

  const saveDisabled =
    busy || tab === 'hotwords' || (tab === 'sharing' && !sharingCanManage);

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
          {showHotwordsTab ? (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'hotwords'}
              className={`modal-tab${tab === 'hotwords' ? ' active' : ''}`}
              onClick={() => setTab('hotwords')}
            >
              Hotwords
            </button>
          ) : null}
          {canManageSharing ? (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'sharing'}
              className={`modal-tab${tab === 'sharing' ? ' active' : ''}`}
              onClick={() => setTab('sharing')}
            >
              Sharing
            </button>
          ) : null}
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
              <div className="channel-pipeline-tab">
                {optionsLoading ? (
                  <p className="admin-form-hint">Loading options…</p>
                ) : optionsError ? (
                  <p className="error">{optionsError}</p>
                ) : audioPipelineMode ? (
                  <>
                    <label className="channel-pipeline-row">
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
                    </label>
                    <label className="channel-pipeline-row">
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
                    </label>
                    <label className="channel-pipeline-check">
                      <span>Auto-start transcription after segment upload</span>
                      <input
                        type="checkbox"
                        className="brand-checkbox"
                        checked={Boolean(pipelineId) && autoStartPipeline}
                        disabled={!pipelineId}
                        onChange={(event) => setAutoStartPipeline(event.target.checked)}
                      />
                    </label>
                  </>
                ) : knowledgePipelineMode ? (
                  <>
                    <section className="channel-pipeline-section" aria-labelledby="channel-pipeline-document-heading">
                      <h3 id="channel-pipeline-document-heading" className="channel-pipeline-section-title">
                        Document files
                      </h3>
                      <p className="channel-pipeline-section-hint">
                        PDF, images, and Office files uploaded as single-file document captures.
                      </p>
                      <label className="channel-pipeline-row">
                        <span>Document parse pipeline</span>
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
                      </label>
                      <label className="channel-pipeline-check">
                        <span>Auto-start document parse after upload</span>
                        <input
                          type="checkbox"
                          className="brand-checkbox"
                          checked={Boolean(pipelineId) && autoStartPipeline}
                          disabled={!pipelineId}
                          onChange={(event) => setAutoStartPipeline(event.target.checked)}
                        />
                      </label>
                    </section>

                    <section
                      className="channel-pipeline-section"
                      aria-labelledby="channel-pipeline-capture-heading"
                    >
                      <h3 id="channel-pipeline-capture-heading" className="channel-pipeline-section-title">
                        Audio &amp; transcript captures
                      </h3>
                      <p className="channel-pipeline-section-hint">
                        Multi-segment audio recordings and transcript file uploads. Transcription defaults to
                        Qwen-Audio; segments run post-process when ready.
                      </p>
                      <label className="channel-pipeline-row">
                        <span>Transcription pipeline</span>
                        <select
                          value={transcriptionPipelineId}
                          onChange={(event) => setTranscriptionPipelineId(event.target.value)}
                        >
                          <option value="">— None —</option>
                          {transcriptionPipelines.map((pipeline) => (
                            <option key={pipeline.id} value={pipeline.id}>
                              {pipeline.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="channel-pipeline-row">
                        <span>Post-process pipeline</span>
                        <select
                          value={resolvedPostProcessPipelineId}
                          onChange={(event) => setPostProcessPipelineId(event.target.value)}
                          disabled={postProcessPipelines.length <= 1}
                        >
                          {postProcessPipelines.map((pipeline) => (
                            <option key={pipeline.id} value={pipeline.id}>
                              {pipeline.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </section>
                  </>
                ) : (
                  <>
                    <label className="channel-pipeline-row">
                      <span>Pipeline</span>
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
                    </label>
                    <label className="channel-pipeline-check">
                      <span>Auto-start pipeline after upload</span>
                      <input
                        type="checkbox"
                        className="brand-checkbox"
                        checked={Boolean(pipelineId) && autoStartPipeline}
                        disabled={!pipelineId}
                        onChange={(event) => setAutoStartPipeline(event.target.checked)}
                      />
                    </label>
                  </>
                )}
              </div>
            )}

            {tab === 'hotwords' && (
              <div className="channel-hotwords-tab">
                <p className="admin-form-hint channel-hotwords-tab-intro">
                  Read-only list of ASR hotwords linked to this channel. Edit associations in{' '}
                  <Link to="/knowledge/asr-hotwords" onClick={onCancel}>ASR Hotwords</Link>.
                </p>
                {channelHotwordsLoading ? (
                  <p className="admin-form-hint">Loading hotwords…</p>
                ) : channelHotwordsError ? (
                  <p className="error">{channelHotwordsError}</p>
                ) : channelHotwords && channelHotwords.hotwords.length > 0 ? (
                  <div className="admin-table-wrap channel-hotwords-table-wrap">
                    <table className="admin-table channel-hotwords-table">
                      <thead>
                        <tr>
                          <th>Text</th>
                          <th>Weight</th>
                          <th>Lang</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {channelHotwords.hotwords.map((hotword) => (
                          <tr key={hotword.id}>
                            <td>{hotword.text}</td>
                            <td>{hotword.weight}</td>
                            <td>{hotword.lang ?? '—'}</td>
                            <td>
                              <span className="channel-hotwords-note">{hotword.note ?? '—'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="admin-form-hint">No hotwords linked to this channel.</p>
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
            {tab === 'hotwords' && channelHotwords?.asr_vocabulary_synced_at ? (
              <p className="admin-form-hint channel-hotwords-sync-meta">
                Vocabulary synced at {new Date(channelHotwords.asr_vocabulary_synced_at).toLocaleString()}
                {channelHotwords.asr_vocabulary_target_model
                  ? ` for ${channelHotwords.asr_vocabulary_target_model}.`
                  : '.'}
              </p>
            ) : null}
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            {tab !== 'hotwords' ? (
              <button type="submit" className="btn-primary" disabled={saveDisabled}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
