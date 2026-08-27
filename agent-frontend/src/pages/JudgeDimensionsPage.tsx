import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, Search, Trash2 } from 'lucide-react';
import {
  createJudgeScenario,
  deleteJudgeScenario,
  listJudgeScenarios,
  updateJudgeScenario,
  type EvalJudgeDimension,
  type EvalJudgeScenario,
} from '../api/judgeDimensions.ts';
import { IconEdit } from '../components/AdminActionIcons.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = getNavPage('/evaluation/judge-dimensions')!;

type DimensionForm = EvalJudgeDimension;
type ScenarioForm = {
  scenario_key: string;
  label: string;
  description: string;
  requires_ground_truth: boolean;
  min_variants: string;
  is_enabled: boolean;
  dimensions: DimensionForm[];
};

type FormTab = 'general' | number;

function emptyDimension(): DimensionForm {
  return {
    id: '',
    label: '',
    scope: 'variant',
    kind: 'geval_score',
    weight: 1,
    criteria: '',
  };
}

function emptyScenarioForm(): ScenarioForm {
  return {
    scenario_key: '',
    label: '',
    description: '',
    requires_ground_truth: false,
    min_variants: '2',
    is_enabled: true,
    dimensions: [emptyDimension()],
  };
}

function scenarioToForm(scenario: EvalJudgeScenario): ScenarioForm {
  return {
    scenario_key: scenario.scenario_key,
    label: scenario.label,
    description: scenario.description ?? '',
    requires_ground_truth: scenario.requires_ground_truth,
    min_variants: String(scenario.min_variants),
    is_enabled: scenario.is_enabled,
    dimensions: scenario.dimensions.map((dimension) => ({ ...dimension })),
  };
}

function dimensionTabLabel(dimension: DimensionForm, index: number): string {
  return dimension.label.trim() || dimension.id.trim() || `Dimension ${index + 1}`;
}

export function JudgeDimensionsPage() {
  const { user } = useAppOutletContext();
  const canWrite = useMemo(
    () => hasPermission(user, 'evaluation:judge-dimensions', 'write'),
    [user],
  );

  const [scenarios, setScenarios] = useState<EvalJudgeScenario[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EvalJudgeScenario | null>(null);
  const [form, setForm] = useState<ScenarioForm>(emptyScenarioForm());
  const [activeTab, setActiveTab] = useState<FormTab>('general');
  const [formError, setFormError] = useState('');
  const [formBusy, setFormBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listJudgeScenarios({ search });
      setScenarios(result.scenarios);
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
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyScenarioForm());
    setActiveTab('general');
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(scenario: EvalJudgeScenario) {
    setEditing(scenario);
    setForm(scenarioToForm(scenario));
    setActiveTab('general');
    setFormError('');
    setFormOpen(true);
  }

  function updateDimension(index: number, patch: Partial<DimensionForm>) {
    setForm((prev) => ({
      ...prev,
      dimensions: prev.dimensions.map((dimension, idx) =>
        idx === index ? { ...dimension, ...patch } : dimension,
      ),
    }));
  }

  function addDimension() {
    setForm((prev) => {
      const nextIndex = prev.dimensions.length;
      setActiveTab(nextIndex);
      return { ...prev, dimensions: [...prev.dimensions, emptyDimension()] };
    });
  }

  function removeDimension(index: number) {
    setForm((prev) => ({
      ...prev,
      dimensions: prev.dimensions.filter((_, idx) => idx !== index),
    }));
    setActiveTab((current) => {
      if (current === 'general') return current;
      if (current === index) return 'general';
      if (typeof current === 'number' && current > index) return current - 1;
      return current;
    });
  }

  async function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');
    setFormBusy(true);

    const minVariants = Number(form.min_variants);
    const payload = {
      label: form.label.trim(),
      description: form.description.trim() || null,
      requires_ground_truth: form.requires_ground_truth,
      min_variants: minVariants,
      is_enabled: form.is_enabled,
      dimensions: form.dimensions.map((dimension) => ({
        ...dimension,
        id: dimension.id.trim(),
        label: dimension.label.trim(),
        criteria: dimension.criteria.trim(),
        weight: Number(dimension.weight),
      })),
    };

    try {
      if (editing) {
        await updateJudgeScenario(editing.id, payload);
      } else {
        await createJudgeScenario({
          scenario_key: form.scenario_key.trim(),
          ...payload,
        });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save scenario');
    } finally {
      setFormBusy(false);
    }
  }

  const activeDimensionIndex = typeof activeTab === 'number' ? activeTab : null;
  const activeDimension =
    activeDimensionIndex != null ? form.dimensions[activeDimensionIndex] : null;

  if (forbidden) return <Navigate to="/" replace />;

  return (
    <>
      <main className="admin-page">
        <header className="admin-header">
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>
            Configure LLM-as-judge evaluation scenarios and dimension criteria (GEval prompts) for Full-mode
            eval compare. Reference a scenario from Platform basic → Pipelines → Eval Judge Compare via{' '}
            <code>scenario_id</code> in Config YAML.
          </AdminPageDescription>
        </header>

        <div className="admin-toolbar">
          <div className="admin-toolbar-left">
            <div className="admin-search">
              <Search {...iconProps()} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search scenario key or label…"
              />
            </div>
          </div>
          {canWrite && (
            <button type="button" className="btn-primary" onClick={openCreate}>
              <Plus {...iconProps()} aria-hidden />
              New scenario
            </button>
          )}
        </div>

        {error && <p className="error inline">{error}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Scenario key</th>
                <th>Label</th>
                <th>Dimensions</th>
                <th>Min variants</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="admin-table-empty">
                    Loading…
                  </td>
                </tr>
              ) : scenarios.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-table-empty">
                    No judge scenarios found.
                  </td>
                </tr>
              ) : (
                scenarios.map((scenario) => (
                  <tr key={scenario.id}>
                    <td>
                      <code>{scenario.scenario_key}</code>
                      {scenario.is_system ? <span className="capability-pill">System</span> : null}
                    </td>
                    <td>{scenario.label}</td>
                    <td>{scenario.dimensions.length}</td>
                    <td>{scenario.min_variants}</td>
                    <td>{scenario.is_enabled ? 'Enabled' : 'Disabled'}</td>
                    <td>
                      {canWrite && (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            title="Edit"
                            onClick={() => openEdit(scenario)}
                          >
                            <IconEdit />
                          </button>
                          {!scenario.is_system ? (
                            <button
                              type="button"
                              className="icon-btn danger"
                              title="Delete"
                              onClick={() => {
                                if (!window.confirm(`Delete scenario "${scenario.label}"?`)) return;
                                void deleteJudgeScenario(scenario.id).then(() => load());
                              }}
                            >
                              <Trash2 {...iconProps()} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {formOpen && (
        <div className="modal-backdrop" onClick={() => !formBusy && setFormOpen(false)}>
          <div
            className="modal-card judge-dimensions-form-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{editing ? 'Edit judge scenario' : 'New judge scenario'}</h2>

            <div className="modal-tabs judge-dimensions-modal-tabs" role="tablist" aria-label="Scenario editor">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'general'}
                className={`modal-tab${activeTab === 'general' ? ' active' : ''}`}
                onClick={() => setActiveTab('general')}
              >
                General
              </button>
              {form.dimensions.map((dimension, index) => (
                <button
                  key={index}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === index}
                  className={`modal-tab${activeTab === index ? ' active' : ''}`}
                  onClick={() => setActiveTab(index)}
                  title={dimension.id || undefined}
                >
                  {dimensionTabLabel(dimension, index)}
                </button>
              ))}
              {canWrite ? (
                <button type="button" className="modal-tab judge-dimensions-add-tab" onClick={addDimension}>
                  <Plus {...iconProps({ size: 14 })} aria-hidden />
                  Add
                </button>
              ) : null}
            </div>

            <form className="judge-dimensions-form" onSubmit={(event) => void handleFormSubmit(event)}>
              <div className="judge-dimensions-tab-panel">
                {activeTab === 'general' ? (
                  <div className="form-grid judge-dimensions-general-grid">
                    {!editing ? (
                      <label className="form-field">
                        <span>Scenario key</span>
                        <input
                          value={form.scenario_key}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, scenario_key: event.target.value }))
                          }
                          placeholder="e.g. asr_pipeline_compare_no_gt"
                          required
                        />
                      </label>
                    ) : (
                      <label className="form-field">
                        <span>Scenario key</span>
                        <input value={form.scenario_key} readOnly disabled />
                      </label>
                    )}
                    <label className="form-field">
                      <span>Label</span>
                      <input
                        value={form.label}
                        onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
                        required
                      />
                    </label>
                    <label className="form-field">
                      <span>Min variants</span>
                      <input
                        type="number"
                        min={2}
                        value={form.min_variants}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, min_variants: event.target.value }))
                        }
                        required
                      />
                    </label>
                    <label className="form-field form-field-wide">
                      <span>Description</span>
                      <textarea
                        rows={3}
                        value={form.description}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, description: event.target.value }))
                        }
                      />
                    </label>
                    <div className="judge-dimensions-options-row">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={form.requires_ground_truth}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, requires_ground_truth: event.target.checked }))
                          }
                        />
                        <span>Requires ground truth</span>
                      </label>
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={form.is_enabled}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, is_enabled: event.target.checked }))
                          }
                        />
                        <span>Enabled</span>
                      </label>
                    </div>
                  </div>
                ) : activeDimension && activeDimensionIndex != null ? (
                  <div className="form-grid judge-dimensions-dimension-grid">
                    <label className="form-field">
                      <span>ID</span>
                      <input
                        value={activeDimension.id}
                        onChange={(event) =>
                          updateDimension(activeDimensionIndex, { id: event.target.value })
                        }
                        placeholder="completeness"
                        required
                        disabled={Boolean(editing?.is_system)}
                      />
                    </label>
                    <label className="form-field">
                      <span>Label</span>
                      <input
                        value={activeDimension.label}
                        onChange={(event) =>
                          updateDimension(activeDimensionIndex, { label: event.target.value })
                        }
                        required
                      />
                    </label>
                    <label className="form-field">
                      <span>Scope</span>
                      <select
                        value={activeDimension.scope}
                        onChange={(event) =>
                          updateDimension(activeDimensionIndex, {
                            scope: event.target.value as EvalJudgeDimension['scope'],
                          })
                        }
                      >
                        <option value="variant">Per pipeline (variant)</option>
                        <option value="pairwise">Pairwise compare</option>
                      </select>
                    </label>
                    <label className="form-field">
                      <span>Kind</span>
                      <select
                        value={activeDimension.kind}
                        onChange={(event) =>
                          updateDimension(activeDimensionIndex, {
                            kind: event.target.value as EvalJudgeDimension['kind'],
                          })
                        }
                      >
                        <option value="geval_score">Score (0–10, GEval)</option>
                        <option value="geval_winner">Winner (A/B/Tie)</option>
                      </select>
                    </label>
                    <label className="form-field">
                      <span>Weight</span>
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={activeDimension.weight}
                        onChange={(event) =>
                          updateDimension(activeDimensionIndex, { weight: Number(event.target.value) })
                        }
                        required
                      />
                    </label>
                    <label className="form-field form-field-wide">
                      <span>Criteria (GEval prompt)</span>
                      <textarea
                        rows={10}
                        className="judge-dimension-criteria"
                        value={activeDimension.criteria}
                        onChange={(event) =>
                          updateDimension(activeDimensionIndex, { criteria: event.target.value })
                        }
                        placeholder="Evaluation rubric for DeepEval GEval. Score dimensions should ask for an integer 0–10 with clear anchors at 0 and 10."
                        required
                      />
                    </label>
                    {form.dimensions.length > 1 ? (
                      <div className="form-field form-field-wide judge-dimension-remove-row">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => removeDimension(activeDimensionIndex)}
                        >
                          <Trash2 {...iconProps()} aria-hidden />
                          Remove this dimension
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {formError && <p className="error">{formError}</p>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setFormOpen(false)}
                  disabled={formBusy}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={formBusy}>
                  {formBusy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
