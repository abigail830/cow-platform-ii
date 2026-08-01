import { eq } from 'drizzle-orm';
import { appE2bSessions, db } from '../db/index.ts';

export async function loadE2bSandboxId(instanceId: string): Promise<string | null> {
  const rows = await db
    .select({ sandboxId: appE2bSessions.sandboxId })
    .from(appE2bSessions)
    .where(eq(appE2bSessions.instanceId, instanceId))
    .limit(1);
  return rows[0]?.sandboxId ?? null;
}

export async function saveE2bSandboxId(
  instanceId: string,
  sandboxId: string,
  agentName?: string,
): Promise<void> {
  const now = new Date();
  await db
    .insert(appE2bSessions)
    .values({
      instanceId,
      sandboxId,
      agentName: agentName ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: appE2bSessions.instanceId,
      set: {
        sandboxId,
        agentName: agentName ?? null,
        updatedAt: now,
      },
    });
}

export async function clearE2bSandboxId(instanceId: string): Promise<void> {
  await db.delete(appE2bSessions).where(eq(appE2bSessions.instanceId, instanceId));
}
