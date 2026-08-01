import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  createPipelineConfig,
  deletePipelineConfig,
  listPipelineConfigs,
  updatePipelineConfig,
  type PipelineConfig,
} from '../api/pipelines.ts';
import { GitBranch, Pencil, Search, Trash2 } from 'lucide-react';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { PipelineConfigForm } from '../components/PipelineConfigForm.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = getNavPage('/admin/pipelines')!;

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
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PipelineConfig | null>(null);
  const [forbidden, setForbidden] = useState(false);

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

  async function handleDelete(pipeline: PipelineConfig) {
    if (!window.confirm(`Delete pipeline "${pipeline.name}"?`)) return;
    try {
      await deletePipelineConfig(pipeline.id);
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
    <>
      <main className="admin-page">
        <header className="admin-header">
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>
            Manage document processing pipelines. Pipelines define how documents are parsed and processed.
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
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            disabled={!canWrite}
            title={canWrite ? undefined : 'Read-only access'}
          >
            + New pipeline
          </button>
        </div>

        {error && <p className="error inline">{error}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table pipelines-config-table">
            <colgroup>
              <col className="pipelines-col-name" />
              <col className="pipelines-col-desc" />
              <col className="pipelines-col-model" />
              <col className="pipelines-col-command" />
              <col className="pipelines-col-updated" />
              <col className="pipelines-col-enabled" />
              <col className="pipelines-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Model</th>
                <th>Command</th>
                <th>Updated</th>
                <th>Enabled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="admin-table-empty">
                    Loading…
                  </td>
                </tr>
              ) : pipelines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-table-empty">
                    No pipelines configured yet. Click &quot;New pipeline&quot; to get started.
                  </td>
                </tr>
              ) : (
                pipelines.map((pipeline) => (
                  <tr key={pipeline.id}>
                    <td>
                      <div className="model-cell">
                        <span className="model-cell-icon" aria-hidden>
                          <GitBranch {...iconProps()} />
                        </span>
                        <div className="model-cell-name">{pipeline.name}</div>
                      </div>
                    </td>
                    <td className="pipeline-desc-cell pipeline-multiline-cell" title={pipeline.description ?? undefined}>
                      {pipeline.description ?? '—'}
                    </td>
                    <td>{pipeline.modelConfigName ?? '—'}</td>
                    <td className="pipeline-command-cell pipeline-multiline-cell" title={pipeline.commandTemplate}>
                      {pipeline.commandTemplate}
                    </td>
                    <td>{new Date(pipeline.updatedAt).toLocaleDateString()}</td>
                    <td>
                      <label className="form-checkbox pipeline-enabled-toggle">
                        <input
                          type="checkbox"
                          className="brand-checkbox"
                          checked={pipeline.isEnabled}
                          disabled={!canWrite}
                          onChange={() => void handleToggleEnabled(pipeline)}
                          aria-label={pipeline.isEnabled ? 'Enabled' : 'Disabled'}
                        />
                      </label>
                    </td>
                    <td className="pipeline-actions-cell">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Edit"
                          onClick={() => {
                            setEditing(pipeline);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil {...iconProps()} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Delete"
                          onClick={() => void handleDelete(pipeline)}
                          disabled={!canWrite}
                        >
                          <Trash2 {...iconProps()} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="admin-footer">
          <span>
            Showing {rangeStart}–{rangeEnd} of {total}
          </span>
          <span>{limit} per page</span>
        </footer>
      </main>

      {formOpen && (
        <PipelineConfigForm
          initial={editing}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={async (input) => {
            if (editing) {
              await updatePipelineConfig(editing.id, input);
            } else {
              await createPipelineConfig(input);
            }
            setFormOpen(false);
            setEditing(null);
            await loadPipelines();
          }}
        />
      )}
    </>
  );
}
