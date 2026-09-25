import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { appUserNotifications, db } from '../infrastructure/db/index.ts';

export async function listUserNotifications(input: {
  userId: string;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<{
  items: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    body: string;
    actions: typeof appUserNotifications.$inferSelect.actions;
    metadata: Record<string, unknown> | null;
    read_at: string | null;
    created_at: string;
  }>;
  unread_count: number;
}> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 30));

  const conditions = [
    eq(appUserNotifications.userId, input.userId),
    isNull(appUserNotifications.dismissedAt),
  ];
  if (input.unreadOnly) {
    conditions.push(isNull(appUserNotifications.readAt));
  }

  const items = await db
    .select()
    .from(appUserNotifications)
    .where(and(...conditions))
    .orderBy(desc(appUserNotifications.createdAt))
    .limit(limit);

  const [unread] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appUserNotifications)
    .where(
      and(
        eq(appUserNotifications.userId, input.userId),
        isNull(appUserNotifications.readAt),
        isNull(appUserNotifications.dismissedAt),
      ),
    );

  return {
    items: items.map((row) => ({
      id: row.id,
      category: row.category,
      severity: row.severity,
      title: row.title,
      body: row.body,
      actions: row.actions,
      metadata: row.metadata ?? null,
      read_at: row.readAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
    })),
    unread_count: unread?.count ?? 0,
  };
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
  const [row] = await db
    .update(appUserNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(appUserNotifications.id, notificationId),
        eq(appUserNotifications.userId, userId),
      ),
    )
    .returning({ id: appUserNotifications.id });
  return Boolean(row);
}

export async function dismissNotification(userId: string, notificationId: string): Promise<boolean> {
  const [row] = await db
    .update(appUserNotifications)
    .set({ dismissedAt: new Date(), readAt: new Date() })
    .where(
      and(
        eq(appUserNotifications.id, notificationId),
        eq(appUserNotifications.userId, userId),
      ),
    )
    .returning({ id: appUserNotifications.id });
  return Boolean(row);
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const updated = await db
    .update(appUserNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(appUserNotifications.userId, userId),
        isNull(appUserNotifications.readAt),
        isNull(appUserNotifications.dismissedAt),
      ),
    )
    .returning({ id: appUserNotifications.id });
  return updated.length;
}
