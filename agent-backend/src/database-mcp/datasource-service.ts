import { and, desc, eq } from 'drizzle-orm';
import { appUserDatasources, db } from '../db/index.ts';
import {
  decryptModelConfigApiKey,
  sealModelConfigApiKeyForStorage,
} from '../shared/model-config-secret.ts';
import {
  DEFAULT_MAX_ROWS,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  MAX_MAX_ROWS,
  type DatasourceType,
} from './constants.ts';
import { assertAllowedDatasourceHost } from './host-policy.ts';
import type { UserDatasource } from './types.ts';

function rowToDatasource(
  row: typeof appUserDatasources.$inferSelect,
  password: string,
): UserDatasource {
  return {
    id: row.id,
    createdBy: row.createdBy,
    name: row.name,
    displayTitle: row.displayTitle,
    type: row.type as DatasourceType,
    host: row.host,
    port: row.port,
    username: row.username,
    database: row.database,
    password,
    ssl: row.ssl,
    readonly: row.readonly,
    maxRows: row.maxRows,
    statementTimeoutMs: row.statementTimeoutMs,
  };
}

export async function getDatasourceForUser(
  datasourceId: string,
  userId: string,
): Promise<UserDatasource | null> {
  const [row] = await db
    .select()
    .from(appUserDatasources)
    .where(and(eq(appUserDatasources.id, datasourceId), eq(appUserDatasources.createdBy, userId)))
    .limit(1);
  if (!row) return null;
  const password = decryptModelConfigApiKey(row.passwordEncrypted);
  if (!password) return null;
  return rowToDatasource(row, password);
}

export async function listDatasourcesForUser(userId: string) {
  const rows = await db
    .select()
    .from(appUserDatasources)
    .where(eq(appUserDatasources.createdBy, userId))
    .orderBy(desc(appUserDatasources.updatedAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    displayTitle: row.displayTitle,
    type: row.type,
    host: row.host,
    port: row.port,
    username: row.username,
    database: row.database,
    ssl: row.ssl,
    readonly: row.readonly,
    maxRows: row.maxRows,
    statementTimeoutMs: row.statementTimeoutMs,
    updatedAt: row.updatedAt,
  }));
}

export type CreateDatasourceInput = {
  name: string;
  displayTitle?: string;
  type: DatasourceType;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
  readonly?: boolean;
  maxRows?: number;
  statementTimeoutMs?: number;
};

export async function createDatasourceForUser(userId: string, input: CreateDatasourceInput) {
  assertAllowedDatasourceHost(input.host);
  const sealed = sealModelConfigApiKeyForStorage(input.password);
  if (!sealed) throw new Error('password is required');
  const maxRows = Math.min(input.maxRows ?? DEFAULT_MAX_ROWS, MAX_MAX_ROWS);
  const [row] = await db
    .insert(appUserDatasources)
    .values({
      createdBy: userId,
      name: input.name,
      displayTitle: input.displayTitle,
      type: input.type,
      host: input.host.trim(),
      port: input.port,
      username: input.username,
      database: input.database,
      passwordEncrypted: sealed,
      ssl: input.ssl ?? false,
      readonly: input.readonly ?? true,
      maxRows,
      statementTimeoutMs: input.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS,
    })
    .returning();
  return row!;
}

export async function deleteDatasourceForUser(userId: string, datasourceId: string): Promise<boolean> {
  const deleted = await db
    .delete(appUserDatasources)
    .where(and(eq(appUserDatasources.id, datasourceId), eq(appUserDatasources.createdBy, userId)))
    .returning({ id: appUserDatasources.id });
  return deleted.length > 0;
}

export async function assertDatasourceIdsOwnedByUser(
  userId: string,
  datasourceIds: string[],
): Promise<void> {
  if (!datasourceIds.length) return;
  const unique = [...new Set(datasourceIds)];
  const rows = await db
    .select({ id: appUserDatasources.id })
    .from(appUserDatasources)
    .where(and(eq(appUserDatasources.createdBy, userId)));
  const owned = new Set(rows.map((r) => r.id));
  const illegal = unique.filter((id) => !owned.has(id));
  if (illegal.length) {
    throw new Error(`Unknown or inaccessible datasource ids: ${illegal.join(', ')}`);
  }
}
