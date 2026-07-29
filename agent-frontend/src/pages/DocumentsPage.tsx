import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  createDocumentChannel,
  deleteDocumentChannel,
  flattenChannels,
  listDocumentChannels,
  updateDocumentChannel,
  type DocumentChannel,
} from '../api/documentChannels.ts';
import {
  deleteDocument,
  formatDocumentBytes,
  listDocuments,
  uploadDocument,
  type DocumentRecord,
} from '../api/documents.ts';
import { ChannelFormModal } from '../components/ChannelFormModal.tsx';
import { ChannelTreePanel } from '../components/ChannelTreePanel.tsx';
import { DocumentUploadModal } from '../components/DocumentUploadModal.tsx';
import { IconDelete } from '../components/AdminActionIcons.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = getNavPage('/knowledge/documents')!;

type ChannelModalState =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'edit'; channel: DocumentChannel };

export function DocumentsPage() {
  const { user } = useAppOutletContext();
  const canWrite = useMemo(() => hasPermission(user, 'knowledge-management:documents', 'write'), [user]);

  const [channels, setChannels] = useState<DocumentChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [channelModal, setChannelModal] = useState<ChannelModalState | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const flatChannels = useMemo(() => flattenChannels(channels), [channels]);
  const selectedChannel = flatChannels.find((channel) => channel.id === selectedChannelId) ?? null;

  const loadChannels = useCallback(async () => {
    setLoadingChannels(true);
    setError('');
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
      else setError(message);
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    if (!selectedChannelId) {
      setDocuments([]);
      setTotal(0);
      return;
    }
    setLoadingDocuments(true);
    setError('');
    try {
      const result = await listDocuments({ channelId: selectedChannelId, search });
      setDocuments(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoadingDocuments(false);
    }
  }, [search, selectedChannelId]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

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

  async function handleUpdateChannel(input: { name: string; description: string }) {
    if (!channelModal || channelModal.mode !== 'edit') return;
    await updateDocumentChannel(channelModal.channel.id, {
      name: input.name,
      description: input.description || null,
    });
    setChannelModal(null);
    await loadChannels();
  }

  async function handleDeleteChannel(channel: DocumentChannel) {
    if (!window.confirm(`Delete channel "${channel.name}"?`)) return;
    try {
      await deleteDocumentChannel(channel.id);
      if (selectedChannelId === channel.id) setSelectedChannelId(null);
      await loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete channel');
    }
  }

  async function handleUpload(files: File[]) {
    if (!selectedChannelId) throw new Error('Select a channel first');
    for (const file of files) {
      await uploadDocument(selectedChannelId, file);
    }
    setUploadOpen(false);
    await loadDocuments();
  }

  async function handleDeleteDocument(document: DocumentRecord) {
    if (!window.confirm(`Delete "${document.name}"?`)) return;
    try {
      await deleteDocument(document.id);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    }
  }

  if (forbidden) return <Navigate to="/chat" replace />;

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
            onRename={(channel) => setChannelModal({ mode: 'edit', channel })}
            onDelete={(channel) => void handleDeleteChannel(channel)}
          />

          <section className="documents-main-panel">
            <div className="admin-toolbar">
              <div className="admin-toolbar-left">
                <div className="admin-search">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.25" />
                    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                  </svg>
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
                    <th>Status</th>
                    <th>Uploaded</th>
                    {canWrite && <th className="admin-table-actions-col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {!selectedChannelId ? (
                    <tr>
                      <td colSpan={canWrite ? 6 : 5} className="admin-table-empty">
                        Select or create a channel to manage documents.
                      </td>
                    </tr>
                  ) : loadingChannels || loadingDocuments ? (
                    <tr>
                      <td colSpan={canWrite ? 6 : 5} className="admin-table-empty">
                        Loading…
                      </td>
                    </tr>
                  ) : documents.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 6 : 5} className="admin-table-empty">
                        No documents in this channel yet.
                      </td>
                    </tr>
                  ) : (
                    documents.map((document) => (
                      <tr key={document.id}>
                        <td>{document.name}</td>
                        <td>{document.file_type}</td>
                        <td>{formatDocumentBytes(document.size_bytes)}</td>
                        <td>
                          <span className="document-status-badge">{document.status}</span>
                        </td>
                        <td>{new Date(document.created_at).toLocaleString()}</td>
                        {canWrite && (
                          <td className="admin-table-actions">
                            <button
                              type="button"
                              className="icon-btn danger"
                              title="Delete"
                              onClick={() => void handleDeleteDocument(document)}
                            >
                              <IconDelete />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {selectedChannelId && total > documents.length && (
              <p className="documents-list-meta">
                Showing {documents.length} of {total} documents
              </p>
            )}
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
      {channelModal?.mode === 'edit' && (
        <ChannelFormModal
          title="Rename channel"
          initialName={channelModal.channel.name}
          initialDescription={channelModal.channel.description ?? ''}
          submitLabel="Save changes"
          onCancel={() => setChannelModal(null)}
          onSubmit={handleUpdateChannel}
        />
      )}
      {uploadOpen && selectedChannel && (
        <DocumentUploadModal
          channelName={selectedChannel.name}
          onCancel={() => setUploadOpen(false)}
          onUpload={handleUpload}
        />
      )}
    </>
  );
}
