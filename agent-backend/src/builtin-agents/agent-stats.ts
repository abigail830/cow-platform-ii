import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  appBuiltinAgentDefs,
  appSyncAgentMessages,
  appSyncAgentRuns,
  db,
} from '../db/index.ts';

export type BuiltinAgentUsageStats = {
  total_runs: number;
  days: number;
  trend: Array<{ date: string; count: number }>;
};

export type BuiltinAgentRunMessage = {
  role: string;
  content: string;
};

export type BuiltinAgentRunListItem = {
  id: string;
  created_at: string;
  workflow_key: string;
  agent_name: string | null;
  trigger_type: string;
  status: string;
  latency_ms: number | null;
  error_message: string | null;
  input_summary: string | null;
  messages: BuiltinAgentRunMessage[];
};

export function parseBuiltinAgentStatsDays(value: string | undefined): number {
  const parsed = Number(value ?? 7);
  if (!Number.isFinite(parsed) || parsed <= 7) return 7;
  return 30;
}

function parseDays(value: string | undefined): number {
  return parseBuiltinAgentStatsDays(value);
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDateRange(days: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - offset);
    keys.push(utcDateKey(d));
  }
  return keys;
}

export async function getBuiltinAgentUsageStats(
  agentId: string,
  daysInput?: string,
): Promise<BuiltinAgentUsageStats | null> {
  const [agent] = await db
    .select({ id: appBuiltinAgentDefs.id })
    .from(appBuiltinAgentDefs)
    .where(eq(appBuiltinAgentDefs.id, agentId))
    .limit(1);
  if (!agent) return null;

  return queryUsageStats(daysInput, eq(appSyncAgentRuns.builtinAgentDefId, agentId));
}

export async function getAllBuiltinAgentsUsageStats(
  daysInput?: string,
): Promise<BuiltinAgentUsageStats> {
  return queryUsageStats(daysInput);
}

async function queryUsageStats(
  daysInput: string | undefined,
  runFilter?: ReturnType<typeof eq>,
): Promise<BuiltinAgentUsageStats> {
  const days = parseDays(daysInput);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const totalWhere = runFilter ? runFilter : undefined;

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appSyncAgentRuns)
    .where(totalWhere);

  const trendWhere = runFilter
    ? and(runFilter, gte(appSyncAgentRuns.createdAt, since))
    : gte(appSyncAgentRuns.createdAt, since);

  const dailyRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${appSyncAgentRuns.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(appSyncAgentRuns)
    .where(trendWhere)
    .groupBy(sql`date_trunc('day', ${appSyncAgentRuns.createdAt} at time zone 'UTC')`)
    .orderBy(sql`date_trunc('day', ${appSyncAgentRuns.createdAt} at time zone 'UTC')`);

  const countByDay = new Map(dailyRows.map((row) => [row.day, row.count]));
  const trend = buildDateRange(days).map((date) => ({
    date,
    count: countByDay.get(date) ?? 0,
  }));

  return {
    total_runs: totalRow?.count ?? 0,
    days,
    trend,
  };
}

function sinceDateForDays(days: number): Date {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

export async function listBuiltinAgentRuns(input: {
  agentId?: string;
  daysInput?: string;
  limit?: number;
}): Promise<BuiltinAgentRunListItem[]> {
  const days = parseDays(input.daysInput);
  const since = sinceDateForDays(days);
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));

  const conditions = [gte(appSyncAgentRuns.createdAt, since)];
  if (input.agentId?.trim()) {
    conditions.push(eq(appSyncAgentRuns.builtinAgentDefId, input.agentId.trim()));
  }

  const runRows = await db
    .select({
      id: appSyncAgentRuns.id,
      createdAt: appSyncAgentRuns.createdAt,
      workflowKey: appSyncAgentRuns.workflowKey,
      agentName: appBuiltinAgentDefs.name,
      triggerType: appSyncAgentRuns.triggerType,
      status: appSyncAgentRuns.status,
      latencyMs: appSyncAgentRuns.latencyMs,
      errorMessage: appSyncAgentRuns.errorMessage,
      inputSummary: appSyncAgentRuns.inputSummary,
    })
    .from(appSyncAgentRuns)
    .leftJoin(appBuiltinAgentDefs, eq(appSyncAgentRuns.builtinAgentDefId, appBuiltinAgentDefs.id))
    .where(and(...conditions))
    .orderBy(desc(appSyncAgentRuns.createdAt))
    .limit(limit);

  if (runRows.length === 0) return [];

  const runIds = runRows.map((row) => row.id);
  const messageRows = await db
    .select({
      runId: appSyncAgentMessages.runId,
      role: appSyncAgentMessages.role,
      content: appSyncAgentMessages.content,
      createdAt: appSyncAgentMessages.createdAt,
    })
    .from(appSyncAgentMessages)
    .where(inArray(appSyncAgentMessages.runId, runIds))
    .orderBy(asc(appSyncAgentMessages.createdAt));

  const messagesByRun = new Map<string, BuiltinAgentRunMessage[]>();
  for (const message of messageRows) {
    const list = messagesByRun.get(message.runId) ?? [];
    list.push({ role: message.role, content: message.content });
    messagesByRun.set(message.runId, list);
  }

  return runRows.map((row) => ({
    id: row.id,
    created_at: row.createdAt.toISOString(),
    workflow_key: row.workflowKey,
    agent_name: row.agentName ?? null,
    trigger_type: row.triggerType,
    status: row.status,
    latency_ms: row.latencyMs,
    error_message: row.errorMessage,
    input_summary: row.inputSummary,
    messages: messagesByRun.get(row.id) ?? [],
  }));
}
