import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { appConversations, appUsers, db } from '../db/index.ts';
import { getUser, requireAuth } from '../auth/jwt.ts';
import { canAccessAgent } from '../auth/permissions.ts';
import {
  canUseSessionExplorer,
  isPlatformAdmin,
} from '../auth/session-explorer-access.ts';
import { ensureFlueReady } from '../flue-vercel-init.ts';
import { getPlatformFlueStores } from '../flue/platform-flue-stores.ts';
import {
  countUserTurns,
  loadAgentConversationSnapshot,
} from '../flue/load-agent-conversation-snapshot.ts';
import {
  agentConversationStreamPath,
  toAgentInstanceId,
} from '../shared/agent-instance-id.ts';

const sessionExplorer = new Hono();

sessionExplorer.use('*', requireAuth);

function parseDateBoundary(value: string | undefined, endOfDay: boolean): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(`${value.trim()}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

async function requireSessionExplorerAccess(c: Context): Promise<Response | null> {
  const user = getUser(c);
  if (!(await canUseSessionExplorer(user))) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return null;
}

sessionExplorer.get('/sessions', async (c) => {
  const denied = await requireSessionExplorerAccess(c);
  if (denied) return denied;

  const user = getUser(c);
  const agentName = c.req.query('agent')?.trim();
  if (!agentName) return c.json({ error: 'agent is required' }, 400);
  if (!(await canAccessAgent(user, agentName))) return c.json({ error: 'Forbidden' }, 403);

  const from = parseDateBoundary(c.req.query('from'), false);
  const to = parseDateBoundary(c.req.query('to'), true);
  if (!from || !to) return c.json({ error: 'from and to are required (YYYY-MM-DD)' }, 400);
  if (from > to) return c.json({ error: 'from must be before to' }, 400);

  const sessionId = c.req.query('sessionId')?.trim();
  const keyword = c.req.query('keyword')?.trim();
  const limit = Math.min(Number(c.req.query('limit') ?? 100), 200);
  const includeStats = c.req.query('includeStats') !== 'false';

  const isAdmin = await isPlatformAdmin(user);

  const conditions = [
    eq(appConversations.agentName, agentName),
    gte(appConversations.updatedAt, from),
    lte(appConversations.updatedAt, to),
  ];

  if (!isAdmin) {
    conditions.push(eq(appConversations.userId, user.id));
  }

  if (sessionId) {
    conditions.push(eq(appConversations.id, sessionId));
  }

  if (keyword && isAdmin) {
    const pattern = `%${keyword}%`;
    conditions.push(
      or(ilike(appUsers.email, pattern), ilike(appUsers.displayName, pattern))!,
    );
  }

  const rows = await db
    .select({
      id: appConversations.id,
      title: appConversations.title,
      agentName: appConversations.agentName,
      userId: appConversations.userId,
      updatedAt: appConversations.updatedAt,
      createdAt: appConversations.createdAt,
      userEmail: appUsers.email,
      userDisplayName: appUsers.displayName,
    })
    .from(appConversations)
    .innerJoin(appUsers, eq(appConversations.userId, appUsers.id))
    .where(and(...conditions))
    .orderBy(desc(appConversations.updatedAt))
    .limit(limit);

  let flueReady = false;
  if (includeStats && rows.length > 0) {
    try {
      await ensureFlueReady();
      flueReady = true;
    } catch {
      flueReady = false;
    }
  }

  const { conversationStreamStore } = flueReady ? await getPlatformFlueStores() : { conversationStreamStore: null };

  const sessions = await Promise.all(
    rows.map(async (row) => {
      let turnCount = 0;

      if (includeStats && conversationStreamStore) {
        const streamPath = agentConversationStreamPath(
          row.agentName,
          toAgentInstanceId(row.userId, row.id),
        );
        const snapshot = await loadAgentConversationSnapshot(conversationStreamStore, streamPath);
        if (snapshot) {
          turnCount = countUserTurns(snapshot.messages);
        }
      }

      return {
        id: row.id,
        title: row.title,
        agentName: row.agentName,
        userId: row.userId,
        user: {
          id: row.userId,
          email: row.userEmail,
          displayName: row.userDisplayName,
        },
        turnCount,
        updatedAt: row.updatedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      };
    }),
  );

  return c.json({ sessions, isAdmin });
});

sessionExplorer.get('/sessions/:conversationId/messages', async (c) => {
  const denied = await requireSessionExplorerAccess(c);
  if (denied) return denied;

  const user = getUser(c);
  const conversationId = c.req.param('conversationId');

  const [row] = await db
    .select({
      id: appConversations.id,
      title: appConversations.title,
      agentName: appConversations.agentName,
      userId: appConversations.userId,
      updatedAt: appConversations.updatedAt,
      userEmail: appUsers.email,
      userDisplayName: appUsers.displayName,
    })
    .from(appConversations)
    .innerJoin(appUsers, eq(appConversations.userId, appUsers.id))
    .where(eq(appConversations.id, conversationId))
    .limit(1);

  if (!row) return c.json({ error: 'Not found' }, 404);

  const isAdmin = await isPlatformAdmin(user);
  if (!isAdmin && row.userId !== user.id) return c.json({ error: 'Forbidden' }, 403);
  if (!(await canAccessAgent(user, row.agentName))) return c.json({ error: 'Forbidden' }, 403);

  await ensureFlueReady();
  const { conversationStreamStore } = await getPlatformFlueStores();
  const streamPath = agentConversationStreamPath(
    row.agentName,
    toAgentInstanceId(row.userId, row.id),
  );
  const snapshot = await loadAgentConversationSnapshot(conversationStreamStore, streamPath);

  return c.json({
    session: {
      id: row.id,
      title: row.title,
      agentName: row.agentName,
      turnCount: snapshot ? countUserTurns(snapshot.messages) : 0,
      updatedAt: row.updatedAt.toISOString(),
      user: {
        id: row.userId,
        email: row.userEmail,
        displayName: row.userDisplayName,
      },
    },
    messages: snapshot?.messages ?? [],
  });
});

export default sessionExplorer;
