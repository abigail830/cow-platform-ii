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
    metadataExtractionModelId: string | null;
  }) {
    if (!channelModal || channelModal.mode !== 'settings') return;
    await updateDocumentChannel(channelModal.channel.id, {
      name: input.name,
      description: input.description || null,
      pipelineId: input.pipelineId,
      metadataExtractionModelId: input.metadataExtractionModelId,
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

  if (forbidden) return <Navigate to="/chat" replace />;

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

        <div className="documents-layout">
          <ChannelTreePanel
            channels={channels}
            selectedId={selectedChannelId}
            canWrite={canWrite}
            onSelect={setSelectedChannelId}
            onCreateRoot={() => setChannelModal({ mode: 'create', parentId: null })}
            onCreateChild={(parentId) => setChannelModal({ mode: 'create', parentId })}
            onSettings={(channel) => setChannelModal({ mode: 'settings', channel })}
            onDelete={(channel) => void handleDeleteChannel(channel)}
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
          onCancel={() => setChannelModal(null)}
          onSubmit={handleCreateChannel}
        />
      )}
      {channelModal?.mode === 'settings' && (
        <ChannelSettingsModal
          initialName={channelModal.channel.name}
          initialDescription={channelModal.channel.description ?? ''}
          initialPipelineId={channelModal.channel.pipeline_id}
          initialMetadataExtractionModelId={channelModal.channel.metadata_extraction_model_id}
          onCancel={() => setChannelModal(null)}
          onSubmit={handleUpdateChannel}
        />
      )}
    </>
  );
}
