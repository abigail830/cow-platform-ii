import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  Copy,
  Eye,
  Folder,
  FileText,
  KeyRound,
  MessageSquare,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { listModelConfigs, type ModelConfig } from '../api/models.ts';
import {
  createStudioAgent,
  deleteStudioAgent,
  getPlatformAgentCopyDraft,
  getPlatformMcpDetail,
  getSkillFile,
  getSkillTree,
  getStudioAgent,
  listStudioAgents,
  listStudioAssets,
  putPlatformMcpCredential,
  updateStudioAgent,
  type AssetSummary,
  type SkillTreeNode,
  type StudioAgent,
  type StudioAgentDraft,
} from '../api/studio.ts';
import { iconProps } from '../components/icons/icon-props.ts';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import {
  AGENT_PLAYGROUND_PATH,
  ASSET_MARKET_PATH,
  getNavPage,
} from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

type Tab = 'agents' | 'skills' | 'mcp' | 'sandbox';

/** UI tab keys → API asset type (singular). */
const TAB_ASSET_TYPE: Record<Tab, 'agent' | 'skill' | 'mcp' | 'sandbox'> = {
  agents: 'agent',
  skills: 'skill',
  mcp: 'mcp',
  sandbox: 'sandbox',
};

const PAGE = getNavPage(ASSET_MARKET_PATH)!;

const TAB_LABELS: Record<Tab, string> = {
  agents: 'Agents',
  skills: 'Skills',
  mcp: 'MCP',
  sandbox: 'Sandbox',
};

type AgentRow =
  | { kind: 'platform'; id: string; name: string; slug: string; description: string }
  | { kind: 'studio'; agent: StudioAgent };

export function AssetMarketPage() {
  const { user, refreshAgents } = useAppOutletContext();
  const canWrite = useMemo(() => hasPermission(user, 'agent:asset-market', 'write'), [user]);

  const [tab, setTab] = useState<Tab>('agents');
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [myAgents, setMyAgents] = useState<StudioAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<StudioAgent | 'new' | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<StudioAgentDraft | null>(null);
  const [mcpKeyFor, setMcpKeyFor] = useState<string | null>(null);
  const [viewingSkillId, setViewingSkillId] = useState<string | null>(null);
  const [viewingMcpId, setViewingMcpId] = useState<string | null>(null);
  const [copyBusyId, setCopyBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [assetList, agents] = await Promise.all([
        listStudioAssets(TAB_ASSET_TYPE[tab]),
        listStudioAgents(),
      ]);
      setAssets(assetList);
      setMyAgents(agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleDelete(agent: StudioAgent) {
    if (!window.confirm(`Delete agent “${agent.displayName}”?`)) return;
    try {
      await deleteStudioAgent(agent.id);
      await reload();
      await refreshAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const agentRows: AgentRow[] = useMemo(() => {
    const platform: AgentRow[] = assets.map((asset) => ({
      kind: 'platform',
      id: asset.id,
      name: asset.title,
      slug: asset.id,
      description: asset.description,
    }));
    const studio: AgentRow[] = myAgents.map((agent) => ({ kind: 'studio', agent }));
    return [...platform, ...studio];
  }, [assets, myAgents]);

  function switchTab(next: Tab) {
    setEditing(null);
    setDuplicateFrom(null);
    setMcpKeyFor(null);
    setViewingSkillId(null);
    setViewingMcpId(null);
    setTab(next);
  }

  async function handleCopyStudio(agent: StudioAgent) {
    setCopyBusyId(agent.id);
    setError('');
    try {
      const detail = await getStudioAgent(agent.id);
      setDuplicateFrom({
        slug: `${detail.slug}-copy`,
        displayName: `Copy of ${detail.displayName}`,
        description: detail.description,
        instructions: detail.instructions,
        modelConfigId: detail.modelConfigId,
        skillIds: detail.skillIds,
        platformMcpIds: detail.platformMcpIds,
        sandbox: detail.sandbox,
      });
      setEditing('new');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCopyBusyId(null);
    }
  }

  async function handleCopyPlatform(platformId: string) {
    setCopyBusyId(`platform:${platformId}`);
    setError('');
    try {
      const draft = await getPlatformAgentCopyDraft(platformId);
      setDuplicateFrom(draft);
      setEditing('new');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCopyBusyId(null);
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>
            Browse platform agents, skills, MCP servers, and sandboxes. Create your own agents from
            these assets.
          </AdminPageDescription>
        </div>
      </header>

      <div className="admin-page-tabs">
        <div className="admin-page-tabs-nav" role="tablist" aria-label="Asset market">
          {(['agents', 'skills', 'mcp', 'sandbox'] as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              className={`admin-page-tab${tab === key ? ' active' : ''}`}
              aria-selected={tab === key}
              onClick={() => switchTab(key)}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="admin-page-tabs-actions">
          {canWrite && tab === 'agents' ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setDuplicateFrom(null);
                setEditing('new');
              }}
            >
              + New agent
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : tab === 'agents' ? (
        <AgentsTable
          rows={agentRows}
          canWrite={canWrite}
          copyBusyId={copyBusyId}
          onEdit={(agent) => {
            setDuplicateFrom(null);
            setEditing(agent);
          }}
          onCopyStudio={(agent) => void handleCopyStudio(agent)}
          onCopyPlatform={(id) => void handleCopyPlatform(id)}
          onDelete={handleDelete}
        />
      ) : tab === 'skills' ? (
        <div className={`asset-market-browse${viewingSkillId ? ' has-detail' : ''}`}>
          <AssetTable
            assets={assets}
            empty="No skills published yet."
            selectedId={viewingSkillId}
            onView={(id) => setViewingSkillId(id)}
          />
          {viewingSkillId ? (
            <SkillBrowserPanel skillId={viewingSkillId} onClose={() => setViewingSkillId(null)} />
          ) : null}
        </div>
      ) : tab === 'mcp' ? (
        <div className={`asset-market-browse${viewingMcpId ? ' has-detail' : ''}`}>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Id</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-table-empty">
                      No MCP servers published yet.
                    </td>
                  </tr>
                ) : (
                  assets.map((asset) => (
                    <tr
                      key={`${asset.type}:${asset.id}`}
                      className={viewingMcpId === asset.id ? 'asset-market-row selected' : undefined}
                    >
                      <td>
                        <strong>{asset.title}</strong>
                      </td>
                      <td className="mono-cell">{asset.id}</td>
                      <td className="admin-muted">{asset.description || '—'}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            title="View config"
                            onClick={() => setViewingMcpId(asset.id)}
                          >
                            <Eye {...iconProps()} aria-hidden />
                          </button>
                          {canWrite ? (
                            <button
                              type="button"
                              className="icon-btn"
                              title="Save API key"
                              onClick={() => setMcpKeyFor(asset.id)}
                            >
                              <KeyRound {...iconProps()} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {viewingMcpId ? (
            <McpConfigPanel mcpId={viewingMcpId} onClose={() => setViewingMcpId(null)} />
          ) : null}
        </div>
      ) : (
        <AssetTable assets={assets} empty="No sandboxes published yet." />
      )}

      {editing ? (
        <StudioAgentForm
          initial={editing === 'new' ? null : editing}
          duplicateFrom={editing === 'new' ? duplicateFrom : null}
          onCancel={() => {
            setEditing(null);
            setDuplicateFrom(null);
          }}
          onSaved={async () => {
            setEditing(null);
            setDuplicateFrom(null);
            await reload();
            await refreshAgents();
          }}
        />
      ) : null}

      {mcpKeyFor ? (
        <McpCredentialModal
          platformMcpId={mcpKeyFor}
          onCancel={() => setMcpKeyFor(null)}
          onSaved={() => setMcpKeyFor(null)}
          onError={setError}
        />
      ) : null}
    </main>
  );
}

function AgentsTable({
  rows,
  canWrite,
  copyBusyId,
  onEdit,
  onCopyStudio,
  onCopyPlatform,
  onDelete,
}: {
  rows: AgentRow[];
  canWrite: boolean;
  copyBusyId: string | null;
  onEdit: (agent: StudioAgent) => void;
  onCopyStudio: (agent: StudioAgent) => void;
  onCopyPlatform: (platformId: string) => void;
  onDelete: (agent: StudioAgent) => void;
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Description</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="admin-table-empty">
                No agents yet. Click &quot;New agent&quot; to create one.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              if (row.kind === 'platform') {
                const busy = copyBusyId === `platform:${row.id}`;
                return (
                  <tr key={`platform:${row.id}`}>
                    <td>
                      <strong>{row.name}</strong>
                      <span className="admin-badge">System</span>
                    </td>
                    <td className="mono-cell">{row.slug}</td>
                    <td className="admin-muted">{row.description || '—'}</td>
                    <td>
                      <div className="row-actions">
                        <Link
                          className="icon-btn"
                          to={AGENT_PLAYGROUND_PATH}
                          title="Open in Playground"
                        >
                          <MessageSquare {...iconProps()} aria-hidden />
                        </Link>
                        {canWrite ? (
                          <button
                            type="button"
                            className="icon-btn"
                            title="Copy"
                            disabled={busy}
                            onClick={() => onCopyPlatform(row.id)}
                          >
                            <Copy {...iconProps()} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              }
              const agent = row.agent;
              const busy = copyBusyId === agent.id;
              return (
                <tr key={agent.id}>
                  <td>
                    <strong>{agent.displayName}</strong>
                  </td>
                  <td className="mono-cell">{agent.slug}</td>
                  <td className="admin-muted">{agent.description || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <Link
                        className="icon-btn"
                        to={AGENT_PLAYGROUND_PATH}
                        title="Open in Playground"
                      >
                        <MessageSquare {...iconProps()} aria-hidden />
                      </Link>
                      {canWrite ? (
                        <>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Copy"
                            disabled={busy}
                            onClick={() => onCopyStudio(agent)}
                          >
                            <Copy {...iconProps()} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Edit"
                            onClick={() => onEdit(agent)}
                          >
                            <Pencil {...iconProps()} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Delete"
                            onClick={() => onDelete(agent)}
                          >
                            <Trash2 {...iconProps()} aria-hidden />
                          </button>
                        </>
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
  );
}

function AssetTable({
  assets,
  empty,
  selectedId,
  onView,
}: {
  assets: AssetSummary[];
  empty: string;
  selectedId?: string | null;
  onView?: (id: string) => void;
}) {
  const showActions = Boolean(onView);
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Id</th>
            <th>Description</th>
            {showActions ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {assets.length === 0 ? (
            <tr>
              <td colSpan={showActions ? 4 : 3} className="admin-table-empty">
                {empty}
              </td>
            </tr>
          ) : (
            assets.map((asset) => (
              <tr
                key={`${asset.type}:${asset.id}`}
                className={selectedId === asset.id ? 'asset-market-row selected' : undefined}
              >
                <td>
                  <strong>{asset.title}</strong>
                </td>
                <td className="mono-cell">{asset.id}</td>
                <td className="admin-muted">{asset.description || '—'}</td>
                {showActions ? (
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="View contents"
                        onClick={() => onView?.(asset.id)}
                      >
                        <Eye {...iconProps()} aria-hidden />
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SkillBrowserPanel({ skillId, onClose }: { skillId: string; onClose: () => void }) {
  const [tree, setTree] = useState<SkillTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setContent('');
    setSelectedPath(null);
    void getSkillTree(skillId)
      .then(async (data) => {
        if (cancelled) return;
        setTree(data.tree);
        const path = data.defaultPath;
        if (path) {
          setSelectedPath(path);
          setFileLoading(true);
          try {
            const file = await getSkillFile(skillId, path);
            if (cancelled) return;
            setContent(file.content);
            setTruncated(file.truncated);
          } catch (err) {
            if (!cancelled) setError(err instanceof Error ? err.message : String(err));
          } finally {
            if (!cancelled) setFileLoading(false);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skillId]);

  async function openFile(path: string) {
    setSelectedPath(path);
    setFileLoading(true);
    setError('');
    try {
      const file = await getSkillFile(skillId, path);
      setContent(file.content);
      setTruncated(file.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setContent('');
    } finally {
      setFileLoading(false);
    }
  }

  return (
    <aside className="asset-market-detail-panel" aria-label={`Skill ${skillId}`}>
      <header className="asset-market-detail-header">
        <div>
          <h2>{skillId}</h2>
          <p className="admin-muted">Skill files</p>
        </div>
        <button type="button" className="icon-btn" title="Close" onClick={onClose}>
          <X {...iconProps()} aria-hidden />
        </button>
      </header>
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : (
        <div className="asset-market-skill-split">
          <nav className="asset-market-skill-tree" aria-label="Skill directory">
            <SkillTreeList
              nodes={tree}
              selectedPath={selectedPath}
              onOpenFile={(p) => void openFile(p)}
            />
          </nav>
          <div className="asset-market-skill-file">
            {selectedPath ? (
              <>
                <div className="asset-market-skill-file-path mono-cell">{selectedPath}</div>
                {truncated ? <p className="admin-muted">Preview truncated to 256 KB.</p> : null}
                {fileLoading ? (
                  <p className="admin-muted">Loading…</p>
                ) : (
                  <pre className="asset-market-code">{content}</pre>
                )}
              </>
            ) : (
              <p className="admin-muted">Select a file to preview.</p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function SkillTreeList({
  nodes,
  selectedPath,
  onOpenFile,
  depth = 0,
}: {
  nodes: SkillTreeNode[];
  selectedPath: string | null;
  onOpenFile: (path: string) => void;
  depth?: number;
}) {
  return (
    <ul className="asset-market-tree-list" style={{ paddingLeft: depth === 0 ? 0 : '0.75rem' }}>
      {nodes.map((node) =>
        node.type === 'dir' ? (
          <li key={node.path}>
            <div className="asset-market-tree-dir">
              <Folder {...iconProps({ size: 14 })} aria-hidden />
              <span>{node.name}</span>
            </div>
            {node.children?.length ? (
              <SkillTreeList
                nodes={node.children}
                selectedPath={selectedPath}
                onOpenFile={onOpenFile}
                depth={depth + 1}
              />
            ) : null}
          </li>
        ) : (
          <li key={node.path}>
            <button
              type="button"
              className={`asset-market-tree-file${selectedPath === node.path ? ' active' : ''}`}
              onClick={() => onOpenFile(node.path)}
            >
              <FileText {...iconProps({ size: 14 })} aria-hidden />
              <span>{node.name}</span>
              <ChevronRight {...iconProps({ size: 12 })} aria-hidden />
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function McpConfigPanel({ mcpId, onClose }: { mcpId: string; onClose: () => void }) {
  const [title, setTitle] = useState(mcpId);
  const [json, setJson] = useState('');
  const [toolStatus, setToolStatus] = useState<'ok' | 'needs_key' | 'error' | 'loading'>('loading');
  const [tools, setTools] = useState<Array<{ name: string; description?: string }>>([]);
  const [toolError, setToolError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setToolStatus('loading');
    void getPlatformMcpDetail(mcpId)
      .then((detail) => {
        if (cancelled) return;
        setTitle(detail.title || detail.id);
        setJson(JSON.stringify(detail.config, null, 2));
        setToolStatus(detail.tools.status);
        setTools(detail.tools.tools ?? []);
        setToolError(detail.tools.error ?? '');
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mcpId]);

  return (
    <aside className="asset-market-detail-panel" aria-label={`MCP ${mcpId}`}>
      <header className="asset-market-detail-header">
        <div>
          <h2>{title}</h2>
          <p className="admin-muted">{mcpId} · MCP config</p>
        </div>
        <button type="button" className="icon-btn" title="Close" onClick={onClose}>
          <X {...iconProps()} aria-hidden />
        </button>
      </header>
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : (
        <div className="asset-market-mcp-body">
          <section className="asset-market-mcp-tools" aria-label="Discovered tools">
            <h3>Tools</h3>
            {toolStatus === 'needs_key' ? (
              <p className="admin-muted">
                Save an API key to connect and list tools (discovered at runtime, not stored in
                config).
              </p>
            ) : null}
            {toolStatus === 'error' ? (
              <p className="admin-error" role="alert">
                {toolError || 'Failed to list tools'}
              </p>
            ) : null}
            {toolStatus === 'ok' && tools.length === 0 ? (
              <p className="admin-muted">Connected — no tools reported.</p>
            ) : null}
            {tools.length > 0 ? (
              <ul className="asset-market-tool-chips">
                {tools.map((tool) => (
                  <li key={tool.name} title={tool.description || tool.name}>
                    {tool.name.replace(/^mcp__[^_]+__/, '')}
                  </li>
                ))}
              </ul>
            ) : null}
            {toolStatus === 'ok' ? (
              <p className="admin-muted asset-market-tool-count">
                {tools.length} tool{tools.length === 1 ? '' : 's'} enabled
              </p>
            ) : null}
          </section>
          <section className="asset-market-mcp-config" aria-label="Connection config">
            <h3>Connection</h3>
            <p className="admin-muted">
              Cursor / Claude-compatible <code>mcpServers</code> only — no name, description, or tool
              allowlist in this file.
            </p>
            <pre className="asset-market-code">{json}</pre>
          </section>
        </div>
      )}
    </aside>
  );
}

function McpCredentialModal({
  platformMcpId,
  onCancel,
  onSaved,
  onError,
}: {
  platformMcpId: string;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await putPlatformMcpCredential(platformMcpId, apiKey);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card model-config-form" onClick={(event) => event.stopPropagation()}>
        <h2>MCP credential</h2>
        <p className="admin-muted">Store your API key for {platformMcpId}.</p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field form-field-wide">
              <span>API key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste API key"
                required
                autoFocus
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StudioAgentForm({
  initial,
  duplicateFrom,
  onCancel,
  onSaved,
}: {
  initial: StudioAgent | null;
  duplicateFrom?: StudioAgentDraft | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const isCopy = Boolean(duplicateFrom) && !initial;
  const [loading, setLoading] = useState(Boolean(initial) || isCopy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [skills, setSkills] = useState<AssetSummary[]>([]);
  const [mcps, setMcps] = useState<AssetSummary[]>([]);

  const [slug, setSlug] = useState(initial?.slug ?? duplicateFrom?.slug ?? '');
  const [displayName, setDisplayName] = useState(
    initial?.displayName ?? duplicateFrom?.displayName ?? '',
  );
  const [description, setDescription] = useState(
    initial?.description ?? duplicateFrom?.description ?? '',
  );
  const [instructions, setInstructions] = useState(
    initial?.instructions ?? duplicateFrom?.instructions ?? '',
  );
  const [modelConfigId, setModelConfigId] = useState(
    initial?.modelConfigId ?? duplicateFrom?.modelConfigId ?? '',
  );
  const [skillIds, setSkillIds] = useState<string[]>(
    initial?.skillIds ?? duplicateFrom?.skillIds ?? [],
  );
  const [platformMcpIds, setPlatformMcpIds] = useState<string[]>(
    initial?.platformMcpIds ?? duplicateFrom?.platformMcpIds ?? [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [modelList, skillList, mcpList, detail] = await Promise.all([
          listModelConfigs({ apiType: 'chat-completions', limit: 100 }),
          listStudioAssets('skill'),
          listStudioAssets('mcp'),
          initial ? getStudioAgent(initial.id) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const modelsOnly = modelList.models ?? [];
        setModels(modelsOnly);
        setSkills(skillList);
        setMcps(mcpList);
        if (detail) {
          setSlug(detail.slug);
          setDisplayName(detail.displayName);
          setDescription(detail.description);
          setInstructions(detail.instructions ?? '');
          setModelConfigId(detail.modelConfigId ?? '');
          setSkillIds(detail.skillIds ?? []);
          setPlatformMcpIds(detail.platformMcpIds ?? []);
        } else if (duplicateFrom) {
          setSlug(duplicateFrom.slug);
          setDisplayName(duplicateFrom.displayName);
          setDescription(duplicateFrom.description);
          setInstructions(duplicateFrom.instructions ?? '');
          setModelConfigId(duplicateFrom.modelConfigId ?? modelsOnly[0]?.id ?? '');
          setSkillIds(duplicateFrom.skillIds ?? []);
          setPlatformMcpIds(duplicateFrom.platformMcpIds ?? []);
        } else if (modelsOnly[0] && !modelConfigId) {
          setModelConfigId(modelsOnly[0].id);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial, duplicateFrom]);

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      slug,
      displayName,
      description,
      instructions,
      modelConfigId,
      skillIds,
      platformMcpIds,
      privateMcpIds: [],
      sandbox: duplicateFrom?.sandbox ?? { provider: 'none' },
    };
    try {
      if (initial) await updateStudioAgent(initial.id, body);
      else await createStudioAgent(body);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card model-config-form" onClick={(event) => event.stopPropagation()}>
        <h2>{initial ? 'Edit agent' : isCopy ? 'Copy agent' : 'New agent'}</h2>
        {loading ? (
          <p className="admin-muted">Loading…</p>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)}>
            <div className="form-grid">
              <label className="form-field">
                <span>Slug</span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  disabled={Boolean(initial)}
                  placeholder="my-agent"
                />
              </label>
              <label className="form-field">
                <span>Name</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  placeholder="My agent"
                />
              </label>
              <label className="form-field form-field-wide">
                <span>Description</span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this agent does"
                />
              </label>
              <label className="form-field form-field-wide">
                <span>Model</span>
                <select
                  value={modelConfigId}
                  onChange={(e) => setModelConfigId(e.target.value)}
                  required
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field form-field-wide">
                <span>Prompt</span>
                <textarea
                  rows={8}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="System instructions for this agent"
                />
              </label>
              <fieldset className="form-field form-field-wide">
                <legend>Skills</legend>
                {skills.length === 0 ? (
                  <p className="admin-muted">No skills available.</p>
                ) : (
                  skills.map((skill) => (
                    <label key={skill.id} className="form-checkbox">
                      <input
                        type="checkbox"
                        checked={skillIds.includes(skill.id)}
                        onChange={() => setSkillIds((prev) => toggleId(prev, skill.id))}
                      />
                      <span>{skill.title}</span>
                    </label>
                  ))
                )}
              </fieldset>
              <fieldset className="form-field form-field-wide">
                <legend>Platform MCP</legend>
                {mcps.length === 0 ? (
                  <p className="admin-muted">No MCP servers available.</p>
                ) : (
                  mcps.map((mcp) => (
                    <label key={mcp.id} className="form-checkbox">
                      <input
                        type="checkbox"
                        checked={platformMcpIds.includes(mcp.id)}
                        onChange={() => setPlatformMcpIds((prev) => toggleId(prev, mcp.id))}
                      />
                      <span>{mcp.title}</span>
                    </label>
                  ))
                )}
              </fieldset>
            </div>
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
