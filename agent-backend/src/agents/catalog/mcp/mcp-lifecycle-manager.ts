import { connectMcpServer, type McpServerConnection } from '@flue/runtime';
import {
  resolveMcpFailureBackoffMs,
  resolveMcpHealthCheckIntervalMs,
  shouldAutoCloseOnIdle,
  type McpLifecycleMode,
} from './mcp-lifecycle.ts';

export type McpConnectFn = () => Promise<McpServerConnection>;

type ScopeRecord = {
  lifecycle: McpLifecycleMode;
  idleTimeoutMs: number;
  connect: McpConnectFn;
  connection?: McpServerConnection;
  connecting?: Promise<McpServerConnection>;
  lastUsedAt: number;
  inFlight: number;
  failedAt?: number;
  failedError?: string;
};

const scopes = new Map<string, ScopeRecord>();
let healthCheckTimer: ReturnType<typeof setInterval> | undefined;

function failureBackoffMs(): number {
  return resolveMcpFailureBackoffMs();
}

function touchScope(record: ScopeRecord): void {
  record.lastUsedAt = Date.now();
}

export class McpServerUnavailableError extends Error {
  readonly scopeKey: string;
  readonly retryAfterMs?: number;

  constructor(scopeKey: string, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'McpServerUnavailableError';
    this.scopeKey = scopeKey;
    this.retryAfterMs = retryAfterMs;
  }
}

function registerScope(
  scopeKey: string,
  connect: McpConnectFn,
  lifecycle: McpLifecycleMode,
  idleTimeoutMs: number,
): ScopeRecord {
  const existing = scopes.get(scopeKey);
  if (existing) {
    existing.connect = connect;
    existing.lifecycle = lifecycle;
    existing.idleTimeoutMs = idleTimeoutMs;
    return existing;
  }
  const record: ScopeRecord = {
    lifecycle,
    idleTimeoutMs,
    connect,
    lastUsedAt: Date.now(),
    inFlight: 0,
  };
  scopes.set(scopeKey, record);
  return record;
}

async function openConnection(record: ScopeRecord, scopeKey: string): Promise<McpServerConnection> {
  if (record.failedAt) {
    const elapsed = Date.now() - record.failedAt;
    if (elapsed < failureBackoffMs()) {
      throw new McpServerUnavailableError(
        scopeKey,
        `MCP server "${scopeKey}" is in failure backoff: ${record.failedError ?? 'recent connect failed'}`,
        failureBackoffMs() - elapsed,
      );
    }
    record.failedAt = undefined;
    record.failedError = undefined;
  }

  if (record.connection) {
    touchScope(record);
    return record.connection;
  }

  if (record.connecting) {
    return record.connecting;
  }

  record.connecting = record
    .connect()
    .then((connection) => {
      record.connection = connection;
      record.connecting = undefined;
      touchScope(record);
      return connection;
    })
    .catch((error) => {
      record.connecting = undefined;
      record.connection = undefined;
      record.failedAt = Date.now();
      record.failedError = error instanceof Error ? error.message : String(error);
      throw error;
    });

  return record.connecting;
}

export async function ensureMcpConnection(options: {
  scopeKey: string;
  connect: McpConnectFn;
  lifecycle: McpLifecycleMode;
  idleTimeoutMs: number;
}): Promise<McpServerConnection> {
  const record = registerScope(
    options.scopeKey,
    options.connect,
    options.lifecycle,
    options.idleTimeoutMs,
  );
  return openConnection(record, options.scopeKey);
}

export function trackMcpCallStart(scopeKey: string): void {
  const record = scopes.get(scopeKey);
  if (!record) return;
  record.inFlight += 1;
  touchScope(record);
}

export function trackMcpCallEnd(scopeKey: string): void {
  const record = scopes.get(scopeKey);
  if (!record) return;
  record.inFlight = Math.max(0, record.inFlight - 1);
  touchScope(record);
}

export async function closeMcpScope(scopeKey: string): Promise<void> {
  const record = scopes.get(scopeKey);
  if (!record) return;
  scopes.delete(scopeKey);
  record.connecting = undefined;
  if (record.connection) {
    await record.connection.close().catch(() => undefined);
    record.connection = undefined;
  }
}

export async function closeAllMcpConnections(): Promise<void> {
  const keys = [...scopes.keys()];
  await Promise.allSettled(keys.map((key) => closeMcpScope(key)));
}

export function resetMcpConnectionsForTests(): void {
  scopes.clear();
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = undefined;
  }
}

async function closeIdleConnections(): Promise<void> {
  const now = Date.now();
  const closers: Promise<void>[] = [];
  for (const [scopeKey, record] of scopes) {
    if (!shouldAutoCloseOnIdle(record.lifecycle, record.idleTimeoutMs)) continue;
    if (record.inFlight > 0) continue;
    if (!record.connection) continue;
    if (now - record.lastUsedAt <= record.idleTimeoutMs) continue;
    closers.push(closeMcpScope(scopeKey));
  }
  await Promise.allSettled(closers);
}

export function startMcpLifecycleHealthCheck(): () => void {
  if (healthCheckTimer) {
    return () => {
      if (healthCheckTimer) clearInterval(healthCheckTimer);
      healthCheckTimer = undefined;
    };
  }
  const intervalMs = resolveMcpHealthCheckIntervalMs();
  healthCheckTimer = setInterval(() => {
    void closeIdleConnections().catch((error) => {
      console.warn('[mcp] idle close failed:', error);
    });
  }, intervalMs);
  if (typeof healthCheckTimer.unref === 'function') {
    healthCheckTimer.unref();
  }
  return () => {
    if (healthCheckTimer) clearInterval(healthCheckTimer);
    healthCheckTimer = undefined;
  };
}

/** @deprecated Use ensureMcpConnection — kept for listPlatformMcpDiscoveredTools probe path. */
export { connectMcpServer };
