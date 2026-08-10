import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { Hono } from 'hono';
import { appRoles, appUserRoles, appUsers, db } from '../../db/index.ts';
import { ADMIN_RESOURCES } from '../../auth/rbac-catalog.ts';
import { getUser, requireAuth } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { routeParam } from '../../http/route-param.ts';

const users = new Hono();

users.use('*', requireAuth);

users.get('/', requireResourcePermission('admin', ADMIN_RESOURCES.USERS, 'read'), async (c) => {
  const search = c.req.query('search')?.trim();

  const conditions = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(ilike(appUsers.email, pattern), ilike(appUsers.displayName, pattern))!);
  }

  const rows = await db
    .select()
    .from(appUsers)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(appUsers.email));

  const userIds = rows.map((row) => row.id);
  const roleRows =
    userIds.length === 0
      ? []
      : await db
          .select({
            userId: appUserRoles.userId,
            roleId: appRoles.id,
            roleKey: appRoles.key,
            roleLabel: appRoles.label,
          })
          .from(appUserRoles)
          .innerJoin(appRoles, eq(appUserRoles.roleId, appRoles.id))
          .where(inArray(appUserRoles.userId, userIds));

  const rolesByUser = new Map<string, Array<{ id: string; key: string; label: string }>>();
  for (const row of roleRows) {
    const list = rolesByUser.get(row.userId) ?? [];
    list.push({ id: row.roleId, key: row.roleKey, label: row.roleLabel });
    rolesByUser.set(row.userId, list);
  }

  return c.json({
    users: rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      legacyRole: row.role,
      roles: rolesByUser.get(row.id) ?? [],
      createdAt: row.createdAt,
    })),
  });
});

users.post('/', requireResourcePermission('admin', ADMIN_RESOURCES.USERS, 'write'), async (c) => {
  const body = await c.req.json<{
    email?: string;
    displayName?: string;
    password?: string;
    roleIds?: string[];
  }>();

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const displayName = body.displayName?.trim() || null;
  const roleIds = body.roleIds ?? [];

  if (!email || !password) return c.json({ error: 'email and password are required' }, 400);
  if (password.length < 6) return c.json({ error: 'password must be at least 6 characters' }, 400);

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(appUsers)
    .values({
      email,
      displayName,
      passwordHash,
      role: 'user',
    })
    .returning();

  if (roleIds.length > 0) {
    await db.insert(appUserRoles).values(roleIds.map((roleId) => ({ userId: user.id, roleId })));
  }

  return c.json({ user: { id: user.id, email: user.email, displayName: user.displayName } }, 201);
});

users.patch('/:id/roles', requireResourcePermission('admin', ADMIN_RESOURCES.USERS, 'write'), async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json<{ roleIds?: string[] }>();
  const roleIds = body.roleIds ?? [];

  const [existing] = await db.select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const currentUser = getUser(c);
  if (existing.id === currentUser.id && roleIds.length === 0) {
    return c.json({ error: 'Cannot remove all roles from your own account' }, 400);
  }

  await db.delete(appUserRoles).where(eq(appUserRoles.userId, id));
  if (roleIds.length > 0) {
    await db.insert(appUserRoles).values(roleIds.map((roleId) => ({ userId: id, roleId })));
  }

  let legacyRole: 'admin' | 'user' = 'user';
  if (roleIds.length > 0) {
    const assignedRoles = await db
      .select({ key: appRoles.key })
      .from(appRoles)
      .where(inArray(appRoles.id, roleIds));
    if (assignedRoles.some((role) => role.key === 'admin')) {
      legacyRole = 'admin';
    }
  }
  await db
    .update(appUsers)
    .set({ role: legacyRole })
    .where(eq(appUsers.id, id));

  return c.json({ ok: true });
});

users.delete('/:id', requireResourcePermission('admin', ADMIN_RESOURCES.USERS, 'write'), async (c) => {
  const id = routeParam(c, 'id');
  if (!id) return c.json({ error: 'Not found' }, 404);
  const currentUser = getUser(c);
  if (id === currentUser.id) return c.json({ error: 'Cannot delete your own account' }, 400);

  const [row] = await db.delete(appUsers).where(eq(appUsers.id, id)).returning({ id: appUsers.id });
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

export default users;
