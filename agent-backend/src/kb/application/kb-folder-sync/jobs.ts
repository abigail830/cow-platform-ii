import { and, desc, eq, sql } from 'drizzle-orm';
import { appKbImportJobs, db } from '../../../infrastructure/db/index.ts';
import { toKbImportJobPublic } from '../knowledge-bases.ts';

export async function listKbFolderSyncJobs(
  knowledgeBaseId: string,
  limit = 30,
): Promise<ReturnType<typeof toKbImportJobPublic>[]> {
  const capped = Math.min(100, Math.max(1, limit));
  const rows = await db
    .select()
    .from(appKbImportJobs)
    .where(
      and(
        eq(appKbImportJobs.knowledgeBaseId, knowledgeBaseId),
        sql`coalesce((${appKbImportJobs.metrics}->>'folder_sync')::boolean, false) = true`,
      ),
    )
    .orderBy(desc(appKbImportJobs.createdAt))
    .limit(capped);
  return rows.map(toKbImportJobPublic);
}
