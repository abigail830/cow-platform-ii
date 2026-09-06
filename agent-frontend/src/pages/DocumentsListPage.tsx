import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { flattenChannels } from '../api/documentChannels.ts';
import {
  bulkDocumentUpload,
  createDocumentCapture,
  deleteDocumentCapture,
  isCapturePipelineActive,
  uploadCaptureAudioSegment,
  uploadCaptureTranscriptSegment,
} from '../api/documentCaptures.ts';
import {
  deleteDocument,
  formatDocumentBytes,
  listChannelKnowledgeItems,
  moveDocument,
  runDocumentPipeline,
  type ChannelKnowledgeItem,
} from '../api/documents.ts';
import { DocumentDownloadActions } from '../components/DocumentDownloadMenu.tsx';
import { DocumentMoveModal } from '../components/DocumentMoveModal.tsx';
import {
  KnowledgePipelineStatus,
  knowledgeKindLabel,
} from '../components/KnowledgePipelineStatus.tsx';
import { KnowledgeUploadModal } from '../components/KnowledgeUploadModal.tsx';
import { IconDelete, IconMove, IconRun, IconView } from '../components/AdminActionIcons.tsx';
import { Loader2, Search } from 'lucide-react';
import { iconProps } from '../components/icons/icon-props.ts';
import { useDocumentsOutletContext } from './DocumentsOutletContext.tsx';
import { buildChannelPath } from '../shared/channel-path.ts';

function itemDetailPath(item: ChannelKnowledgeItem): string {
  if (item.kind === 'capture') {
    return `/knowledge/documents/captures/${item.id}`;
  }
  return `/knowledge/documents/${item.id}`;
}

function itemDisplayName(item: ChannelKnowledgeItem): string {
  return item.kind === 'capture' ? item.title || item.name : item.name;
}

function itemFileCount(item: ChannelKnowledgeItem): number {
  return item.file_count;
}

function isItemPipelineActive(item: ChannelKnowledgeItem): boolean {
  if (item.kind === 'capture') {
    return isCapturePipelineActive({
      status: item.status,
      pipeline_job: item.pipeline_job,
    });
  }
  return item.status === 'running';
}

export function DocumentsListPage() {
  const { channels, selectedChannelId, loadingChannels, refreshChannelItems } = useDocumentsOutletContext();

  const [items, setItems] = useState<ChannelKnowledgeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [moveDocumentTarget, setMoveDocumentTarget] = useState<
    Extract<ChannelKnowledgeItem, { kind: 'document' }> | null
  >(null);
  const [runningDocumentIds, setRunningDocumentIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const flatChannels = useMemo(() => flattenChannels(channels), [channels]);
  const selectedChannel = flatChannels.find((channel) => channel.id === selectedChannelId) ?? null;
  const selectedChannelPath = selectedChannel
    ? buildChannelPath(flatChannels, selectedChannel.id)
    : '';
  const canWriteChannel = Boolean(selectedChannel?.my_access?.write);
  const channelHasPipeline = Boolean(selectedChannel?.pipeline_id);

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
    files: File[];
  }) {
    if (!selectedChannelId) throw new Error('Select a channel first');
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
    setUploadOpen(false);
    await loadItems();
    await refreshChannelItems(selectedChannelId);
  }

  async function handleDeleteItem(item: ChannelKnowledgeItem) {
    setDeletingIds((current) => new Set(current).add(item.id));
    setError('');
    try {
      if (item.kind === 'document') {
        await deleteDocument(item.id);
      } else {
        await deleteDocumentCapture(item.id);
      }
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

  async function handleMoveDocument(channelId: string) {
    if (!moveDocumentTarget) return;
    await moveDocument(moveDocumentTarget.id, channelId);
    setMoveDocumentTarget(null);
    await loadItems();
    await refreshChannelItems(selectedChannelId ?? undefined);
    await refreshChannelItems(channelId);
  }

  async function handleRunPipeline(item: Extract<ChannelKnowledgeItem, { kind: 'document' }>) {
    if (!channelHasPipeline) return;
    setRunningDocumentIds((current) => new Set(current).add(item.id));
    setError('');
    try {
      await runDocumentPipeline(item.id);
      setItems((current) =>
        current.map((row) =>
          row.kind === 'document' && row.id === item.id ? { ...row, status: 'running' } : row,
        ),
      );
      await loadItems({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start pipeline');
    } finally {
      setRunningDocumentIds((current) => {
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
                const isDocument = item.kind === 'document';
                const isPipelineBusy =
                  isDocument &&
                  (runningDocumentIds.has(item.id) || item.status === 'running');

                return (
                  <tr key={`${item.kind}-${item.id}`}>
                    <td>
                      <Link to={itemDetailPath(item)} className="document-name-link">
                        {itemDisplayName(item)}
                      </Link>
                      {item.kind === 'capture' && item.brief ? (
                        <div className="documents-table-meta">{item.brief}</div>
                      ) : null}
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
                        {isDocument ? (
                          <DocumentDownloadActions
                            documentId={item.id}
                            documentName={item.name}
                            onError={setError}
                          />
                        ) : null}
                        {canWriteChannel && isDocument ? (
                          <>
                            <button
                              type="button"
                              className={`icon-btn icon-btn--run${isPipelineBusy ? ' is-busy' : ''}`}
                              title={
                                channelHasPipeline
                                  ? isPipelineBusy
                                    ? 'Pipeline running…'
                                    : 'Run pipeline'
                                  : 'Configure a pipeline on this channel first'
                              }
                              disabled={!channelHasPipeline || isPipelineBusy}
                              aria-busy={isPipelineBusy}
                              onClick={() => void handleRunPipeline(item)}
                            >
                              {isPipelineBusy ? (
                                <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                              ) : (
                                <IconRun />
                              )}
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              title="Move to channel"
                              onClick={() => setMoveDocumentTarget(item)}
                            >
                              <IconMove />
                            </button>
                          </>
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

      {uploadOpen && selectedChannel && (
        <KnowledgeUploadModal
          channelName={selectedChannel.name}
          onCancel={() => setUploadOpen(false)}
          onUploadDocuments={handleUploadDocuments}
          onCreateCapture={handleCreateCapture}
        />
      )}
      {moveDocumentTarget && (
        <DocumentMoveModal
          documentName={moveDocumentTarget.name}
          currentChannelId={moveDocumentTarget.channel_id}
          channels={channels}
          onCancel={() => setMoveDocumentTarget(null)}
          onSubmit={handleMoveDocument}
        />
      )}
    </>
  );
}
