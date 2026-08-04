import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import {
  deleteBuiltinAgent,
  listBuiltinAgents,
  listWorkflowBindings,
  updateWorkflowBinding,
  type BuiltinAgent,
  type BuiltinWorkflowKey,
  type WorkflowBinding,
} from '../api/builtinAgents.ts';
import { BUILTIN_WORKFLOW_KEYS, BUILTIN_WORKFLOW_LABELS } from '../builtin-agents/constants.ts';
import { BuiltinAgentDashboard } from '../components/BuiltinAgentDashboard.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = getNavPage('/admin/builtin-agents')!;

type PageTab = 'agents' | 'bindings' | 'dashboard';

export function BuiltinAgentsPage() {
  const navigate = useNavigate();
  const { user } = useAppOutletContext();
  const canWrite = useMemo(
    () => hasPermission(user, 'platform-basic:builtin-agents', 'write'),
    [user],
  );

  const [tab, setTab] = useState<PageTab>('agents');
  const [agents, setAgents] = useState<BuiltinAgent[]>([]);
  const [bindings, setBindings] = useState<WorkflowBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [agentRows, bindingRows] = await Promise.all([
        listBuiltinAgents(),
        listWorkflowBindings(),
      ]);
      setAgents(agentRows);
      setBindings(bindingRows);
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (forbidden) return <Navigate to="/" replace />;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
        <AdminPageDescription>
          Configure sync workflow agents (model + prompt). Business settings only select agents.
        </AdminPageDescription>
      </header>

      <div className="admin-page-tabs">
        <div className="admin-page-tabs-nav" role="tablist" aria-label="Builtin agents">
          <button
            type="button"
            role="tab"
            className={`admin-page-tab${tab === 'agents' ? ' active' : ''}`}
            aria-selected={tab === 'agents'}
            onClick={() => setTab('agents')}
          >
            Agents
          </button>
          <button
            type="button"
            role="tab"
            className={`admin-page-tab${tab === 'bindings' ? ' active' : ''}`}
            aria-selected={tab === 'bindings'}
            onClick={() => setTab('bindings')}
          >
            Platform defaults
          </button>
          <button
            type="button"
            role="tab"
            className={`admin-page-tab${tab === 'dashboard' ? ' active' : ''}`}
            aria-selected={tab === 'dashboard'}
            onClick={() => setTab('dashboard')}
          >
            Dashboard
          </button>
        </div>
        <div className="admin-page-tabs-actions">
          {canWrite ? (
            <button
              type="button"
              className={`btn-primary${tab !== 'agents' ? ' is-tab-hidden' : ''}`}
              aria-hidden={tab !== 'agents'}
              tabIndex={tab === 'agents' ? 0 : -1}
              onClick={() => navigate('/admin/builtin-agents/new')}
            >
              + New agent
            </button>
          ) : null}
        </div>
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}
      {tab === 'dashboard' ? (
        <BuiltinAgentDashboard agents={agents} agentsLoading={loading} />
      ) : loading ? (
        <p className="admin-muted">Loading…</p>
      ) : tab === 'agents' ? (
        <div className="admin-table-wrap">
          <table className="admin-table builtin-agents-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Workflow</th>
                <th>Model</th>
                <th>Version</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td>
                    <Link to={`/admin/builtin-agents/${agent.id}`} className="builtin-agent-name-link">
                      <strong>{agent.name}</strong>
                    </Link>
                    {agent.is_system && <span className="admin-badge">System</span>}
                    <div className="builtin-agent-table-meta admin-muted">
                      {agent.description?.trim() || agent.slug}
                    </div>
                  </td>
                  <td className="builtin-agent-table-meta">
                    {BUILTIN_WORKFLOW_LABELS[agent.workflow_key]}
                  </td>
                  <td className="builtin-agent-table-meta">
                    {agent.model_name ?? agent.model_config_id}
                  </td>
                  <td>{agent.version}</td>
                  <td>
                    <div className="row-actions">
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Copy"
                            onClick={() =>
                              navigate(`/admin/builtin-agents/new?duplicateFrom=${agent.id}`)
                            }
                          >
                            <Copy {...iconProps()} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Edit"
                            onClick={() => navigate(`/admin/builtin-agents/${agent.id}`)}
                          >
                            <Pencil {...iconProps()} aria-hidden />
                          </button>
                          {!agent.is_system && (
                            <button
                              type="button"
                              className="icon-btn danger"
                              title="Delete"
                              onClick={() => void handleDelete(agent.id, load, setError)}
                            >
                              <Trash2 {...iconProps()} aria-hidden />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <BindingsPanel
          bindings={bindings}
          agents={agents}
          canWrite={canWrite}
          onSaved={() => void load()}
          onError={setError}
        />
      )}
    </div>
  );
}

async function handleDelete(id: string, reload: () => Promise<void>, setError: (v: string) => void) {
  if (!window.confirm('Delete this builtin agent?')) return;
  try {
    await deleteBuiltinAgent(id);
    await reload();
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Delete failed');
  }
}

function BindingsPanel({
  bindings,
  agents,
  canWrite,
  onSaved,
  onError,
}: {
  bindings: WorkflowBinding[];
  agents: BuiltinAgent[];
  canWrite: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function saveBinding(workflowKey: BuiltinWorkflowKey, agentId: string) {
    setBusyKey(workflowKey);
    onError('');
    try {
      await updateWorkflowBinding(workflowKey, agentId);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update binding');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Workflow</th>
            <th>Default agent</th>
          </tr>
        </thead>
        <tbody>
          {BUILTIN_WORKFLOW_KEYS.map((workflowKey) => {
            const binding = bindings.find((b) => b.workflow_key === workflowKey);
            const options = agents.filter((a) => a.workflow_key === workflowKey);
            return (
              <tr key={workflowKey}>
                <td>{BUILTIN_WORKFLOW_LABELS[workflowKey]}</td>
                <td>
                  <div className="builtin-agent-binding-field">
                    <select
                      className="builtin-agent-binding-select"
                      value={binding?.builtin_agent_def_id ?? ''}
                      disabled={!canWrite || busyKey === workflowKey || options.length === 0}
                      onChange={(e) => void saveBinding(workflowKey, e.target.value)}
                    >
                      {options.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                    {binding?.agent_slug ? (
                      <span className="admin-form-hint mono-cell">{binding.agent_slug}</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
