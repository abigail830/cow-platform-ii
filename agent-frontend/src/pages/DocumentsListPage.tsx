import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { flattenChannels } from '../api/documentChannels.ts';
import {
  bulkDocumentUpload,
  bulkSegmentCaptureUpload,
  createDocumentCapture,
  deleteDocumentCapture,
  moveDocumentCapture,
  runCapturePipeline,
  runCaptureSegmentPipeline,
  uploadCaptureAudioSegment,
  uploadCaptureTranscriptSegment,
} from '../api/documentCaptures.ts';
import {
  formatDocumentBytes,
  listChannelKnowledgeItems,
  type ChannelKnowledgeItem,
} from '../api/documents.ts';
import {
  isKnowledgeItemPipelineActive,
  isKnowledgeItemRunBusy,
  knowledgeItemRunActionLabel,
  knowledgeItemRunBusyLabel,
  resolveKnowledgeItemRunTarget,
} from '../api/knowledge-item-pipeline.ts';
import {
  KnowledgePipelineStatus,
  knowledgeKindLabel,
} from '../components/KnowledgePipelineStatus.tsx';
import { KnowledgeUploadModal } from '../components/KnowledgeUploadModal.tsx';
import { DocumentMoveModal } from '../components/DocumentMoveModal.tsx';
import { IconDelete, IconMove, IconView } from '../components/AdminActionIcons.tsx';
import { KnowledgeFileTypeIcon } from '../components/icons/file-type-icon.tsx';
import { Loader2, Play, Search } from 'lucide-react';
import { useDocumentsOutletContext } from './DocumentsOutletContext.tsx';
import { channelHasWriteAccess } from '../shared/channel-access.ts';
import { buildChannelPath } from '../shared/channel-path.ts';

import { iconProps } from '../components/icons/icon-props.ts';

function itemDetailPath(item: ChannelKnowledgeItem): string {
  return `/knowledge/documents/captures/${item.id}`;
}

function itemDisplayName(item: ChannelKnowledgeItem): string {
  return item.title || item.name;
}

function itemFileCount(item: ChannelKnowledgeItem): number {
  return item.file_count;
}

function isItemPipelineActive(item: ChannelKnowledgeItem): boolean {
  return isKnowledgeItemPipelineActive(item);
}

export function DocumentsListPage() {
  const { channels, selectedChannelId, loadingChannels, refreshChannelItems } = useDocumentsOutletContext();

  const [items, setItems] = useState<ChannelKnowledgeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [movingItem, setMovingItem] = useState<ChannelKnowledgeItem | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [runningItemIds, setRunningItemIds] = useState<Set<string>>(new Set());

  const flatChannels = useMemo(() => flattenChannels(channels), [channels]);
  const selectedChannel = flatChannels.find((channel) => channel.id === selectedChannelId) ?? null;
  const selectedChannelPath = selectedChannel
    ? buildChannelPath(flatChannels, selectedChannel.id)
    : '';
  const canWriteChannel = channelHasWriteAccess(selectedChannel);

  const loadItems = useCallback(async (options?: { silent?: boolean }) => {
    if (!selectedChannelId) {
      setItems([]);
      setTotal(0);
      return;
    }
    if (!options?.silent) setLoadingItems(true);
    setError('');
    try {
      const result = await listChannelKnowledgeItems({ channelId: selectedChannelId, search });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load knowledge items');
    } finally {
      if (!options?.silent) setLoadingItems(false);
    }
  }, [search, selectedChannelId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    const hasRunning = items.some((item) => isItemPipelineActive(item));
    if (!hasRunning || !selectedChannelId) return;

    const intervalId = window.setInterval(() => {
      void loadItems({ silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [items, loadItems, selectedChannelId]);

  async function handleUploadDocuments(files: File[]) {
    if (!selectedChannelId) throw new Error('Select a channel first');
    await bulkDocumentUpload(selectedChannelId, files);
    setUploadOpen(false);
    await loadItems();
    await refreshChannelItems(selectedChannelId);
  }

  async function handleCreateCapture(input: {
    title: string;
    brief?: string;
    participantsHint?: string;
    recordingMode?: string;
    audience?: string;
    inputMode: 'audio' | 'transcript';
    separateCaptures: boolean;
    files: File[];
  }) {
    if (!selectedChannelId) throw new Error('Select a channel first');

    if (input.separateCaptures) {
      await bulkSegmentCaptureUpload(selectedChannelId, input.files, {
        inputMode: input.inputMode,
        brief: input.brief,
        participantsHint: input.participantsHint,
        recordingMode: input.recordingMode,
        audience: input.audience,
      });
    } else {
      const capture = await createDocumentCapture({
        channelId: selectedChannelId,
        title: input.title,
        brief: input.brief,
        participantsHint: input.participantsHint,
        recordingMode: input.recordingMode,
        audience: input.audience,
        inputMode: input.inputMode,
      });
      const uploadSegment =
        input.inputMode === 'transcript' ? uploadCaptureTranscriptSegment : uploadCaptureAudioSegment;
      for (const file of input.files) {
        await uploadSegment(capture.id, file);
      }
    }

    setUploadOpen(false);
    await loadItems();
    await refreshChannelItems(selectedChannelId);
  }

  async function handleRunItemPipeline(item: ChannelKnowledgeItem) {
    if (isKnowledgeItemPipelineActive(item)) return;
    const action = resolveKnowledgeItemRunTarget(item);
    if (!action) return;

    setRunningItemIds((current) => new Set(current).add(item.id));
    setError('');
    try {
      if (action === 'segment') {
        if (!item.primary_segment_id) throw new Error('No segment available to process');
        await runCaptureSegmentPipeline(item.id, item.primary_segment_id);
      } else {
        await runCapturePipeline(item.id);
      }
      await loadItems({ silent: true });
      await refreshChannelItems(selectedChannelId ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start pipeline');
    } finally {
      setRunningItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function handleMoveItem(channelId: string) {
    if (!movingItem) return;
    const sourceChannelId = movingItem.channel_id;
    await moveDocumentCapture(movingItem.id, channelId);
    setMovingItem(null);
    await loadItems();
    await refreshChannelItems(sourceChannelId);
    if (channelId !== sourceChannelId) {
      await refreshChannelItems(channelId);
    }
  }

  async function handleDeleteItem(item: ChannelKnowledgeItem) {
    setDeletingIds((current) => new Set(current).add(item.id));
    setError('');
    try {
      await deleteDocumentCapture(item.id);
      await loadItems();
      await refreshChannelItems(selectedChannelId ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item');
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  return (
    <>
      <div className="admin-toolbar">
        <div className="admin-toolbar-left">
          <div className="admin-search">
            <Search {...iconProps()} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search knowledge items…"
              disabled={!selectedChannelId}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void loadItems()}
            disabled={!selectedChannelId || loadingItems}
          >
            Refresh
          </button>
          {selectedChannel && (
            <span className="documents-channel-context" title={selectedChannelPath}>
              Channel: <strong>{selectedChannelPath}</strong>
              {selectedChannel.description ? ` — ${selectedChannel.description}` : ''}
            </span>
          )}
        </div>
        {canWriteChannel && (
          <button
            type="button"
            className="btn-primary"
            disabled={!selectedChannelId}
            onClick={() => setUploadOpen(true)}
          >
            Upload
          </button>
        )}
      </div>

      {error && <p className="error inline">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th>Files</th>
              <th>Size</th>
              <th className="documents-status-col">Status</th>
              <th>Updated</th>
              <th className="admin-table-actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!selectedChannelId ? (
              <tr>
                <td colSpan={7} className="admin-table-empty">
                  Select or create a channel to manage knowledge items.
                </td>
              </tr>
            ) : loadingChannels || loadingItems ? (
              <tr>
                <td colSpan={7} className="admin-table-empty">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-table-empty">
                  No knowledge items in this channel yet.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const isDeleting = deletingIds.has(item.id);
                const isRunning = runningItemIds.has(item.id);
                const runTarget = resolveKnowledgeItemRunTarget(item);
                const runBusy = isKnowledgeItemRunBusy(item) || isRunning;
                const runLabel = runTarget
                  ? runBusy
                    ? knowledgeItemRunBusyLabel(item, runTarget)
                    : knowledgeItemRunActionLabel(item, runTarget)
                  : null;

                return (
                  <tr key={item.id}>
                    <td>
                      <Link to={itemDetailPath(item)} className="document-name-link knowledge-item-name-link">
                        <KnowledgeFileTypeIcon
                          filename={item.title || item.name}
                          inputMode={item.input_mode}
                          aria-hidden
                        />
                        <span className="knowledge-item-copy">
                          <span className="knowledge-item-title">{itemDisplayName(item)}</span>
                          {item.brief ? (
                            <span className="knowledge-item-brief">{item.brief}</span>
                          ) : null}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <span className="document-status-badge">{knowledgeKindLabel(item)}</span>
                    </td>
                    <td className="documents-table-meta">{itemFileCount(item)}</td>
                    <td className="documents-table-meta">{formatDocumentBytes(item.size_bytes)}</td>
                    <td className="documents-status-col">
                      <KnowledgePipelineStatus item={item} />
                    </td>
                    <td className="documents-table-meta">
                      {new Date(item.updated_at).toLocaleString()}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link
                          to={itemDetailPath(item)}
                          className="icon-btn"
                          title="View item"
                          aria-label={`View ${itemDisplayName(item)}`}
                        >
                          <IconView />
                        </Link>
                        {canWriteChannel && runTarget ? (
                          <button
                            type="button"
                            className="icon-btn"
                            title={runLabel ?? 'Run pipeline'}
                            aria-label={`${runLabel ?? 'Run pipeline'} for ${itemDisplayName(item)}`}
                            aria-busy={runBusy}
                            disabled={runBusy || isDeleting}
                            onClick={() => void handleRunItemPipeline(item)}
                          >
                            {runBusy ? (
                              <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                            ) : (
                              <Play {...iconProps()} />
                            )}
                          </button>
                        ) : null}
                        {canWriteChannel ? (
                          <button
                            type="button"
                            className="icon-btn"
                            title="Move to channel"
                            aria-label={`Move ${itemDisplayName(item)}`}
                            disabled={isDeleting}
                            onClick={() => setMovingItem(item)}
                          >
                            <IconMove />
                          </button>
                        ) : null}
                        {canWriteChannel ? (
                          <button
                            type="button"
                            className={`icon-btn danger icon-btn--delete${isDeleting ? ' is-busy' : ''}`}
                            title={isDeleting ? 'Deleting…' : 'Delete'}
                            disabled={isDeleting}
                            aria-busy={isDeleting}
                            onClick={() => {
                              const label = itemDisplayName(item);
                              if (window.confirm(`Delete "${label}"?`)) {
                                void handleDeleteItem(item);
                              }
                            }}
                          >
                            {isDeleting ? (
                              <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                            ) : (
                              <IconDelete />
                            )}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedChannelId && total > items.length && (
        <p className="documents-list-meta">
          Showing {items.length} of {total} items
        </p>
      )}

      {movingItem ? (
        <DocumentMoveModal
          itemName={itemDisplayName(movingItem)}
          currentChannelId={movingItem.channel_id}
          channels={channels}
          onCancel={() => setMovingItem(null)}
          onSubmit={handleMoveItem}
        />
      ) : null}

      {uploadOpen && selectedChannel && (
        <KnowledgeUploadModal
          channelName={selectedChannel.name}
          onCancel={() => setUploadOpen(false)}
          onUploadDocuments={handleUploadDocuments}
          onCreateCapture={handleCreateCapture}
        />
      )}
    </>
  );
}
