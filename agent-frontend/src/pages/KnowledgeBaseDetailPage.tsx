import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight, Loader2, Plus } from 'lucide-react';
import {
  deleteKbItem,
  deleteKbItems,
  getKbImportJob,
  getKbItem,
  getKnowledgeBase,
  listKbItems,
  startKbImport,
  type KbImportJob,
  type KbItem,
  type KnowledgeBase,
} from '../api/knowledgeBases.ts';
import { IconDelete, IconRun } from '../components/AdminActionIcons.tsx';
import { KbImportModal } from '../components/KbImportModal.tsx';
import { KbItemDeleteConfirmModal } from '../components/KbItemDeleteConfirmModal.tsx';
import { KbItemDetailPanel } from '../components/KbItemDetailPanel.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';
import { hasPermission } from '../shared/permissions.ts';

function statusClass(status: string): string {
  if (status === 'completed') return 'kb-status-completed';
  if (status === 'failed') return 'kb-status-failed';
  if (status === 'importing' || status === 'running' || status === 'pending') return 'kb-status-pending';
  return '';
}

function isImportInProgress(status: string, jobActive: boolean): boolean {
  return status === 'importing' || (jobActive && status === 'pending');
}

function KbItemStatusCell({ item, importJobActive }: { item: KbItem; importJobActive: boolean }) {
  const inProgress = isImportInProgress(item.import_status, importJobActive);

  if (inProgress) {
    return (
      <span className="kb-item-status-loading">
        <Loader2 {...iconProps({ size: 14, className: 'icon-btn-spin' })} aria-hidden />
        {item.import_status}
      </span>
    );
  }

  return (
    <div className="kb-item-status-cell">
      <span className={`kb-status-badge ${statusClass(item.import_status)}`}>{item.import_status}</span>
      {item.import_status === 'failed' && item.import_error && (
        <span className="kb-item-status-error" title={item.import_error}>{item.import_error}</span>
      )}
    </div>
  );
}

type DeleteConfirmState =
  | { mode: 'single'; item: KbItem }
  | { mode: 'bulk'; itemIds: string[] }
  | null;

export function KnowledgeBaseDetailPage() {
  const { knowledgeBaseId } = useParams<{ knowledgeBaseId: string }>();
  const { user } = useAppOutletContext();
  const canWrite = useMemo(
    () => hasPermission(user, 'knowledge-management:knowledge-bases', 'write'),
    [user],
  );

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [items, setItems] = useState<KbItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [activeJob, setActiveJob] = useState<KbImportJob | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<KbItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null);
  const [deleting, setDeleting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const selectedItemIdRef = useRef<string | null>(null);

  const importJobActive =
    activeJob !== null && activeJob.status !== 'completed' && activeJob.status !== 'failed';

  const canImport = Boolean(canWrite && kb?.capabilities.import);
  const selectionCount = selectedItemIds.size;
  const allPageSelected = items.length > 0 && items.every((item) => selectedItemIds.has(item.id));

  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('kb-detail-split', 52, {
    minPct: 28,
    maxPct: 72,
  });

  useEffect(() => {
    selectedItemIdRef.current = selectedItemId;
  }, [selectedItemId]);

  const load = useCallback(async () => {
    if (!knowledgeBaseId) return;
    setLoading(true);
    setError('');
    try {
      const [kbRow, itemResult] = await Promise.all([
        getKnowledgeBase(knowledgeBaseId),
        listKbItems(knowledgeBaseId, { limit: 100 }),
      ]);
      setKb(kbRow);
      setItems(itemResult.items);
      setTotal(itemResult.total);
      const currentSelected = selectedItemIdRef.current;
      if (currentSelected && !itemResult.items.some((item) => item.id === currentSelected)) {
        setSelectedItemId(null);
        setDetailItem(null);
      }
      setSelectedItemIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (itemResult.items.some((item) => item.id === id)) next.add(id);
        }
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load knowledge base';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
        setForbidden(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeJob || !knowledgeBaseId) return;
    if (activeJob.status === 'completed' || activeJob.status === 'failed') return;

    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          const job = await getKbImportJob(knowledgeBaseId, activeJob.id);
          setActiveJob(job);
          await load();
          const currentItemId = selectedItemIdRef.current;
          if (currentItemId) {
            try {
              const item = await getKbItem(knowledgeBaseId, currentItemId);
              setDetailItem(item);
            } catch {
              // ignore detail refresh errors during poll
            }
          }
        } catch {
          // ignore poll errors
        }
      })();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [activeJob, knowledgeBaseId, load]);

  useEffect(() => {
    if (!selectedItemId || !knowledgeBaseId) {
      setDetailItem(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    void getKbItem(knowledgeBaseId, selectedItemId)
      .then((item) => {
        if (!cancelled) setDetailItem(item);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load item detail');
          setDetailItem(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedItemId, knowledgeBaseId]);

  function toggleItemSelection(itemId: string, checked: boolean) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  function toggleSelectAllPage(checked: boolean) {
    if (!checked) {
      setSelectedItemIds(new Set());
      return;
    }
    setSelectedItemIds(new Set(items.map((item) => item.id)));
  }

  function documentIdsForItemIds(itemIds: string[]): string[] {
    const idSet = new Set(itemIds);
    return items.filter((item) => idSet.has(item.id)).map((item) => item.document_id);
  }

  async function rerunItemIds(itemIds: string[]) {
    if (!knowledgeBaseId || itemIds.length === 0) return;
    const documentIds = documentIdsForItemIds(itemIds);
    if (documentIds.length === 0) return;

    setRerunning(true);
    setError('');
    try {
      const result = await startKbImport(knowledgeBaseId, { documentIds });
      setActiveJob(result.job);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rerun import');
    } finally {
      setRerunning(false);
    }
  }

  async function handleImport(input: { channelIds: string[]; documentIds: string[] }) {
    if (!knowledgeBaseId) return;
    const result = await startKbImport(knowledgeBaseId, {
      channelIds: input.channelIds,
      documentIds: input.documentIds,
    });
    setActiveJob(result.job);
    setImportOpen(false);
    await load();
  }

  async function handleDeleteConfirm() {
    if (!knowledgeBaseId || !deleteConfirm) return;
    setDeleting(true);
    setError('');
    try {
      if (deleteConfirm.mode === 'single') {
        await deleteKbItem(knowledgeBaseId, deleteConfirm.item.id);
        if (selectedItemId === deleteConfirm.item.id) {
          setSelectedItemId(null);
          setDetailItem(null);
        }
        setSelectedItemIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteConfirm.item.id);
          return next;
        });
      } else {
        await deleteKbItems(knowledgeBaseId, deleteConfirm.itemIds);
        if (selectedItemId && deleteConfirm.itemIds.includes(selectedItemId)) {
          setSelectedItemId(null);
          setDetailItem(null);
        }
        setSelectedItemIds(new Set());
      }
      setDeleteConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove item');
    } finally {
      setDeleting(false);
    }
  }

  function stopRowAction(event: { stopPropagation: () => void }) {
    event.stopPropagation();
  }

  if (forbidden) {
    return <Navigate to="/agents/playground" replace />;
  }

  if (!knowledgeBaseId) {
    return <Navigate to="/knowledge/knowledge-bases" replace />;
  }

  return (
    <main className="admin-page kb-page kb-detail-page">
      <Link to="/knowledge/knowledge-bases" className="kb-back-link">← Knowledge bases</Link>

      {loading && !kb ? (
        <p className="admin-muted">Loading…</p>
      ) : kb ? (
        <>
          <header className="admin-header kb-page-header">
            <div>
              <AdminPageTitle main={kb.name} accent="" />
              <AdminPageDescription>
                {kb.description || 'PageIndex knowledge base'}
              </AdminPageDescription>
            </div>
          </header>

          {error && <p className="admin-error" role="alert">{error}</p>}

          <section className="kb-items-section">
            <div className="kb-items-header">
              <h2 className="kb-section-title">Items ({total})</h2>
              {canImport && (
                <div className="kb-items-toolbar">
                  {items.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={selectionCount === 0 || importJobActive || rerunning}
                        onClick={() => void rerunItemIds([...selectedItemIds])}
                      >
                        <IconRun {...iconProps({ size: 16 })} aria-hidden />
                        Rerun selected{selectionCount > 0 ? ` (${selectionCount})` : ''}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={selectionCount === 0 || importJobActive || deleting}
                        onClick={() =>
                          setDeleteConfirm({ mode: 'bulk', itemIds: [...selectedItemIds] })
                        }
                      >
                        <IconDelete {...iconProps({ size: 16 })} aria-hidden />
                        Remove selected{selectionCount > 0 ? ` (${selectionCount})` : ''}
                      </button>
                    </>
                  )}
                  <button type="button" className="btn-primary" onClick={() => setImportOpen(true)}>
                    <Plus {...iconProps({ size: 16 })} aria-hidden />
                    Import knowledge
                  </button>
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div className="admin-table-wrap kb-detail-table-wrap">
                <table className="admin-table kb-detail-table">
                  <thead>
                    <tr>
                      {canImport && <th className="kb-item-select-col" aria-hidden />}
                      <th>Document</th>
                      <th>Path</th>
                      <th className="kb-item-status-col">Status</th>
                      <th>Imported</th>
                      <th className="kb-item-actions-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={canImport ? 6 : 5} className="admin-table-empty">
                        &nbsp;
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                ref={containerRef}
                className={`kb-detail-layout${selectedItemId ? ' has-detail' : ''}`}
                style={
                  selectedItemId
                    ? { ['--kb-detail-left-pct' as string]: `${leftPct}%` }
                    : undefined
                }
              >
                <div className="kb-detail-list-panel">
                  <div className="admin-table-wrap kb-detail-table-wrap">
                    <table className="admin-table kb-detail-table">
                      <thead>
                        <tr>
                          {canImport && (
                            <th className="kb-item-select-col">
                              <input
                                type="checkbox"
                                className="brand-checkbox"
                                checked={allPageSelected}
                                aria-label="Select all items on this page"
                                onChange={(event) => toggleSelectAllPage(event.target.checked)}
                              />
                            </th>
                          )}
                          <th>Document</th>
                          <th>Path</th>
                          <th className="kb-item-status-col">Status</th>
                          <th>Imported</th>
                          <th className="kb-item-actions-col">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => {
                          const selected = selectedItemId === item.id;
                          const rowChecked = selectedItemIds.has(item.id);
                          const rowBusy = isImportInProgress(item.import_status, importJobActive);

                          return (
                            <tr
                              key={item.id}
                              className={selected ? 'kb-item-row selected' : 'kb-item-row'}
                              onClick={() => setSelectedItemId(item.id)}
                            >
                              {canImport && (
                                <td className="kb-item-select-col" onClick={stopRowAction}>
                                  <input
                                    type="checkbox"
                                    className="brand-checkbox"
                                    checked={rowChecked}
                                    aria-label={`Select ${item.document_name}`}
                                    onChange={(event) =>
                                      toggleItemSelection(item.id, event.target.checked)
                                    }
                                  />
                                </td>
                              )}
                              <td>{item.document_name}</td>
                              <td className="kb-path-cell">{item.channel_path || '—'}</td>
                              <td className="kb-item-status-col">
                                <KbItemStatusCell item={item} importJobActive={importJobActive} />
                              </td>
                              <td>{item.imported_at ? new Date(item.imported_at).toLocaleString() : '—'}</td>
                              <td className="kb-item-actions-col" onClick={stopRowAction}>
                                <div className="row-actions">
                                  {canImport && (
                                    <>
                                      <button
                                        type="button"
                                        className="icon-btn icon-btn--run"
                                        title="Rerun import"
                                        aria-label={`Rerun import for ${item.document_name}`}
                                        disabled={importJobActive || rerunning || rowBusy}
                                        onClick={() => void rerunItemIds([item.id])}
                                      >
                                        <IconRun {...iconProps()} />
                                      </button>
                                      <button
                                        type="button"
                                        className="icon-btn danger"
                                        title="Remove from knowledge base"
                                        aria-label={`Remove ${item.document_name}`}
                                        disabled={importJobActive || deleting}
                                        onClick={() =>
                                          setDeleteConfirm({ mode: 'single', item })
                                        }
                                      >
                                        <IconDelete {...iconProps()} />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    title="View detail"
                                    aria-label={`View detail for ${item.document_name}`}
                                    onClick={() => setSelectedItemId(item.id)}
                                  >
                                    <ChevronRight {...iconProps()} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedItemId && (
                  <>
                    <div
                      className="kb-detail-split-handle"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize item list"
                      onMouseDown={onHandleMouseDown}
                    />
                    <KbItemDetailPanel
                      item={detailItem}
                      loading={detailLoading}
                      onClose={() => {
                        setSelectedItemId(null);
                        setDetailItem(null);
                      }}
                    />
                  </>
                )}
              </div>
            )}
          </section>
        </>
      ) : (
        <p className="admin-error">Knowledge base not found.</p>
      )}

      {importOpen && (
        <KbImportModal onCancel={() => setImportOpen(false)} onConfirm={handleImport} />
      )}

      {deleteConfirm && (
        <KbItemDeleteConfirmModal
          mode={deleteConfirm.mode}
          documentName={deleteConfirm.mode === 'single' ? deleteConfirm.item.document_name : undefined}
          count={deleteConfirm.mode === 'bulk' ? deleteConfirm.itemIds.length : undefined}
          deleting={deleting}
          onCancel={() => {
            if (!deleting) setDeleteConfirm(null);
          }}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </main>
  );
}
