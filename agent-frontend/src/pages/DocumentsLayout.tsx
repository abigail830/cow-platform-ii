import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import {
  createDocumentChannel,
  deleteDocumentChannel,
  flattenChannels,
  listDocumentChannels,
  updateDocumentChannel,
  type DocumentChannel,
} from '../api/documentChannels.ts';
import { ChannelFormModal } from '../components/ChannelFormModal.tsx';
import { ChannelSettingsModal } from '../components/ChannelSettingsModal.tsx';
import { ChannelTreePanel } from '../components/ChannelTreePanel.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';
import { DocumentsOutletProvider } from './DocumentsOutletContext.tsx';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';

const PAGE = getNavPage('/knowledge/documents')!;

type ChannelModalState =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'settings'; channel: DocumentChannel };

export function DocumentsLayout() {
  const { user } = useAppOutletContext();
  const canWrite = useMemo(() => hasPermission(user, 'knowledge-management:documents', 'write'), [user]);

  const [channels, setChannels] = useState<DocumentChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [channelModal, setChannelModal] = useState<ChannelModalState | null>(null);

  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('documents-channel-split', 18, {
    minPct: 12,
    maxPct: 42,
  });

  const loadChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const tree = await listDocumentChannels();
      setChannels(tree);
      setSelectedChannelId((current) => {
        if (current && flattenChannels(tree).some((channel) => channel.id === current)) return current;
        const first = flattenChannels(tree)[0];
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
    const channel = await createDocumentChannel({
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
    autoStartPipeline: boolean;
    metadataExtractionAgentDefId: string | null;
  }) {
    if (!channelModal || channelModal.mode !== 'settings') return;
    await updateDocumentChannel(channelModal.channel.id, {
      name: input.name,
      description: input.description || null,
      pipelineId: input.pipelineId,
      autoStartPipeline: input.autoStartPipeline,
      metadataExtractionAgentDefId: input.metadataExtractionAgentDefId,
    });
    setChannelModal(null);
    await loadChannels();
  }

  async function handleDeleteChannel(channel: DocumentChannel) {
    if (!window.confirm(`Delete channel "${channel.name}"?`)) return;
    await deleteDocumentChannel(channel.id);
    if (selectedChannelId === channel.id) setSelectedChannelId(null);
    await loadChannels();
  }

  if (forbidden) return <Navigate to="/agents/playground" replace />;

  const createParentChannel =
    channelModal?.mode === 'create' && channelModal.parentId
      ? flattenChannels(channels).find((channel) => channel.id === channelModal.parentId) ?? null
      : null;

  const createInheritHint = createParentChannel
    ? (() => {
        const parts: string[] = [];
        if (createParentChannel.pipeline_id) parts.push('pipeline');
        if (createParentChannel.auto_start_pipeline && createParentChannel.pipeline_id) {
          parts.push('auto-start on upload');
        }
        if (createParentChannel.metadata_extraction_agent_def_id) {
          parts.push('metadata extraction agent');
        }
        if (parts.length === 0) return undefined;
        return `On create, this sub-channel will copy ${parts.join(', ')} from "${createParentChannel.name}". You can change these later in channel settings.`;
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
    openChannelSettings: (channel: DocumentChannel) => setChannelModal({ mode: 'settings', channel }),
  };

  return (
    <>
      <main className="admin-page documents-page">
        <header className="admin-header">
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>
            Organize source documents in channels and upload originals to object storage for later processing.
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
            onSelect={setSelectedChannelId}
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
            <DocumentsOutletProvider value={outletContext}>
              <Outlet />
            </DocumentsOutletProvider>
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
          initialAutoStartPipeline={channelModal.channel.auto_start_pipeline}
          initialMetadataExtractionAgentDefId={channelModal.channel.metadata_extraction_agent_def_id}
          onCancel={() => setChannelModal(null)}
          onSubmit={handleUpdateChannel}
        />
      )}
    </>
  );
}
