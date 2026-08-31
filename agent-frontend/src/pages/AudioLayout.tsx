import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  createAudioChannel,
  deleteAudioChannel,
  flattenAudioChannels,
  listAudioChannels,
  updateAudioChannel,
  fetchAudioChannelProcessingOptions,
  type AudioChannel,
} from '../api/audioChannels.ts';
import { ChannelFormModal } from '../components/ChannelFormModal.tsx';
import { ChannelSettingsModal } from '../components/ChannelSettingsModal.tsx';
import { ChannelTreePanel } from '../components/ChannelTreePanel.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';
import { AudioOutletProvider } from './AudioOutletContext.tsx';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';

const PAGE = getNavPage('/knowledge/audio')!;
const AUDIO_LIST_PATH = '/knowledge/audio';

type ChannelModalState =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'settings'; channel: AudioChannel };

export function AudioLayout() {
  const { user } = useAppOutletContext();
  const navigate = useNavigate();
  const location = useLocation();
  const canWrite = useMemo(() => hasPermission(user, 'knowledge-management:audio', 'write'), [user]);

  const [channels, setChannels] = useState<AudioChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [channelModal, setChannelModal] = useState<ChannelModalState | null>(null);

  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('audio-channel-split', 18, {
    minPct: 12,
    maxPct: 42,
  });

  const loadChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const tree = await listAudioChannels();
      setChannels(tree);
      setSelectedChannelId((current) => {
        if (current && flattenAudioChannels(tree).some((channel) => channel.id === current)) return current;
        const first = flattenAudioChannels(tree)[0];
        return first?.id ?? null;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load channels';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) setForbidden(true);
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  async function handleCreateChannel(input: { name: string; description: string }) {
    const parentId = channelModal?.mode === 'create' ? channelModal.parentId : null;
    const channel = await createAudioChannel({
      name: input.name,
      description: input.description || undefined,
      parentId,
    });
    setChannelModal(null);
    await loadChannels();
    setSelectedChannelId(channel.id);
  }

  async function handleUpdateChannel(input: {
    name: string;
    description: string;
    pipelineId: string | null;
    postProcessPipelineId?: string | null;
    autoStartPipeline: boolean;
  }) {
    if (!channelModal || channelModal.mode !== 'settings') return;
    await updateAudioChannel(channelModal.channel.id, {
      name: input.name,
      description: input.description || null,
      pipelineId: input.pipelineId,
      postProcessPipelineId: input.postProcessPipelineId,
      autoStartPipeline: input.autoStartPipeline,
    });
    setChannelModal(null);
    await loadChannels();
  }

  async function handleDeleteChannel(channel: AudioChannel) {
    if (!window.confirm(`Delete channel "${channel.name}"?`)) return;
    await deleteAudioChannel(channel.id);
    if (selectedChannelId === channel.id) setSelectedChannelId(null);
    await loadChannels();
  }

  const handleSelectChannel = useCallback(
    (channelId: string) => {
      setSelectedChannelId(channelId);
      if (location.pathname.startsWith(`${AUDIO_LIST_PATH}/`)) {
        navigate(AUDIO_LIST_PATH);
      }
    },
    [location.pathname, navigate],
  );

  if (forbidden) return <Navigate to="/agents/playground" replace />;

  const createInheritHint =
    channelModal?.mode === 'create' && channelModal.parentId
      ? (() => {
          const parent = flattenAudioChannels(channels).find((c) => c.id === channelModal.parentId);
          return parent?.pipeline_id
            ? 'Sub-channels inherit the parent pipeline and auto-start setting.'
            : undefined;
        })()
      : undefined;

  const outletContext = {
    channels,
    selectedChannelId,
    setSelectedChannelId,
    canWrite,
    loadingChannels,
    loadChannels,
    openCreateChannel: (parentId: string | null) => setChannelModal({ mode: 'create', parentId }),
    openChannelSettings: (channel: AudioChannel) => setChannelModal({ mode: 'settings', channel }),
  };

  return (
    <>
      <main className="admin-page documents-page">
        <header className="admin-header">
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>
            Upload meeting recordings as multi-segment captures, run ASR per segment, then post-process into structured knowledge.
          </AdminPageDescription>
        </header>

        <div
          ref={containerRef}
          className="documents-layout"
          style={{ ['--documents-left-pct' as string]: `${leftPct}%` }}
        >
          <ChannelTreePanel
            channels={channels}
            selectedId={selectedChannelId}
            canCreateRoot={canWrite}
            emptyMessage="No channels yet. Create one to organize audio files."
            onSelect={handleSelectChannel}
            onCreateRoot={() => setChannelModal({ mode: 'create', parentId: null })}
            onCreateChild={(parentId) => setChannelModal({ mode: 'create', parentId })}
            onSettings={(channel) => setChannelModal({ mode: 'settings', channel })}
            onDelete={(channel) => void handleDeleteChannel(channel)}
          />

          <div
            className="documents-split-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize channel panel"
            onMouseDown={onHandleMouseDown}
          />

          <section className="documents-main-panel">
            <AudioOutletProvider value={outletContext}>
              <Outlet />
            </AudioOutletProvider>
          </section>
        </div>
      </main>

      {channelModal?.mode === 'create' && (
        <ChannelFormModal
          title={channelModal.parentId ? 'New sub-channel' : 'New channel'}
          submitLabel="Create channel"
          inheritHint={createInheritHint}
          onCancel={() => setChannelModal(null)}
          onSubmit={handleCreateChannel}
        />
      )}
      {channelModal?.mode === 'settings' && (
        <ChannelSettingsModal
          channelId={channelModal.channel.id}
          initialName={channelModal.channel.name}
          initialDescription={channelModal.channel.description ?? ''}
          initialPipelineId={channelModal.channel.pipeline_id}
          initialPostProcessPipelineId={channelModal.channel.post_process_pipeline_id}
          initialAutoStartPipeline={channelModal.channel.auto_start_pipeline}
          resourceType="audio_channel"
          audioPipelineMode
          fetchProcessingOptions={fetchAudioChannelProcessingOptions}
          sharingInheritHint="Audio files inherit access rules from their channel. Sub-channels inherit parent channel rules."
          canManageSharing={Boolean(channelModal.channel.my_access?.manage)}
          onCancel={() => setChannelModal(null)}
          onSubmit={handleUpdateChannel}
        />
      )}
    </>
  );
}
