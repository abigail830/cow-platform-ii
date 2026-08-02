import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  ChevronRight,
  FileInput,
  Loader2,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  batchDraftKbFaqs,
  batchPublishKbFaqs,
  deleteKbFaqs,
  getKnowledgeBase,
  listKbFaqs,
  startKbFaqExtract,
  startKbFaqIndex,
  type KbFaq,
  type KbImportJob,
  type KnowledgeBase,
} from '../api/knowledgeBases.ts';
import { listModelConfigs, type ModelConfig } from '../api/models.ts';
import { IconDelete, IconRun } from '../components/AdminActionIcons.tsx';
import { KbFaqAddEditModal } from '../components/KbFaqAddEditModal.tsx';
import { KbFaqDetailPanel } from '../components/KbFaqDetailPanel.tsx';
import { KbFaqSettingsModal } from '../components/KbFaqSettingsModal.tsx';
import { KbImportModal } from '../components/KbImportModal.tsx';
import { KbItemDeleteConfirmModal } from '../components/KbItemDeleteConfirmModal.tsx';
import { KbPageLoadingState } from '../components/KbPageLoadingState.tsx';
import { TransientNotice } from '../components/TransientNotice.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';
import { isKbImportJobActive, useKbImportJobPolling } from '../hooks/useKbImportJobPolling.ts';
import { useTransientNotice } from '../hooks/useTransientNotice.ts';
import { hasPermission } from '../shared/permissions.ts';

type FaqKnowledgeBaseDetailPageProps = {
  initialKb?: KnowledgeBase;
};

type DeleteConfirmState =
  | { mode: 'single'; faq: KbFaq }
  | { mode: 'bulk'; faqIds: string[] }
  | null;

function truncateText(text: string, maxLen = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen).trim()}…`;
}

function indexStatusClass(status: KbFaq['index_status']): string {
  if (status === 'indexed') return 'kb-status-completed';
  if (status === 'failed') return 'kb-status-failed';
  if (status === 'indexing' || status === 'pending') return 'kb-status-pending';
  return '';
}

function publicationStatusClass(status: KbFaq['publication_status']): string {
  return status === 'published' ? 'kb-status-completed' : 'kb-status-pending';
}

function FaqIndexStatusCell({ faq, jobActive }: { faq: KbFaq; jobActive: boolean }) {
  const status = faq.index_status;
  if (!status) {
    return <span className="admin-muted">—</span>;
  }

  if (status === 'indexing' || (jobActive && status === 'pending')) {
    return (
      <span className="kb-item-status-loading">
        <Loader2 {...iconProps({ size: 14, className: 'icon-btn-spin' })} aria-hidden />
        {status}
      </span>
    );
  }

  return (
    <div className="kb-item-status-cell">
      <span className={`kb-status-badge ${indexStatusClass(status)}`}>{status}</span>
      {status === 'failed' && faq.index_error && (
        <span className="kb-item-status-error" title={faq.index_error}>
          {faq.index_error}
        </span>
      )}
    </div>
  );
}

function ListLoadingState({ label }: { label: string }) {
  return (
    <p className="session-explorer-loading" role="status" aria-live="polite">
      <Loader2 {...iconProps({ size: 18, className: 'session-explorer-loading-icon' })} aria-hidden />
      {label}
    </p>
  );
}

export function FaqKnowledgeBaseDetailPage({ initialKb }: FaqKnowledgeBaseDetailPageProps) {
  const { knowledgeBaseId } = useParams<{ knowledgeBaseId: string }>();
  const { user } = useAppOutletContext();
  const canWrite = useMemo(
    () => hasPermission(user, 'knowledge-management:knowledge-bases', 'write'),
    [user],
  );

  const [kb, setKb] = useState<KnowledgeBase | null>(initialKb ?? null);
  const [faqs, setFaqs] = useState<KbFaq[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addEditOpen, setAddEditOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<KbFaq | null>(null);
  const [activeJob, setActiveJob] = useState<KbImportJob | null>(null);
  const [selectedFaqId, setSelectedFaqId] = useState<string | null>(null);
  const [selectedFaqIds, setSelectedFaqIds] = useState<Set<string>>(() => new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null);
  const [deleting, setDeleting] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [publishingFaqId, setPublishingFaqId] = useState<string | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [extractBusy, setExtractBusy] = useState(false);
  const { notice: transientNotice, showNotice, clearNotice } = useTransientNotice(4500);
  const [embeddingModels, setEmbeddingModels] = useState<ModelConfig[]>([]);
  const [chatModels, setChatModels] = useState<ModelConfig[]>([]);
  const selectedFaqIdRef = useRef<string | null>(null);

  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('kb-faq-detail-split', 52, {
    minPct: 28,
    maxPct: 72,
  });

  const jobActive = isKbImportJobActive(activeJob);
  const extractJobActive =
    extractBusy || (jobActive && activeJob?.job_kind === 'faq_extract');

  const listIndexInProgress = useMemo(
    () =>
      faqs.some(
        (faq) => faq.index_status === 'indexing' || faq.index_status === 'pending',
      ),
    [faqs],
  );

  const canManage = Boolean(canWrite);
  const selectionCount = selectedFaqIds.size;
  const selectedPublishedFaqIds = useMemo(
    () =>
      faqs
        .filter((faq) => selectedFaqIds.has(faq.id) && faq.publication_status === 'published')
        .map((faq) => faq.id),
    [faqs, selectedFaqIds],
  );
  const selectedPublishedCount = selectedPublishedFaqIds.length;
  const selectedDraftFaqIds = useMemo(
    () =>
      faqs
        .filter((faq) => selectedFaqIds.has(faq.id) && faq.publication_status === 'draft')
        .map((faq) => faq.id),
    [faqs, selectedFaqIds],
  );
  const selectedDraftCount = selectedDraftFaqIds.length;
  const allPageSelected = faqs.length > 0 && faqs.every((faq) => selectedFaqIds.has(faq.id));
  const selectedFaq = useMemo(
    () => faqs.find((faq) => faq.id === selectedFaqId) ?? null,
    [faqs, selectedFaqId],
  );

  useEffect(() => {
    selectedFaqIdRef.current = selectedFaqId;
  }, [selectedFaqId]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!knowledgeBaseId) return;
    if (!options?.silent) setLoading(true);
    setError('');
    try {
      const [kbRow, faqResult] = await Promise.all([
        getKnowledgeBase(knowledgeBaseId),
        listKbFaqs(knowledgeBaseId, { limit: 100 }),
      ]);
      setKb(kbRow);
      setFaqs(faqResult.items);
      setTotal(faqResult.total);
      const currentSelected = selectedFaqIdRef.current;
      if (currentSelected && !faqResult.items.some((faq) => faq.id === currentSelected)) {
        setSelectedFaqId(null);
      }
      setSelectedFaqIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (faqResult.items.some((faq) => faq.id === id)) next.add(id);
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
      if (!options?.silent) setLoading(false);
    }
  }, [knowledgeBaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canWrite) return;
    void Promise.all([
      listModelConfigs({ apiType: 'embeddings', limit: 100 }),
      listModelConfigs({ apiType: 'chat-completions', limit: 100 }),
    ])
      .then(([embeddings, chat]) => {
        setEmbeddingModels(embeddings.models);
        setChatModels(chat.models);
      })
      .catch(() => {
        setEmbeddingModels([]);
        setChatModels([]);
      });
  }, [canWrite]);

  useKbImportJobPolling({
    knowledgeBaseId,
    activeJob,
    setActiveJob,
    listInProgress: listIndexInProgress,
    onRefresh: () => load({ silent: true }),
  });

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === 'failed' && activeJob.error_message) {
      clearNotice();
      const label =
        activeJob.job_kind === 'faq_extract'
          ? 'FAQ extract failed'
          : activeJob.job_kind === 'faq_index'
            ? 'FAQ index failed'
            : 'Background job failed';
      setError(`${label}: ${activeJob.error_message}`);
    } else if (activeJob.status === 'completed' && activeJob.job_kind === 'faq_extract') {
      setError('');
      showNotice('FAQ extract completed. New draft FAQs were added to the list.');
    }
  }, [activeJob?.id, activeJob?.status, activeJob?.error_message, activeJob?.job_kind, clearNotice, showNotice]);

  function toggleFaqSelection(faqId: string, checked: boolean) {
    setSelectedFaqIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(faqId);
      else next.delete(faqId);
      return next;
    });
  }

  function toggleSelectAllPage(checked: boolean) {
    if (!checked) {
      setSelectedFaqIds(new Set());
      return;
    }
    setSelectedFaqIds(new Set(faqs.map((faq) => faq.id)));
  }

  function stopRowAction(event: { stopPropagation: () => void }) {
    event.stopPropagation();
  }

  function openCreateModal() {
    setEditingFaq(null);
    setAddEditOpen(true);
  }

  function openEditModal(faq: KbFaq) {
    setEditingFaq(faq);
    setAddEditOpen(true);
  }

  async function handleExtract(input: { channelIds: string[]; documentIds: string[] }) {
    if (!knowledgeBaseId) {
      throw new Error('Knowledge base id is missing');
    }
    setExtractBusy(true);
    setError('');
    clearNotice();
    try {
      const result = await startKbFaqExtract(knowledgeBaseId, input);
      setActiveJob(result.job);
      setExtractOpen(false);
      await load({ silent: true });
    } finally {
      setExtractBusy(false);
    }
  }

  function openExtractModal() {
    setError('');
    clearNotice();
    const extractionModelId = kb?.faq_settings?.extraction_model_config_id;
    if (!extractionModelId) {
      setError('Configure an extraction model in Settings (AI tab) before extracting from documents.');
      return;
    }
    setExtractOpen(true);
  }

  async function publishFaqs(faqIds: string[]) {
    if (!knowledgeBaseId || faqIds.length === 0) return;
    const result = await batchPublishKbFaqs(knowledgeBaseId, faqIds);
    if (result.index_job) {
      setActiveJob(result.index_job);
    }
    await load({ silent: true });
  }

  async function handleBatchPublish() {
    if (!knowledgeBaseId || selectedDraftCount === 0) return;
    setBatchBusy(true);
    setError('');
    try {
      await publishFaqs(selectedDraftFaqIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish FAQs');
    } finally {
      setBatchBusy(false);
    }
  }

  async function handlePublishFaq(faqId: string) {
    if (!knowledgeBaseId) return;
    setPublishingFaqId(faqId);
    setError('');
    try {
      await publishFaqs([faqId]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish FAQ');
    } finally {
      setPublishingFaqId(null);
    }
  }

  async function handleBatchDraft() {
    if (!knowledgeBaseId || selectedPublishedCount === 0) return;
    setBatchBusy(true);
    setError('');
    try {
      await batchDraftKbFaqs(knowledgeBaseId, selectedPublishedFaqIds);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move FAQs to draft');
    } finally {
      setBatchBusy(false);
    }
  }

  async function handleRunIndex(faqIds: string[]) {
    if (!knowledgeBaseId || faqIds.length === 0) return;

    const publishedIds = faqIds.filter((faqId) => {
      const faq = faqs.find((item) => item.id === faqId);
      return faq?.publication_status === 'published';
    });

    if (publishedIds.length === 0) {
      setError('');
      showNotice('Publish FAQs before running index.');
      return;
    }

    if (publishedIds.length < faqIds.length) {
      showNotice(
        `Indexing ${publishedIds.length} published FAQ${publishedIds.length === 1 ? '' : 's'}; draft items were skipped.`,
      );
    }

    setIndexing(true);
    setError('');
    try {
      const result = await startKbFaqIndex(knowledgeBaseId, publishedIds);
      setActiveJob(result.job);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start indexing');
    } finally {
      setIndexing(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!knowledgeBaseId || !deleteConfirm) return;
    setDeleting(true);
    setError('');
    try {
      if (deleteConfirm.mode === 'single') {
        await deleteKbFaqs(knowledgeBaseId, [deleteConfirm.faq.id]);
        if (selectedFaqId === deleteConfirm.faq.id) {
          setSelectedFaqId(null);
        }
        setSelectedFaqIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteConfirm.faq.id);
          return next;
        });
      } else {
        await deleteKbFaqs(knowledgeBaseId, deleteConfirm.faqIds);
        if (selectedFaqId && deleteConfirm.faqIds.includes(selectedFaqId)) {
          setSelectedFaqId(null);
        }
        setSelectedFaqIds(new Set());
      }
      setDeleteConfirm(null);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete FAQs');
    } finally {
      setDeleting(false);
    }
  }

  function handleFaqSaved() {
    setAddEditOpen(false);
    setEditingFaq(null);
    void load({ silent: true });
  }

  if (forbidden) {
    return <Navigate to="/agents/playground" replace />;
  }

  if (!knowledgeBaseId) {
    return <Navigate to="/knowledge/knowledge-bases" replace />;
  }

  return (
    <main className="admin-page kb-page kb-detail-page">
      <TransientNotice message={transientNotice} />
      <Link to="/knowledge/knowledge-bases" className="kb-back-link">← Knowledge bases</Link>

      {loading && !kb ? (
        <KbPageLoadingState label="Loading knowledge base…" />
      ) : kb ? (
        <>
          <header className="admin-header kb-page-header">
            <div>
              <AdminPageTitle main={kb.name} accent="" />
              <AdminPageDescription>
                {kb.description || 'FAQ knowledge base'}
              </AdminPageDescription>
            </div>
          </header>

          {error && <p className="admin-error" role="alert">{error}</p>}

          <section className="kb-items-section">
            <div className="kb-items-header">
              <h2 className="kb-section-title">FAQs ({total})</h2>
              {canManage && (
                <div className="kb-items-toolbar">
                  {faqs.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={selectedDraftCount === 0 || batchBusy || jobActive}
                        title={
                          selectionCount > 0 && selectedDraftCount === 0
                            ? 'Selected FAQs are already published'
                            : undefined
                        }
                        onClick={() => void handleBatchPublish()}
                      >
                        <Upload {...iconProps({ size: 16 })} aria-hidden />
                        Publish selected
                        {selectedDraftCount > 0 ? ` (${selectedDraftCount})` : ''}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={selectedPublishedCount === 0 || batchBusy || jobActive}
                        title={
                          selectionCount > 0 && selectedPublishedCount === 0
                            ? 'Selected FAQs are already draft'
                            : undefined
                        }
                        onClick={() => void handleBatchDraft()}
                      >
                        <FileInput {...iconProps({ size: 16 })} aria-hidden />
                        Move to draft
                        {selectedPublishedCount > 0 ? ` (${selectedPublishedCount})` : ''}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={
                          selectedPublishedCount === 0 ||
                          !kb.is_configured ||
                          jobActive ||
                          indexing
                        }
                        title={
                          !kb.is_configured
                            ? 'Configure embedding model in Settings first'
                            : selectionCount > 0 && selectedPublishedCount === 0
                              ? 'Publish selected FAQs before indexing'
                              : selectionCount > selectedPublishedCount
                                ? `Only published FAQs can be indexed (${selectedPublishedCount} of ${selectionCount} selected)`
                                : undefined
                        }
                        onClick={() => void handleRunIndex([...selectedFaqIds])}
                      >
                        {indexing ? (
                          <Loader2 {...iconProps({ size: 16, className: 'icon-btn-spin' })} aria-hidden />
                        ) : (
                          <IconRun {...iconProps({ size: 16 })} aria-hidden />
                        )}
                        Run index
                        {selectedPublishedCount > 0 ? ` (${selectedPublishedCount})` : ''}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={selectionCount === 0 || jobActive || deleting}
                        onClick={() =>
                          setDeleteConfirm({ mode: 'bulk', faqIds: [...selectedFaqIds] })
                        }
                      >
                        <IconDelete {...iconProps({ size: 16 })} aria-hidden />
                        Delete selected{selectionCount > 0 ? ` (${selectionCount})` : ''}
                      </button>
                    </>
                  )}
                  <button type="button" className="btn-dark" onClick={() => setSettingsOpen(true)}>
                    <Settings {...iconProps({ size: 16 })} aria-hidden />
                    Settings
                  </button>
                  {kb.capabilities.extract && (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!kb.is_configured || jobActive || extractBusy}
                      title={
                        !kb.faq_settings?.extraction_model_config_id
                          ? 'Configure an extraction model in Settings (AI tab)'
                          : !kb.is_configured
                            ? 'Configure embedding settings first'
                            : undefined
                      }
                      onClick={openExtractModal}
                    >
                      {extractJobActive ? (
                        <Loader2 {...iconProps({ size: 16, className: 'icon-btn-spin' })} aria-hidden />
                      ) : (
                        <Plus {...iconProps({ size: 16 })} aria-hidden />
                      )}
                      Extract from documents
                    </button>
                  )}
                  {kb.capabilities.manual_create && (
                    <button type="button" className="btn-primary" onClick={openCreateModal}>
                      <Plus {...iconProps({ size: 16 })} aria-hidden />
                      Add FAQ
                    </button>
                  )}
                </div>
              )}
            </div>

            <div
              ref={containerRef}
              className={`kb-detail-layout${selectedFaqId ? ' has-detail' : ''}`}
              style={
                selectedFaqId
                  ? { ['--kb-detail-left-pct' as string]: `${leftPct}%` }
                  : undefined
              }
            >
              <div className="kb-detail-list-panel">
                <div className="admin-table-wrap kb-detail-table-wrap">
                  <table className="admin-table kb-detail-table">
                    <thead>
                      <tr>
                        {canManage && (
                          <th className="kb-item-select-col">
                            <input
                              type="checkbox"
                              className="brand-checkbox"
                              checked={allPageSelected}
                              disabled={faqs.length === 0}
                              aria-label="Select all FAQs on this page"
                              onChange={(event) => toggleSelectAllPage(event.target.checked)}
                            />
                          </th>
                        )}
                        <th>Question</th>
                        <th>Answer</th>
                        <th>Source</th>
                        <th>Publication</th>
                        <th className="kb-item-status-col">Index status</th>
                        <th>Updated</th>
                        <th className="kb-item-actions-col">Actions</th>
                        <th className="kb-item-detail-hint-col" aria-hidden />
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td
                            colSpan={canManage ? 9 : 8}
                            className="admin-table-empty session-explorer-table-loading"
                          >
                            <ListLoadingState label="Loading FAQs…" />
                          </td>
                        </tr>
                      ) : faqs.length === 0 ? (
                        <tr>
                          <td colSpan={canManage ? 9 : 8} className="admin-table-empty">
                            &nbsp;
                          </td>
                        </tr>
                      ) : (
                        faqs.map((faq) => {
                          const selected = selectedFaqId === faq.id;
                          const rowChecked = selectedFaqIds.has(faq.id);

                          return (
                            <tr
                              key={faq.id}
                              className={selected ? 'kb-item-row selected' : 'kb-item-row'}
                              onClick={() => setSelectedFaqId(faq.id)}
                            >
                              {canManage && (
                                <td className="kb-item-select-col" onClick={stopRowAction}>
                                  <input
                                    type="checkbox"
                                    className="brand-checkbox"
                                    checked={rowChecked}
                                    aria-label={`Select ${faq.question}`}
                                    onChange={(event) =>
                                      toggleFaqSelection(faq.id, event.target.checked)
                                    }
                                  />
                                </td>
                              )}
                              <td className="kb-faq-question-cell">{faq.question}</td>
                              <td className="kb-faq-answer-cell" title={faq.answer}>
                                {truncateText(faq.answer)}
                              </td>
                              <td>
                                {faq.source_type === 'extracted' && faq.source_document_name
                                  ? faq.source_document_name
                                  : 'Manual'}
                              </td>
                              <td>
                                <span
                                  className={`kb-status-badge ${publicationStatusClass(faq.publication_status)}`}
                                >
                                  {faq.publication_status}
                                </span>
                              </td>
                              <td className="kb-item-status-col">
                                <FaqIndexStatusCell faq={faq} jobActive={jobActive} />
                              </td>
                              <td>{new Date(faq.updated_at).toLocaleString()}</td>
                              <td className="kb-item-actions-col" onClick={stopRowAction}>
                                <div className="row-actions">
                                  {canManage && (
                                    <>
                                      <button
                                        type="button"
                                        className="icon-btn"
                                        title="Edit FAQ"
                                        aria-label={`Edit ${faq.question}`}
                                        disabled={jobActive || batchBusy || publishingFaqId !== null}
                                        onClick={() => openEditModal(faq)}
                                      >
                                        <Pencil {...iconProps()} />
                                      </button>
                                      {faq.publication_status === 'draft' && (
                                        <button
                                          type="button"
                                          className="icon-btn"
                                          title="Publish FAQ"
                                          aria-label={`Publish ${faq.question}`}
                                          disabled={
                                            jobActive ||
                                            batchBusy ||
                                            indexing ||
                                            (publishingFaqId !== null &&
                                              publishingFaqId !== faq.id)
                                          }
                                          onClick={() => void handlePublishFaq(faq.id)}
                                        >
                                          {publishingFaqId === faq.id ? (
                                            <Loader2
                                              {...iconProps({ className: 'icon-btn-spin' })}
                                              aria-hidden
                                            />
                                          ) : (
                                            <Upload {...iconProps()} aria-hidden />
                                          )}
                                        </button>
                                      )}
                                      {faq.publication_status === 'published' && (
                                        <button
                                          type="button"
                                          className="icon-btn icon-btn--run"
                                          title="Run index for this FAQ"
                                          aria-label={`Run index for ${faq.question}`}
                                          disabled={
                                            !kb.is_configured ||
                                            jobActive ||
                                            indexing ||
                                            publishingFaqId !== null
                                          }
                                          onClick={() => void handleRunIndex([faq.id])}
                                        >
                                          <IconRun {...iconProps()} />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="icon-btn danger"
                                        title="Delete FAQ"
                                        aria-label={`Delete ${faq.question}`}
                                        disabled={jobActive || deleting || publishingFaqId !== null}
                                        onClick={() =>
                                          setDeleteConfirm({ mode: 'single', faq })
                                        }
                                      >
                                        <Trash2 {...iconProps()} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="kb-item-detail-hint-col" onClick={stopRowAction}>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  title="View detail"
                                  aria-label={`View detail for ${faq.question}`}
                                  onClick={() => setSelectedFaqId(faq.id)}
                                >
                                  <ChevronRight {...iconProps()} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedFaqId && (
                <>
                  <div
                    className="kb-detail-split-handle"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize FAQ list"
                    onMouseDown={onHandleMouseDown}
                  />
                  <KbFaqDetailPanel
                    faq={selectedFaq}
                    loading={loading && !selectedFaq}
                    onClose={() => setSelectedFaqId(null)}
                  />
                </>
              )}
            </div>
          </section>
        </>
      ) : (
        <p className="admin-error" role="alert">{error || 'Knowledge base not found.'}</p>
      )}

      {extractOpen && (
        <KbImportModal
          title="Extract FAQs from documents"
          confirmLabel="Extract"
          onCancel={() => setExtractOpen(false)}
          onConfirm={handleExtract}
        />
      )}

      {addEditOpen && (
        <KbFaqAddEditModal
          knowledgeBaseId={knowledgeBaseId}
          faq={editingFaq}
          onCancel={() => {
            setAddEditOpen(false);
            setEditingFaq(null);
          }}
          onSaved={handleFaqSaved}
        />
      )}

      {settingsOpen && kb && (
        <KbFaqSettingsModal
          kb={kb}
          embeddingModels={embeddingModels}
          chatModels={chatModels}
          onCancel={() => setSettingsOpen(false)}
          onSaved={(updated) => {
            setKb(updated);
            setSettingsOpen(false);
          }}
        />
      )}

      {deleteConfirm && (
        <KbItemDeleteConfirmModal
          variant="faq"
          mode={deleteConfirm.mode}
          documentName={
            deleteConfirm.mode === 'single' ? deleteConfirm.faq.question : undefined
          }
          count={deleteConfirm.mode === 'bulk' ? deleteConfirm.faqIds.length : undefined}
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
