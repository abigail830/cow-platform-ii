import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import {
  createDocumentChannel,
  deleteDocumentChannel,
  flattenChannels,
  listDocumentChannels,
  updateDocumentChannel,
  type DocumentChannel,
} from '../api/documentChannels.ts';
import { deleteDocumentCapture } from '../api/documentCaptures.ts';
import {
  listChannelKnowledgeItems,
  type ChannelKnowledgeItem,
} from '../api/documents.ts';
import { ChannelFormModal } from '../components/ChannelFormModal.tsx';
import { ChannelSettingsModal } from '../components/ChannelSettingsModal.tsx';
import {
  KnowledgeChannelTreePanel,
  type KnowledgeTreeSelection,
} from '../components/KnowledgeChannelTreePanel.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';
import { DocumentsOutletProvider } from './DocumentsOutletContext.tsx';
import { ResizableSplitHandle } from '../components/ResizableSplitHandle.tsx';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';

const PAGE = getNavPage('/knowledge/documents')!;

type ChannelModalState =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'settings'; channel: DocumentChannel };

function ancestorChannelIds(channels: DocumentChannel[], channelId: string): string[] {
  const flat = flattenChannels(channels);
  const byId = new Map(flat.map((channel) => [channel.id, channel]));
  const ancestors: string[] = [];
  let current = byId.get(channelId);
  while (current?.parent_id) {
    ancestors.push(current.parent_id);
    current = byId.get(current.parent_id);
  }
  return ancestors;
}

function rootChannelIds(channels: DocumentChannel[]): string[] {
  return channels.map((channel) => channel.id);
}

export function DocumentsLayout() {
  const { user } = useAppOutletContext();
  const navigate = useNavigate();
  const location = useLocation();
  const captureMatch = useMatch('/knowledge/documents/captures/:captureId');

  const canWrite = useMemo(() => hasPermission(user, 'knowledge-management:documents', 'write'), [user]);

  const [channels, setChannels] = useState<DocumentChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [expandedChannelIds, setExpandedChannelIds] = useState<Set<string>>(() => new Set());
  const [channelItems, setChannelItems] = useState<Record<string, ChannelKnowledgeItem[]>>({});
  const [loadingChannelIds, setLoadingChannelIds] = useState<Set<string>>(() => new Set());
  const [deletingItemIds, setDeletingItemIds] = useState<Set<string>>(() => new Set());
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [channelModal, setChannelModal] = useState<ChannelModalState | null>(null);

  const {
    containerRef,
    leftPct,
    isDragging,
    leftCollapsed,
    onHandleMouseDown,
    collapseLeft,
    expandLeft,
    resetLeftSize,
  } = useResizableSplit('documents-channel-split', 18, {
    minPct: 12,
    maxPct: 42,
    collapsibleLeft: true,
  });

  const isListRoute = location.pathname === '/knowledge/documents';

  const selectedItem = useMemo((): ChannelKnowledgeItem | null => {
    if (!captureMatch?.params.captureId) return null;

    for (const items of Object.values(channelItems)) {
      const found = items.find((item) => item.id === captureMatch.params.captureId);
      if (found) return found;
    }

    return {
      kind: 'capture',
      id: captureMatch.params.captureId,
      channel_id: selectedChannelId ?? '',
      name: '',
      title: '',
      brief: null,
      input_mode: 'document',
      file_count: 0,
      size_bytes: 0,
      status: '',
      updated_at: '',
      created_at: '',
      pipeline_job: null,
      primary_segment_id: null,
      segment_status: null,
      segment_pipeline_job: null,
    };
  }, [captureMatch?.params.captureId, channelItems, selectedChannelId]);

  const treeSelection = useMemo((): KnowledgeTreeSelection | null => {
    if (selectedItem) return { type: 'item', item: selectedItem };
    if (selectedChannelId && isListRoute) return { type: 'channel', channelId: selectedChannelId };
    return null;
  }, [isListRoute, selectedChannelId, selectedItem]);

  const loadItemsForChannel = useCallback(async (channelId: string) => {
    setLoadingChannelIds((current) => new Set(current).add(channelId));
    try {
      const result = await listChannelKnowledgeItems({ channelId, limit: 200 });
      setChannelItems((current) => ({ ...current, [channelId]: result.items }));
    } catch {
      setChannelItems((current) => ({ ...current, [channelId]: [] }));
    } finally {
      setLoadingChannelIds((current) => {
        const next = new Set(current);
        next.delete(channelId);
        return next;
      });
    }
  }, []);

  const refreshChannelItems = useCallback(
    async (channelId?: string) => {
      if (channelId) {
        await loadItemsForChannel(channelId);
        return;
      }
      const ids = Object.keys(channelItems);
      await Promise.all(ids.map((id) => loadItemsForChannel(id)));
    },
    [channelItems, loadItemsForChannel],
  );

  const loadChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const tree = await listDocumentChannels();
      setChannels(tree);
      setExpandedChannelIds((current) => {
        const next = new Set(current);
        for (const id of rootChannelIds(tree)) next.add(id);
        return next;
      });
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

  useEffect(() => {
    if (!selectedChannelId) return;
    setExpandedChannelIds((current) => {
      const next = new Set(current);
      next.add(selectedChannelId);
      for (const id of ancestorChannelIds(channels, selectedChannelId)) next.add(id);
      return next;
    });
    if (channelItems[selectedChannelId] === undefined) {
      void loadItemsForChannel(selectedChannelId);
    }
  }, [channelItems, channels, loadItemsForChannel, selectedChannelId]);

  useEffect(() => {
    if (!selectedItem?.channel_id) return;
    const channelId = selectedItem.channel_id;
    setSelectedChannelId(channelId);
    setExpandedChannelIds((current) => {
      const next = new Set(current);
      next.add(channelId);
      for (const id of ancestorChannelIds(channels, channelId)) next.add(id);
      return next;
    });
    if (channelItems[channelId] === undefined) {
      void loadItemsForChannel(channelId);
    }
  }, [channelItems, channels, loadItemsForChannel, selectedItem?.channel_id]);

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
    if (parentId) {
      setExpandedChannelIds((current) => new Set(current).add(parentId));
    }
    navigate('/knowledge/documents');
  }

  async function handleUpdateChannel(input: {
    name: string;
    description: string;
    pipelineId: string | null;
    transcriptionPipelineId?: string | null;
    postProcessPipelineId?: string | null;
    autoStartPipeline: boolean;
  }) {
    if (!channelModal || channelModal.mode !== 'settings') return;
    await updateDocumentChannel(channelModal.channel.id, {
      name: input.name,
      description: input.description || null,
      pipelineId: input.pipelineId,
      transcriptionPipelineId: input.transcriptionPipelineId,
      postProcessPipelineId: input.postProcessPipelineId,
      autoStartPipeline: input.autoStartPipeline,
    });
    setChannelModal(null);
    await loadChannels();
  }

  async function handleDeleteChannel(channel: DocumentChannel) {
    const confirmed = window.confirm(
      `Delete channel "${channel.name}" and all sub-channels, documents, and stored pipeline files? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await deleteDocumentChannel(channel.id);
      if (selectedChannelId === channel.id) setSelectedChannelId(null);
      await loadChannels();
      navigate('/knowledge/documents');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to delete channel');
    }
  }

  async function handleDeleteItem(item: ChannelKnowledgeItem) {
    setDeletingItemIds((current) => new Set(current).add(item.id));
    try {
      await deleteDocumentCapture(item.id);
      await loadItemsForChannel(item.channel_id);
      if (selectedItem?.id === item.id) {
        navigate('/knowledge/documents');
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to delete item');
    } finally {
      setDeletingItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  function handleCollapseAllChannels() {
    setExpandedChannelIds(new Set());
  }

  function handleToggleExpand(channelId: string) {
    setExpandedChannelIds((current) => {
      const next = new Set(current);
      const willExpand = !next.has(channelId);
      if (willExpand) {
        next.add(channelId);
        if (channelItems[channelId] === undefined) {
          void loadItemsForChannel(channelId);
        }
      } else {
        next.delete(channelId);
      }
      return next;
    });
  }

  function handleSelectChannel(channelId: string) {
    setSelectedChannelId(channelId);
    setExpandedChannelIds((current) => {
      const next = new Set(current);
      next.add(channelId);
      for (const id of ancestorChannelIds(channels, channelId)) next.add(id);
      return next;
    });
    if (channelItems[channelId] === undefined) {
      void loadItemsForChannel(channelId);
    }
    navigate('/knowledge/documents');
  }

  function handleSelectItem(item: ChannelKnowledgeItem) {
    setSelectedChannelId(item.channel_id);
    navigate(`/knowledge/documents/captures/${item.id}`);
  }

  if (forbidden) return <Navigate to="/" replace />;

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
    refreshChannelItems,
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
          className={`documents-layout${leftCollapsed ? ' documents-layout--left-collapsed' : ''}`}
          style={{ ['--documents-left-pct' as string]: `${leftPct}%` }}
        >
          <KnowledgeChannelTreePanel
            channels={channels}
            selection={treeSelection}
            expandedChannelIds={expandedChannelIds}
            channelItems={channelItems}
            loadingChannelIds={loadingChannelIds}
            deletingItemIds={deletingItemIds}
            canCreateRoot={canWrite}
            onToggleExpand={handleToggleExpand}
            onSelectChannel={handleSelectChannel}
            onSelectItem={handleSelectItem}
            onDeleteItem={(item) => void handleDeleteItem(item)}
            onCreateRoot={() => setChannelModal({ mode: 'create', parentId: null })}
            onCreateChild={(parentId) => setChannelModal({ mode: 'create', parentId })}
            onSettings={(channel) => setChannelModal({ mode: 'settings', channel })}
            onDeleteChannel={(channel) => void handleDeleteChannel(channel)}
            onCollapseAll={handleCollapseAllChannels}
          />

          <ResizableSplitHandle
            isDragging={isDragging}
            leftCollapsed={leftCollapsed}
            collapsibleLeft
            ariaLabel="Resize channel panel"
            onMouseDown={onHandleMouseDown}
            onCollapseLeft={collapseLeft}
            onExpandLeft={expandLeft}
            onDoubleClick={resetLeftSize}
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
          initialTranscriptionPipelineId={channelModal.channel.transcription_pipeline_id}
          initialPostProcessPipelineId={channelModal.channel.post_process_pipeline_id}
          initialAutoStartPipeline={channelModal.channel.auto_start_pipeline}
          knowledgePipelineMode
          canManageSharing={Boolean(channelModal.channel.my_access?.manage)}
          onCancel={() => setChannelModal(null)}
          onSubmit={handleUpdateChannel}
        />
      )}
    </>
  );
}
