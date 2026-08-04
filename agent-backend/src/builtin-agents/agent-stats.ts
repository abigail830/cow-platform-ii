import { and, eq, gte, sql } from 'drizzle-orm';
import { appBuiltinAgentDefs, appSyncAgentRuns, db } from '../db/index.ts';

export type BuiltinAgentUsageStats = {
  total_runs: number;
  days: number;
  trend: Array<{ date: string; count: number }>;
};

function parseDays(value: string | undefined): number {
  const parsed = Number(value ?? 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(90, Math.max(7, Math.floor(parsed)));
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
