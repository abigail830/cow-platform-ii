import { asc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  appPermissions,
  appRolePermissions,
  appRoles,
  db,
} from '../../db/index.ts';
import { accessFromPermissionKey, ADMIN_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';

const roles = new Hono();

roles.use('*', requireAuth);

roles.get('/', requireResourcePermission('admin', ADMIN_RESOURCES.ROLES, 'read'), async (c) => {
  const rows = await db.select().from(appRoles).orderBy(asc(appRoles.label));
  return c.json({ roles: rows });
});

roles.get('/:id', requireResourcePermission('admin', ADMIN_RESOURCES.ROLES, 'read'), async (c) => {
  const id = c.req.param('id');
  const [role] = await db.select().from(appRoles).where(eq(appRoles.id, id)).limit(1);
  if (!role) return c.json({ error: 'Not found' }, 404);

  const grants = await db
    .select({
      permissionId: appPermissions.id,
      key: appPermissions.key,
      label: appPermissions.label,
      category: appPermissions.category,
      accessLevel: appRolePermissions.accessLevel,
    })
    .from(appRolePermissions)
    .innerJoin(appPermissions, eq(appRolePermissions.permissionId, appPermissions.id))
    .where(eq(appRolePermissions.roleId, role.id));

  return c.json({ role, permissions: grants });
});

roles.patch('/:id/permissions', requireResourcePermission('admin', ADMIN_RESOURCES.ROLES, 'write'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    permissionIds?: string[];
    grants?: Array<{ permissionId: string; accessLevel: 'read' | 'write' }>;
  }>();

  const [role] = await db.select().from(appRoles).where(eq(appRoles.id, id)).limit(1);
  if (!role) return c.json({ error: 'Not found' }, 404);
  if (role.isSystem && role.key === 'admin') {
    return c.json({ error: 'The system admin role cannot be modified' }, 400);
  }

  let grants = body.grants ?? [];
  if (body.permissionIds) {
    const permissionRows =
      body.permissionIds.length > 0
        ? await db
            .select({ id: appPermissions.id, key: appPermissions.key })
            .from(appPermissions)
            .where(inArray(appPermissions.id, body.permissionIds))
        : [];
    grants = permissionRows.map((row) => ({
      permissionId: row.id,
      accessLevel: accessFromPermissionKey(row.key),
    }));
  }

  await db.delete(appRolePermissions).where(eq(appRolePermissions.roleId, role.id));

  if (grants.length > 0) {
    await db.insert(appRolePermissions).values(
      grants.map((grant) => ({
        roleId: role.id,
        permissionId: grant.permissionId,
        accessLevel: grant.accessLevel,
      })),
    );
  }

  return c.json({ ok: true });
});

export default roles;
