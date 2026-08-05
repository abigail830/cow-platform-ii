import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  createPipelineConfig,
  deletePipelineConfig,
  listPipelineConfigs,
  updatePipelineConfig,
  type PipelineConfig,
  type PipelineConfigInput,
} from '../api/pipelines.ts';
import { ChevronRight, GitBranch, Pencil, Search, Trash2 } from 'lucide-react';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { PipelineConfigForm } from '../components/PipelineConfigForm.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = getNavPage('/admin/pipelines')!;

function stopRowAction(event: React.MouseEvent) {
  event.stopPropagation();
}

function PipelineRow({
  pipeline,
  selected,
  canWrite,
  onSelect,
  onEdit,
  onDelete,
  onToggleEnabled,
}: {
  pipeline: PipelineConfig;
  selected: boolean;
  canWrite: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
}) {
  const isSystem = pipeline.isSystem === true;
  const configLabel = pipeline.configYaml?.trim() ? 'Custom' : 'Default';
  const configPreview = pipeline.configYaml?.trim()
    ? pipeline.configYaml.trim().split('\n').find((line) => line.trim() && !line.trim().startsWith('#')) ||
      'Custom YAML'
    : null;

  return (
    <tr
      className={`kb-item-row${selected ? ' selected' : ''}${isSystem ? ' pipeline-system-row' : ''}`}
      onClick={onSelect}
    >
      <td>
        <div className="model-cell">
          <span className="model-cell-icon" aria-hidden>
            <GitBranch {...iconProps()} />
          </span>
          <div className="model-cell-name">
            {pipeline.name}
            {isSystem && <span className="pipeline-system-badge">System</span>}
          </div>
        </div>
      </td>
      <td className="pipeline-desc-cell pipeline-multiline-cell">
        <div className="pipeline-cell-clamp" title={pipeline.description ?? undefined}>
          {pipeline.description ?? '—'}
          {pipeline.boundTo && <div className="pipeline-bound-hint">Bound to: {pipeline.boundTo}</div>}
        </div>
      </td>
      <td
        className="pipeline-config-cell pipeline-multiline-cell"
        title={pipeline.configYaml?.trim() || 'Using CLI packaged default'}
      >
        <div className="pipeline-cell-clamp">
          <strong>{configLabel}</strong>
          {configPreview && <div className="pipeline-bound-hint">{configPreview.slice(0, 72)}</div>}
        </div>
      </td>
      <td className="pipeline-command-cell pipeline-multiline-cell" title={pipeline.commandTemplate}>
        <div className="pipeline-cell-clamp">
          {pipeline.commandTemplate}
          {pipeline.workflowFile && (
            <div className="pipeline-bound-hint">GHA: {pipeline.workflowFile}</div>
          )}
        </div>
      </td>
      <td className={`pipeline-updated-cell${isSystem ? ' pipeline-system-meta' : ''}`}>
        {isSystem ? '—' : new Date(pipeline.updatedAt).toLocaleDateString()}
      </td>
      <td className="pipeline-enabled-cell" onClick={stopRowAction}>
        <label className="form-checkbox pipeline-enabled-toggle">
          <input
            type="checkbox"
            className="brand-checkbox"
            checked={pipeline.isEnabled}
            disabled={!canWrite || isSystem}
            onChange={() => onToggleEnabled()}
            aria-label={pipeline.isEnabled ? 'Enabled' : 'Disabled'}
          />
        </label>
      </td>
      <td className="pipeline-actions-cell" onClick={stopRowAction}>
        <div className="row-actions">
          <button type="button" className="icon-btn" title="Edit" onClick={onEdit} disabled={!canWrite}>
            <Pencil {...iconProps()} />
          </button>
          {!isSystem && (
            <button
              type="button"
              className="icon-btn danger"
              title="Delete"
              onClick={onDelete}
              disabled={!canWrite}
            >
              <Trash2 {...iconProps()} />
            </button>
          )}
        </div>
      </td>
      <td className="kb-item-detail-hint-col" aria-hidden>
        <ChevronRight {...iconProps({ size: 16 })} />
      </td>
    </tr>
  );
}

export function PipelinesConfigPage() {
  const { user } = useAppOutletContext();
  const canWrite = useMemo(() => hasPermission(user, 'platform-basic:pipelines', 'write'), [user]);
  const [pipelines, setPipelines] = useState<PipelineConfig[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [panelMode, setPanelMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editing, setEditing] = useState<PipelineConfig | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('pipelines-config-split', 52, {
    minPct: 28,
    maxPct: 72,
  });

  const panelOpen = panelMode !== 'closed';

  const loadPipelines = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listPipelineConfigs({ search, page, limit });
      setPipelines(data.pipelines);
      setTotal(data.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
        setForbidden(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [limit, page, search]);

  useEffect(() => {
    void loadPipelines();
  }, [loadPipelines]);

  useEffect(() => {
    if (panelMode !== 'edit' || !editing) return;
    const next = pipelines.find((pipeline) => pipeline.id === editing.id) ?? null;
    if (next) setEditing(next);
  }, [pipelines, panelMode, editing?.id]);

  function closePanel() {
    setPanelMode('closed');
    setEditing(null);
  }

  function openCreate() {
    setEditing(null);
    setPanelMode('create');
  }

  function openEdit(pipeline: PipelineConfig) {
    setEditing(pipeline);
    setPanelMode('edit');
  }

  async function handleDelete(pipeline: PipelineConfig) {
    if (!window.confirm(`Delete pipeline "${pipeline.name}"?`)) return;
    try {
      await deletePipelineConfig(pipeline.id);
      if (editing?.id === pipeline.id) closePanel();
      await loadPipelines();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  async function handleToggleEnabled(pipeline: PipelineConfig) {
    try {
      await updatePipelineConfig(pipeline.id, { isEnabled: !pipeline.isEnabled });
      await loadPipelines();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  if (forbidden) {
    return <Navigate to="/agents/playground" replace />;
  }

  return (
    <main className="admin-page pipelines-config-page">
      <header className="admin-header">
        <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
        <AdminPageDescription>
          Document pipelines parse channel uploads. PageIndex knowledge bases are linked to the system
          KB import pipeline at creation time.
        </AdminPageDescription>
      </header>

      <div className="admin-toolbar">
        <div className="admin-toolbar-left">
          <div className="admin-search">
            <Search {...iconProps()} />
            <input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Search pipelines…"
            />
          </div>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={openCreate}
          disabled={!canWrite}
          title={canWrite ? undefined : 'Read-only access'}
        >
          + New pipeline
        </button>
      </div>

      {error && <p className="error inline">{error}</p>}

      <div
        ref={containerRef}
        className={`pipelines-config-layout kb-detail-layout${panelOpen ? ' has-detail' : ''}`}
        style={panelOpen ? { ['--kb-detail-left-pct' as string]: `${leftPct}%` } : undefined}
      >
        <div className="kb-detail-list-panel">
          <div className="admin-table-wrap kb-detail-table-wrap">
            <table className="admin-table pipelines-config-table kb-detail-table">
              <colgroup>
                <col className="pipelines-col-name" />
                <col className="pipelines-col-desc" />
                <col className="pipelines-col-config" />
                <col className="pipelines-col-command" />
                <col className="pipelines-col-updated" />
                <col className="pipelines-col-enabled" />
                <col className="pipelines-col-actions" />
                <col className="pipelines-col-hint" />
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Config YAML</th>
                  <th>Command</th>
                  <th>Updated</th>
                  <th>Enabled</th>
                  <th>Actions</th>
                  <th className="kb-item-detail-hint-col" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="admin-table-empty">
                      Loading…
                    </td>
                  </tr>
                ) : pipelines.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="admin-table-empty">
                      No pipelines configured yet. Click &quot;New pipeline&quot; to get started.
                    </td>
                  </tr>
                ) : (
                  pipelines.map((pipeline) => (
                    <PipelineRow
                      key={pipeline.id}
                      pipeline={pipeline}
                      selected={panelMode === 'edit' && editing?.id === pipeline.id}
                      canWrite={canWrite}
                      onSelect={() => openEdit(pipeline)}
                      onEdit={() => openEdit(pipeline)}
                      onDelete={() => void handleDelete(pipeline)}
                      onToggleEnabled={() => void handleToggleEnabled(pipeline)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <footer className="admin-footer pipelines-config-footer">
            <span>
              Showing {rangeStart}–{rangeEnd} of {total}
            </span>
            <span>{limit} per page</span>
          </footer>
        </div>

        {panelOpen && (
          <>
            <div
              className="kb-detail-split-handle"
              role="separator"
              aria-orientation="vertical"
              onMouseDown={onHandleMouseDown}
            />
            <PipelineConfigForm
              key={panelMode === 'create' ? 'create' : editing?.id ?? 'edit'}
              initial={panelMode === 'edit' ? editing : null}
              onCancel={closePanel}
              onSubmit={async (input) => {
                if (panelMode === 'edit' && editing) {
                  await updatePipelineConfig(editing.id, input);
                } else {
                  await createPipelineConfig(input as PipelineConfigInput);
                }
                closePanel();
                await loadPipelines();
              }}
            />
          </>
        )}
      </div>
    </main>
  );
}
