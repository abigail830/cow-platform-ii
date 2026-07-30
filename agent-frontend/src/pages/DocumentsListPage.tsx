import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { flattenChannels } from '../api/documentChannels.ts';
import {
  deleteDocument,
  formatDocumentBytes,
  listDocuments,
  moveDocument,
  runDocumentPipeline,
  uploadDocument,
  type DocumentRecord,
} from '../api/documents.ts';
import { DocumentDeleteConfirmModal } from '../components/DocumentDeleteConfirmModal.tsx';
import { DocumentDownloadActions } from '../components/DocumentDownloadMenu.tsx';
import { DocumentMoveModal } from '../components/DocumentMoveModal.tsx';
import { DocumentPipelineStatus } from '../components/DocumentPipelineStatus.tsx';
import { DocumentUploadModal } from '../components/DocumentUploadModal.tsx';
import { IconDelete, IconMove, IconRun } from '../components/AdminActionIcons.tsx';
import { Loader2, Search } from 'lucide-react';
import { iconProps } from '../components/icons/icon-props.ts';
import { useDocumentsOutletContext } from './DocumentsOutletContext.tsx';

export function DocumentsListPage() {
  const {
    channels,
    selectedChannelId,
    canWrite,
    loadingChannels,
  } = useDocumentsOutletContext();

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [moveDocumentTarget, setMoveDocumentTarget] = useState<DocumentRecord | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<DocumentRecord | null>(null);
  const [runningDocumentIds, setRunningDocumentIds] = useState<Set<string>>(new Set());
  const [deletingDocumentIds, setDeletingDocumentIds] = useState<Set<string>>(new Set());

  const flatChannels = useMemo(() => flattenChannels(channels), [channels]);
  const selectedChannel = flatChannels.find((channel) => channel.id === selectedChannelId) ?? null;
  const channelHasPipeline = Boolean(selectedChannel?.pipeline_id);

  const loadDocuments = useCallback(async (options?: { silent?: boolean }) => {
    if (!selectedChannelId) {
      setDocuments([]);
      setTotal(0);
      return;
    }
    if (!options?.silent) setLoadingDocuments(true);
    setError('');
    try {
      const result = await listDocuments({ channelId: selectedChannelId, search });
      setDocuments(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      if (!options?.silent) setLoadingDocuments(false);
    }
  }, [search, selectedChannelId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    const hasRunning = documents.some((document) => document.status === 'running');
    if (!hasRunning || !selectedChannelId) return;

    const intervalId = window.setInterval(() => {
      void loadDocuments({ silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [documents, loadDocuments, selectedChannelId]);

  async function handleUpload(files: File[]) {
    if (!selectedChannelId) throw new Error('Select a channel first');
    for (const file of files) {
      await uploadDocument(selectedChannelId, file);
    }
    setUploadOpen(false);
    await loadDocuments();
  }

  async function handleDeleteDocument(document: DocumentRecord) {
    setDeleteConfirmTarget(null);
    setDeletingDocumentIds((current) => new Set(current).add(document.id));
    setError('');
    try {
      await deleteDocument(document.id);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setDeletingDocumentIds((current) => {
        const next = new Set(current);
        next.delete(document.id);
        return next;
      });
    }
  }

  async function handleMoveDocument(channelId: string) {
    if (!moveDocumentTarget) return;
    await moveDocument(moveDocumentTarget.id, channelId);
    setMoveDocumentTarget(null);
    await loadDocuments();
  }

  async function handleRunPipeline(document: DocumentRecord) {
    if (!channelHasPipeline) return;
    setRunningDocumentIds((current) => new Set(current).add(document.id));
    setError('');
    try {
      await runDocumentPipeline(document.id);
      setDocuments((current) =>
        current.map((item) => (item.id === document.id ? { ...item, status: 'running' } : item)),
      );
      await loadDocuments({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start pipeline');
    } finally {
      setRunningDocumentIds((current) => {
        const next = new Set(current);
        next.delete(document.id);
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
              placeholder="Search documents…"
              disabled={!selectedChannelId}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void loadDocuments()}
            disabled={!selectedChannelId || loadingDocuments}
          >
            Refresh
          </button>
        </div>
        {canWrite && (
          <button
            type="button"
            className="btn-primary"
            disabled={!selectedChannelId}
            onClick={() => setUploadOpen(true)}
          >
            + Upload
          </button>
        )}
      </div>

      {selectedChannel && (
        <p className="documents-channel-context">
          Channel: <strong>{selectedChannel.name}</strong>
          {selectedChannel.description ? ` — ${selectedChannel.description}` : ''}
        </p>
      )}

      {error && <p className="error inline">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Size</th>
              <th className="documents-status-col">Status</th>
              <th>Uploaded</th>
              <th className="admin-table-actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!selectedChannelId ? (
              <tr>
                <td colSpan={6} className="admin-table-empty">
                  Select or create a channel to manage documents.
                </td>
              </tr>
            ) : loadingChannels || loadingDocuments ? (
              <tr>
                <td colSpan={6} className="admin-table-empty">
                  Loading…
                </td>
              </tr>
            ) : documents.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-table-empty">
                  No documents in this channel yet.
                </td>
              </tr>
            ) : (
              documents.map((document) => {
                const isPipelineBusy =
                  runningDocumentIds.has(document.id) || document.status === 'running';
                const isDeleting = deletingDocumentIds.has(document.id);

                return (
                <tr key={document.id}>
                  <td>
                    <Link to={`/knowledge/documents/${document.id}`} className="document-name-link">
                      {document.name}
                    </Link>
                  </td>
                  <td>{document.file_type}</td>
                  <td>{formatDocumentBytes(document.size_bytes)}</td>
                  <td className="documents-status-col">
                    <DocumentPipelineStatus document={document} />
                  </td>
                  <td>{new Date(document.created_at).toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <DocumentDownloadActions
                        documentId={document.id}
                        documentName={document.name}
                        onError={setError}
                      />
                      {canWrite && (
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
                            onClick={() => void handleRunPipeline(document)}
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
                            onClick={() => setMoveDocumentTarget(document)}
                          >
                            <IconMove />
                          </button>
                          <button
                            type="button"
                            className={`icon-btn danger icon-btn--delete${isDeleting ? ' is-busy' : ''}`}
                            title={isDeleting ? 'Deleting…' : 'Delete'}
                            disabled={isDeleting}
                            aria-busy={isDeleting}
                            onClick={() => setDeleteConfirmTarget(document)}
                          >
                            {isDeleting ? (
                              <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
                            ) : (
                              <IconDelete />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedChannelId && total > documents.length && (
        <p className="documents-list-meta">
          Showing {documents.length} of {total} documents
        </p>
      )}

      {uploadOpen && selectedChannel && (
        <DocumentUploadModal
          channelName={selectedChannel.name}
          onCancel={() => setUploadOpen(false)}
          onUpload={handleUpload}
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
      {deleteConfirmTarget && (
        <DocumentDeleteConfirmModal
          documentName={deleteConfirmTarget.name}
          onCancel={() => setDeleteConfirmTarget(null)}
          onConfirm={() => void handleDeleteDocument(deleteConfirmTarget)}
        />
      )}
    </>
  );
}
