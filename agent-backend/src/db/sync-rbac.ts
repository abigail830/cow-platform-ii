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
  description: 'Access to Asset market, Agent playground, and Session explorer.',
  isSystem: true,
};

const KNOWLEDGE_MANAGER_ROLE = {
  key: 'knowledge-manager',
  label: 'Knowledge Manager',
  description: 'Manage documents, pipelines, and object storage; read model configuration.',
  isSystem: true,
};

/** Permission keys granted to each system role (admin gets the full catalog separately). */
const SYSTEM_ROLE_PERMISSION_KEYS: Record<string, readonly string[]> = {
  'agent-player': [
    'agent:asset-market:read',
    'agent:asset-market:write',
    'agent:playground',
    'agent:session-explorer',
  ],
  'knowledge-manager': [
    'knowledge-management:documents:read',
    'knowledge-management:documents:write',
    'knowledge-management:knowledge-bases:read',
    'knowledge-management:knowledge-bases:write',
    'platform-basic:pipelines:read',
    'platform-basic:pipelines:write',
    'platform-basic:storage:read',
    'platform-basic:storage:write',
    'platform-basic:models:read',
    'knowledge-management:hybrid-search',
  ],
};

async function upsertSystemRole(def: {
  key: string;
  label: string;
  description: string;
  isSystem: boolean;
}) {
  let [role] = await db.select().from(appRoles).where(eq(appRoles.key, def.key)).limit(1);
  if (role) {
    [role] = await db
      .update(appRoles)
      .set({
        label: def.label,
        description: def.description,
        isSystem: def.isSystem,
      })
      .where(eq(appRoles.id, role.id))
      .returning();
    return role;
  }

  [role] = await db.insert(appRoles).values(def).returning();
  console.log(`  created role: ${def.key}`);
  return role;
}

async function grantRolePermissionKeys(
  roleId: string,
  allowedKeys: Set<string>,
  permissions: Awaited<ReturnType<typeof upsertPermission>>[],
) {
  for (const permission of permissions) {
    if (!allowedKeys.has(permission.key)) continue;
    const accessLevel = accessFromPermissionKey(permission.key);
    await db
      .insert(appRolePermissions)
      .values({
        roleId,
        permissionId: permission.id,
        accessLevel,
      })
      .onConflictDoUpdate({
        target: [appRolePermissions.roleId, appRolePermissions.permissionId],
        set: { accessLevel },
      });
  }
}

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

async function migrateLegacyHybridSearchGrants(
  permissions: Awaited<ReturnType<typeof upsertPermission>>[],
) {
  const newPermission = permissions.find((row) => row.key === 'knowledge-management:hybrid-search');
  if (!newPermission) return;

  const legacyKeys = ['knowledge-management:hybrid-search:read', 'knowledge-management:hybrid-search:write'];
  const legacyPermissions = await db
    .select({ id: appPermissions.id })
    .from(appPermissions)
    .where(inArray(appPermissions.key, legacyKeys));

  for (const legacy of legacyPermissions) {
    const grants = await db
      .select({ roleId: appRolePermissions.roleId })
      .from(appRolePermissions)
      .where(eq(appRolePermissions.permissionId, legacy.id));

    for (const grant of grants) {
      await db
        .insert(appRolePermissions)
        .values({
          roleId: grant.roleId,
          permissionId: newPermission.id,
          accessLevel: 'read',
        })
        .onConflictDoNothing();
    }
  }
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

  const permissions = [];
  for (const def of PERMISSION_CATALOG) {
    permissions.push(await upsertPermission(def));
  }

  await migrateLegacyHybridSearchGrants(permissions);
  await removeObsoletePermissions();

  let adminRole = await upsertSystemRole(ADMIN_ROLE);
  const agentPlayerRole = await upsertSystemRole(AGENT_PLAYER_ROLE);
  const knowledgeManagerRole = await upsertSystemRole(KNOWLEDGE_MANAGER_ROLE);

  const allPermissionKeys = new Set(permissions.map((permission) => permission.key));
  await grantRolePermissionKeys(adminRole.id, allPermissionKeys, permissions);

  for (const [roleKey, permissionKeys] of Object.entries(SYSTEM_ROLE_PERMISSION_KEYS)) {
    const role =
      roleKey === 'agent-player'
        ? agentPlayerRole
        : roleKey === 'knowledge-manager'
          ? knowledgeManagerRole
          : null;
    if (!role) continue;
    await grantRolePermissionKeys(role.id, new Set(permissionKeys), permissions);
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
