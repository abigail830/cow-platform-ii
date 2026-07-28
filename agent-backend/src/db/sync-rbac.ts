import { eq, inArray } from 'drizzle-orm';
import {
  appPermissions,
  appRolePermissions,
  appRoles,
  appUserRoles,
  appUsers,
  db,
} from './index.ts';
import {
  OBSOLETE_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  accessFromPermissionKey,
} from '../auth/rbac-catalog.ts';

const ADMIN_ROLE = {
  key: 'admin',
  label: 'Administrator',
  description: 'Full access to all administration features.',
  isSystem: true,
};

async function upsertPermission(def: (typeof PERMISSION_CATALOG)[number]) {
  const existing = await db
    .select()
    .from(appPermissions)
    .where(eq(appPermissions.key, def.key))
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(appPermissions)
      .set({
        label: def.label,
        description: def.description,
        category: def.category,
        routePatterns: def.routePatterns,
        apiPatterns: def.apiPatterns,
        isSystem: def.isSystem,
        updatedAt: new Date(),
      })
      .where(eq(appPermissions.id, existing[0].id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(appPermissions)
    .values({
      key: def.key,
      label: def.label,
      description: def.description,
      category: def.category,
      routePatterns: def.routePatterns,
      apiPatterns: def.apiPatterns,
      isSystem: def.isSystem,
    })
    .returning();
  return row;
}

async function removeObsoletePermissions() {
  if (OBSOLETE_PERMISSION_KEYS.length === 0) return;

  const obsolete = await db
    .select({ id: appPermissions.id, key: appPermissions.key })
    .from(appPermissions)
    .where(inArray(appPermissions.key, [...OBSOLETE_PERMISSION_KEYS]));

  for (const perm of obsolete) {
    await db.delete(appRolePermissions).where(eq(appRolePermissions.permissionId, perm.id));
    await db.delete(appPermissions).where(eq(appPermissions.id, perm.id));
    console.log(`  removed obsolete permission: ${perm.key}`);
  }
}

/**
 * Sync RBAC reference data from `rbac-catalog.ts` into the database.
 * Idempotent — safe to run after every migration or user seed.
 */
export async function syncRbac(): Promise<{ permissionCount: number }> {
  console.log('Syncing RBAC catalog…');
  await removeObsoletePermissions();

  const permissions = [];
  for (const def of PERMISSION_CATALOG) {
    permissions.push(await upsertPermission(def));
  }

  let [role] = await db.select().from(appRoles).where(eq(appRoles.key, ADMIN_ROLE.key)).limit(1);
  if (!role) {
    [role] = await db.insert(appRoles).values(ADMIN_ROLE).returning();
    console.log(`  created role: ${ADMIN_ROLE.key}`);
  }

  await db.delete(appRolePermissions).where(eq(appRolePermissions.roleId, role.id));
  for (const permission of permissions) {
    await db.insert(appRolePermissions).values({
      roleId: role.id,
      permissionId: permission.id,
      accessLevel: accessFromPermissionKey(permission.key),
    });
  }

  const legacyAdmins = await db
    .select()
    .from(appUsers)
    .where(inArray(appUsers.role, ['admin', 'operator']));

  for (const user of legacyAdmins) {
    await db
      .insert(appUserRoles)
      .values({ userId: user.id, roleId: role.id })
      .onConflictDoNothing();
  }

  console.log(`  RBAC sync complete (${permissions.length} permissions, admin role granted to ${legacyAdmins.length} legacy admin(s)).`);
  return { permissionCount: permissions.length };
}
