/** Tracks live UI interest in a Flue agent instance (SSE subscription or recent HTTP activity). */

const DEFAULT_ACTIVITY_TTL_MS = 2 * 60 * 1000;
const POST_ACTIVITY_EXTEND_MS = 10 * 60 * 1000;

type ActivityOptions = {
  extendMs?: number;
};

export class AgentInstanceStreamRegistry {
  private readonly subscribers = new Map<string, number>();
  private readonly lastActivityAt = new Map<string, number>();

  addSubscriber(instanceId: string): void {
    const id = instanceId.trim();
    if (!id) return;
    this.subscribers.set(id, (this.subscribers.get(id) ?? 0) + 1);
    this.touchActivity(id, { extendMs: POST_ACTIVITY_EXTEND_MS });
  }

  removeSubscriber(instanceId: string): void {
    const id = instanceId.trim();
    if (!id) return;
    const count = this.subscribers.get(id) ?? 0;
    if (count <= 1) this.subscribers.delete(id);
    else this.subscribers.set(id, count - 1);
  }

  touchActivity(instanceId: string, options?: ActivityOptions): void {
    const id = instanceId.trim();
    if (!id) return;
    const extendMs = options?.extendMs ?? DEFAULT_ACTIVITY_TTL_MS;
    const now = Date.now();
    const previous = this.lastActivityAt.get(id) ?? 0;
    this.lastActivityAt.set(id, Math.max(now, previous + extendMs - DEFAULT_ACTIVITY_TTL_MS));
  }

  hasSubscriber(instanceId: string): boolean {
    return (this.subscribers.get(instanceId.trim()) ?? 0) > 0;
  }

  isActive(instanceId: string, now = Date.now()): boolean {
    const id = instanceId.trim();
    if (!id) return false;
    if (this.hasSubscriber(id)) return true;
    const last = this.lastActivityAt.get(id);
    if (last === undefined) return false;
    return now - last <= DEFAULT_ACTIVITY_TTL_MS;
  }

  resetForTests(): void {
    this.subscribers.clear();
    this.lastActivityAt.clear();
  }
}

export const agentInstanceStreamRegistry = new AgentInstanceStreamRegistry();

/** Submissions younger than this are retained on cold start even without an active client. */
export const SUBMISSION_RECENT_MS = 30 * 60 * 1000;

export function shouldRetainSubmissionOnStartup(
  instanceId: string,
  acceptedAt: number,
  now = Date.now(),
): boolean {
  if (agentInstanceStreamRegistry.isActive(instanceId, now)) return true;
  return now - acceptedAt <= SUBMISSION_RECENT_MS;
}
