import type { IngestWorkflowItemStatus, IngestWorkflowStatus } from '../../infrastructure/db/index.ts';

export function deriveWorkflowStatus(
  items: Array<{ status: IngestWorkflowItemStatus }>,
): IngestWorkflowStatus {
  if (items.length === 0) return 'failed';
  if (items.some((i) => i.status === 'pending_upload')) {
    const restRunning = items.some((i) => i.status === 'running' || i.status === 'uploaded');
    return restRunning ? 'running' : 'pending_upload';
  }
  if (items.some((i) => i.status === 'running' || i.status === 'uploaded')) return 'running';
  const allCancelled = items.every((i) => i.status === 'cancelled');
  if (allCancelled) return 'cancelled';
  const successes = items.filter((i) => i.status === 'completed').length;
  const failures = items.filter((i) => i.status === 'failed').length;
  if (successes > 0 && failures > 0) return 'partially_completed';
  if (failures === items.length) return 'failed';
  if (successes === items.length) return 'completed';
  if (items.some((i) => i.status === 'cancelled') && successes > 0) return 'partially_completed';
  if (items.some((i) => i.status === 'cancelled')) return 'cancelled';
  return 'running';
}
