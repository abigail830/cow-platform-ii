import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  createBuiltinAgent,
  getBuiltinAgent,
  updateBuiltinAgent,
  type BuiltinAgent,
  type BuiltinWorkflowKey,
} from '../api/builtinAgents.ts';
import { listModelConfigs, type ModelConfig } from '../api/models.ts';
import {
  BUILTIN_SAMPLE_VARIABLES,
  BUILTIN_WORKFLOW_KEYS,
  BUILTIN_WORKFLOW_LABELS,
  defaultOutputMode,
} from '../builtin-agents/constants.ts';
import { BuiltinAgentPlayground } from '../components/BuiltinAgentPlayground.tsx';
import { useAppOutletContext } from '../layouts/AppLayout.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { hasPermission } from '../shared/permissions.ts';

type EditTab = 'config' | 'playground';

const LIST_PATH = '/admin/builtin-agents';

export function BuiltinAgentEditPage() {
  const { id: routeId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAppOutletContext();

  const isNew = routeId === 'new' || !routeId;
  const duplicateFromId = searchParams.get('duplicateFrom');
  const canWrite = useMemo(
    () => hasPermission(user, 'platform-basic:builtin-agents', 'write'),
    [user],
  );

  const [tab, setTab] = useState<EditTab>('config');
  const [agent, setAgent] = useState<BuiltinAgent | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [workflowKey, setWorkflowKey] = useState<BuiltinWorkflowKey>('faq_extract');
  const [modelConfigId, setModelConfigId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPromptTemplate, setUserPromptTemplate] = useState('');
  const [temperature, setTemperature] = useState('0.2');

  const [chatModels, setChatModels] = useState<ModelConfig[]>([]);
  const [vlmModels, setVlmModels] = useState<ModelConfig[]>([]);

  const models = workflowKey === 'session_image_extract' ? vlmModels : chatModels;

  const applyAgentToForm = useCallback((row: BuiltinAgent) => {
    setAgent(row);
    setName(row.name);
    setSlug(row.slug);
    setDescription(row.description ?? '');
    setWorkflowKey(row.workflow_key);
    setModelConfigId(row.model_config_id);
    setSystemPrompt(row.system_prompt);
    setUserPromptTemplate(row.user_prompt_template);
    setTemperature(row.temperature ?? '0.2');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listModelConfigs({ apiType: 'chat-completions', limit: 100 }),
      listModelConfigs({ apiType: 'vlm', limit: 100 }),
    ])
      .then(([chat, vlm]) => {
        if (cancelled) return;
        setChatModels(chat.models);
        setVlmModels(vlm.models);
      })
      .catch(() => {
        if (!cancelled) {
          setChatModels([]);
          setVlmModels([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isNew) {
      if (duplicateFromId) {
        setLoading(true);
        void getBuiltinAgent(duplicateFromId)
          .then((source) => {
            applyAgentToForm(source);
            setAgent(null);
            setName(`${source.name} (copy)`);
            setSlug(`${source.slug}-copy`);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : 'Failed to load source agent');
          })
          .finally(() => setLoading(false));
      }
      return;
    }

    if (!routeId) return;
    setLoading(true);
    void getBuiltinAgent(routeId)
      .then((row) => {
        applyAgentToForm(row);
        setError('');
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load agent';
        if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
          setForbidden(true);
        } else {
          setError(message);
        }
      })
      .finally(() => setLoading(false));
  }, [applyAgentToForm, duplicateFromId, isNew, routeId]);

  async function handleSave(): Promise<BuiltinAgent | null> {
    if (!canWrite) return null;
    setSaving(true);
    setError('');
    setSaveNotice('');
    try {
      if (isNew) {
        const created = await createBuiltinAgent({
          slug: slug.trim(),
          name: name.trim(),
          description: description.trim() || null,
          workflow_key: workflowKey,
          api_type: workflowKey === 'session_image_extract' ? 'vlm' : 'chat-completions',
          model_config_id: modelConfigId,
          system_prompt: systemPrompt,
          user_prompt_template: userPromptTemplate,
          output_mode: defaultOutputMode(workflowKey),
          temperature: temperature || null,
        });
        setSaveNotice('Agent created.');
        navigate(`/admin/builtin-agents/${created.id}`, { replace: true });
        return created;
      }

      if (!agent) return null;
      const updated = await updateBuiltinAgent(agent.id, {
        name: name.trim(),
        description: description.trim() || null,
        model_config_id: modelConfigId,
        system_prompt: systemPrompt,
        user_prompt_template: userPromptTemplate,
        temperature: temperature || null,
      });
      applyAgentToForm(updated);
      setSaveNotice('Saved.');
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  }

  if (forbidden) return <Navigate to="/" replace />;
  if (!canWrite && !isNew) return <Navigate to={LIST_PATH} replace />;

  const pageTitle = isNew ? 'New builtin agent' : agent?.name ?? 'Builtin agent';
  const canUsePlayground = Boolean(agent?.id);

  return (
    <div className="admin-page builtin-agent-edit-page">
      <div className="builtin-agent-edit-back">
        <Link to={LIST_PATH} className="builtin-agent-back-link">
          <ArrowLeft {...iconProps({ size: 16 })} aria-hidden />
          Builtin agents
        </Link>
      </div>

      <header className="admin-header builtin-agent-edit-header">
        <h1 className="builtin-agent-edit-title">{pageTitle}</h1>
      </header>

      <div className="admin-page-tabs">
        <div className="admin-page-tabs-nav" role="tablist" aria-label="Agent editor">
          <button
            type="button"
            role="tab"
            className={`admin-page-tab${tab === 'config' ? ' active' : ''}`}
            aria-selected={tab === 'config'}
            onClick={() => setTab('config')}
          >
            Configuration
          </button>
          <button
            type="button"
            role="tab"
            className={`admin-page-tab${tab === 'playground' ? ' active' : ''}`}
            aria-selected={tab === 'playground'}
            disabled={!canUsePlayground}
            title={canUsePlayground ? undefined : 'Save the agent first to use the playground'}
            onClick={() => setTab('playground')}
          >
            Test playground
          </button>
        </div>
        <div className="admin-page-tabs-actions">
          {canWrite ? (
            <button
              type="button"
              className={`btn-primary${tab !== 'config' ? ' is-tab-hidden' : ''}`}
              disabled={saving || loading}
              aria-hidden={tab !== 'config'}
              tabIndex={tab === 'config' ? 0 : -1}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : isNew ? 'Create agent' : 'Save'}
            </button>
          ) : null}
        </div>
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}
      {saveNotice && <p className="admin-success" role="status">{saveNotice}</p>}

      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : tab === 'config' ? (
        <div className="builtin-agent-config-form">
          <div className="builtin-agent-config-row builtin-agent-config-row--2">
            <label className="form-field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required disabled={!canWrite} />
            </label>
            {isNew ? (
              <label className="form-field">
                <span>Workflow</span>
                <select
                  value={workflowKey}
                  onChange={(e) => setWorkflowKey(e.target.value as BuiltinWorkflowKey)}
                  disabled={!canWrite}
                >
                  {BUILTIN_WORKFLOW_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {BUILTIN_WORKFLOW_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
            ) : agent ? (
              <label className="form-field">
                <span>Workflow</span>
                <input value={BUILTIN_WORKFLOW_LABELS[agent.workflow_key]} disabled readOnly />
              </label>
            ) : null}
          </div>

          {isNew && (
            <label className="form-field form-field-full">
              <span>Slug</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} required disabled={!canWrite} />
            </label>
          )}

          <label className="form-field form-field-full">
            <span>Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canWrite}
            />
          </label>

          <div className="builtin-agent-config-row builtin-agent-config-row--model">
            <label className="form-field">
              <span>Model</span>
              <select
                value={modelConfigId}
                onChange={(e) => setModelConfigId(e.target.value)}
                required
                disabled={!canWrite}
              >
                <option value="">Select model…</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.modelId})
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Temperature</span>
              <input
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                disabled={!canWrite}
              />
            </label>
          </div>

          <label className="form-field form-field-full">
            <span>System prompt</span>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              disabled={!canWrite}
            />
          </label>

          <label className="form-field form-field-full">
            <span>User prompt template</span>
            <textarea
              value={userPromptTemplate}
              onChange={(e) => setUserPromptTemplate(e.target.value)}
              rows={14}
              required
              disabled={!canWrite}
            />
            <span className="admin-form-hint builtin-agent-config-hint">
              Variables:{' '}
              {(BUILTIN_SAMPLE_VARIABLES[workflowKey]
                ? Object.keys(BUILTIN_SAMPLE_VARIABLES[workflowKey])
                : []
              ).join(', ')}
            </span>
          </label>
        </div>
      ) : tab === 'playground' && agent ? (
        <BuiltinAgentPlayground
          agentId={agent.id}
          workflowKey={agent.workflow_key}
          models={models}
          baseConfig={{
            modelConfigId,
            systemPrompt,
            userPromptTemplate,
            temperature,
          }}
        />
      ) : null}
    </div>
  );
}
