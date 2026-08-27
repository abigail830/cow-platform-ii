import { useState } from 'react';
import type { EvalDataset } from '../api/evaluation/datasets.ts';
import type { EvalRunProcessingOption, EvalRunMode } from '../api/evaluation/runs.ts';

type EvalRunCreateModalProps = {
  datasets: EvalDataset[];
  pipelines: EvalRunProcessingOption[];
  onCancel: () => void;
  onCreate: (input: {
    name: string;
    description: string;
    datasetId: string;
    pipelineConfigIds: string[];
    runMode: EvalRunMode;
  }) => Promise<void>;
};

export function EvalRunCreateModal({
  datasets,
  pipelines,
  onCancel,
  onCreate,
}: EvalRunCreateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? '');
  const [selectedPipelineIds, setSelectedPipelineIds] = useState<string[]>([]);
  const [runMode, setRunMode] = useState<EvalRunMode>('full');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function togglePipeline(id: string) {
    setSelectedPipelineIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !datasetId || selectedPipelineIds.length === 0) return;
    setBusy(true);
    setError('');
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        datasetId,
        pipelineConfigIds: selectedPipelineIds,
        runMode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create run');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(name.trim() && datasetId && selectedPipelineIds.length > 0);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card model-config-form eval-run-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eval-run-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="eval-run-create-title">New evaluation run</h2>
        <p className="admin-form-hint">
          Pick an audio dataset and two or more ASR pipelines to transcribe the same files for side-by-side
          comparison.
        </p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field form-field-wide">
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={256}
                disabled={busy}
                autoFocus
              />
            </label>
            <label className="form-field form-field-wide">
              <span>Description</span>
              <textarea
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="form-field form-field-wide">
              <span>Dataset</span>
              <select
                value={datasetId}
                onChange={(event) => setDatasetId(event.target.value)}
                disabled={busy || datasets.length === 0}
              >
                {datasets.length === 0 ? <option value="">No audio datasets</option> : null}
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name} · {dataset.item_count} file{dataset.item_count === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-field form-field-wide">
              <span>Pipelines to compare</span>
              {pipelines.length === 0 ? (
                <p className="admin-muted">No enabled async transcription pipelines found.</p>
              ) : (
                <div className="eval-run-pipeline-list">
                  {pipelines.map((pipeline) => (
                    <label key={pipeline.id} className="form-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedPipelineIds.includes(pipeline.id)}
                        onChange={() => togglePipeline(pipeline.id)}
                        disabled={busy}
                      />
                      <span>
                        {pipeline.name}{' '}
                        <span className="admin-muted">({pipeline.pipeline_name})</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="form-field form-field-wide">
              <span>Default run mode</span>
              <p className="admin-form-hint eval-run-mode-hint">
                Saved on the run as the default. You can start or restart in either mode from the run detail page.
              </p>
              <div className="eval-run-mode-options">
                <label className="form-radio">
                  <input
                    type="radio"
                    name="eval-run-mode"
                    value="pipeline_only"
                    checked={runMode === 'pipeline_only'}
                    onChange={() => setRunMode('pipeline_only')}
                    disabled={busy}
                  />
                  <span>
                    Pipeline only{' '}
                    <span className="admin-muted">— stop after transcription finishes</span>
                  </span>
                </label>
                <label className="form-radio">
                  <input
                    type="radio"
                    name="eval-run-mode"
                    value="full"
                    checked={runMode === 'full'}
                    onChange={() => setRunMode('full')}
                    disabled={busy}
                  />
                  <span>
                    Full{' '}
                    <span className="admin-muted">— auto-compare all files before marking complete</span>
                  </span>
                </label>
              </div>
            </div>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !canSubmit}>
              {busy ? 'Creating…' : 'Create run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
