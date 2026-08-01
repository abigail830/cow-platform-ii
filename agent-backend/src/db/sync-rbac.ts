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

const AGENT_PLAYER_ROLE = {
  key: 'agent-player',
  label: 'Agent player',
  description: 'Access to Agent playground and Session explorer only.',
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
  const keys = [...OBSOLETE_PERMISSION_KEYS];
  if (keys.length === 0) return;

  const obsolete = await db
    .select({ id: appPermissions.id, key: appPermissions.key })
    .from(appPermissions)
    .where(inArray(appPermissions.key, keys));

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

  let [adminRole] = await db.select().from(appRoles).where(eq(appRoles.key, ADMIN_ROLE.key)).limit(1);
  if (!adminRole) {
    [adminRole] = await db.insert(appRoles).values(ADMIN_ROLE).returning();
    console.log(`  created role: ${ADMIN_ROLE.key}`);
  }

  let [agentPlayerRole] = await db
    .select()
    .from(appRoles)
    .where(eq(appRoles.key, AGENT_PLAYER_ROLE.key))
    .limit(1);
  if (!agentPlayerRole) {
    [agentPlayerRole] = await db.insert(appRoles).values(AGENT_PLAYER_ROLE).returning();
    console.log(`  created role: ${AGENT_PLAYER_ROLE.key}`);
  }

  for (const permission of permissions) {
    const accessLevel = accessFromPermissionKey(permission.key);
    await db
      .insert(appRolePermissions)
      .values({
        roleId: adminRole.id,
        permissionId: permission.id,
        accessLevel,
      })
      .onConflictDoUpdate({
        target: [appRolePermissions.roleId, appRolePermissions.permissionId],
        set: { accessLevel },
      });
  }

  const legacyAdmins = await db
    .select()
    .from(appUsers)
    .where(inArray(appUsers.role, ['admin', 'operator']));

  for (const user of legacyAdmins) {
    await db
      .insert(appUserRoles)
      .values({ userId: user.id, roleId: adminRole.id })
      .onConflictDoNothing();
  }

  console.log(`  RBAC sync complete (${permissions.length} permissions, admin role granted to ${legacyAdmins.length} legacy admin(s)).`);
  return { permissionCount: permissions.length };
}
