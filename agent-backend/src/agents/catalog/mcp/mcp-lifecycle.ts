import type { McpServerYaml } from '../schema.ts';

export type McpLifecycleMode = 'lazy' | 'eager' | 'keep-alive';

const DEFAULT_LIFECYCLE: McpLifecycleMode = 'lazy';
const DEFAULT_IDLE_TIMEOUT_MS = 300_000;
const DEFAULT_FAILURE_BACKOFF_MS = 60_000;
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;

export function resolveMcpLifecycle(server: Pick<McpServerYaml, 'lifecycle'>): McpLifecycleMode {
  const fromYaml = server.lifecycle?.trim();
  if (fromYaml === 'lazy' || fromYaml === 'eager' || fromYaml === 'keep-alive') {
    return fromYaml;
  }
  const fromEnv = process.env.MCP_DEFAULT_LIFECYCLE?.trim();
  if (fromEnv === 'lazy' || fromEnv === 'eager' || fromEnv === 'keep-alive') {
    return fromEnv;
  }
  return DEFAULT_LIFECYCLE;
}

export function resolveMcpIdleTimeoutMs(server: Pick<McpServerYaml, 'idleTimeoutMs'>): number {
  if (server.idleTimeoutMs !== undefined) return server.idleTimeoutMs;
  const fromEnv = Number(process.env.MCP_DEFAULT_IDLE_TIMEOUT_MS?.trim());
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return Math.floor(fromEnv);
  return DEFAULT_IDLE_TIMEOUT_MS;
}

export function resolveMcpFailureBackoffMs(): number {
  const fromEnv = Number(process.env.MCP_FAILURE_BACKOFF_MS?.trim());
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return Math.floor(fromEnv);
  return DEFAULT_FAILURE_BACKOFF_MS;
}

export function resolveMcpHealthCheckIntervalMs(): number {
  const fromEnv = Number(process.env.MCP_HEALTH_CHECK_INTERVAL_MS?.trim());
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
  return DEFAULT_HEALTH_CHECK_INTERVAL_MS;
}

export function buildMcpScopeKey(parts: {
  agentId: string;
  userId?: string;
  serverName: string;
  suffix?: string;
}): string {
  const user = parts.userId?.trim() || 'anon';
  const suffix = parts.suffix?.trim();
  return suffix
    ? `${parts.agentId}::${user}::${parts.serverName}::${suffix}`
    : `${parts.agentId}::${user}::${parts.serverName}`;
}

export function isLazyLifecycle(mode: McpLifecycleMode): boolean {
  return mode === 'lazy';
}

/** keep-alive is not implemented in v1; treat as eager connect without idle close. */
export function shouldConnectAtAgentInit(mode: McpLifecycleMode): boolean {
  return mode === 'eager' || mode === 'keep-alive';
}

export function shouldAutoCloseOnIdle(mode: McpLifecycleMode, idleTimeoutMs: number): boolean {
  return mode === 'lazy' && idleTimeoutMs > 0;
}
