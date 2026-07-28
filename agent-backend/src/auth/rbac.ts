import { eq, inArray } from 'drizzle-orm';
import {
  appPermissions,
  appRolePermissions,
  appRoles,
  appUserRoles,
  appUsers,
  db,
  type AccessLevel,
} from '../db/index.ts';
import {
  accessFromPermissionKey,
  ADMIN_RESOURCES,
  canSeeAdminNav,
  hasPermissionKey,
  hasResourcePermission,
  type ResolvedPermissionGrant,
  type UserAccessProfile,
} from './rbac-catalog.ts';

export type { ResolvedPermissionGrant, UserAccessProfile };

export async function loadUserAccessProfile(userId: string): Promise<UserAccessProfile> {
  const userRoleRows = await db
    .select({ roleKey: appRoles.key })
    .from(appUserRoles)
    .innerJoin(appRoles, eq(appUserRoles.roleId, appRoles.id))
    .where(eq(appUserRoles.userId, userId));

  const roleKeys = userRoleRows.map((row) => row.roleKey);

  if (roleKeys.length === 0) {
    return { roleKeys: [], permissions: [], permissionKeys: new Set() };
  }

  const roleIds = await db
    .select({ id: appRoles.id })
    .from(appRoles)
    .where(inArray(appRoles.key, roleKeys));

  const grants = await db
    .select({
      key: appPermissions.key,
      label: appPermissions.label,
      category: appPermissions.category,
      routePatterns: appPermissions.routePatterns,
      apiPatterns: appPermissions.apiPatterns,
    })
    .from(appRolePermissions)
    .innerJoin(appPermissions, eq(appRolePermissions.permissionId, appPermissions.id))
    .where(
      inArray(
        appRolePermissions.roleId,
        roleIds.map((row) => row.id),
      ),
    );

  const permissionKeys = new Set<string>();
  const byKey = new Map<string, ResolvedPermissionGrant>();

  for (const grant of grants) {
    permissionKeys.add(grant.key);
    byKey.set(grant.key, {
      key: grant.key,
      label: grant.label,
      category: grant.category,
      accessLevel: accessFromPermissionKey(grant.key),
      routePatterns: grant.routePatterns ?? [],
      apiPatterns: grant.apiPatterns ?? [],
    });
  }

  return {
    roleKeys,
    permissions: [...byKey.values()],
    permissionKeys,
  };
}

export async function userHasResourcePermission(
  userId: string,
  category: string,
  resource: string,
  required: AccessLevel,
): Promise<boolean> {
  const profile = await loadUserAccessProfile(userId);
  if (profile.permissionKeys.size > 0) {
    return hasResourcePermission(profile.permissionKeys, category, resource, required);
  }

  const [user] = await db.select({ role: appUsers.role }).from(appUsers).where(eq(appUsers.id, userId)).limit(1);
  return user?.role === 'admin' || user?.role === 'operator';
}

export async function userHasPermission(
  userId: string,
  permissionKey: string,
  required: AccessLevel,
): Promise<boolean> {
  const profile = await loadUserAccessProfile(userId);
  if (profile.permissionKeys.size > 0) {
    return hasPermissionKey(profile.permissionKeys, permissionKey, required);
  }

  const [user] = await db.select({ role: appUsers.role }).from(appUsers).where(eq(appUsers.id, userId)).limit(1);
  return user?.role === 'admin' || user?.role === 'operator';
}

export async function userCanSeeAdmin(userId: string): Promise<boolean> {
  const profile = await loadUserAccessProfile(userId);
  if (profile.permissionKeys.size > 0) {
    return canSeeAdminNav(profile.permissionKeys);
  }
  const [user] = await db.select({ role: appUsers.role }).from(appUsers).where(eq(appUsers.id, userId)).limit(1);
  return user?.role === 'admin' || user?.role === 'operator';
}

export { hasPermissionKey, hasResourcePermission, canSeeAdminNav, ADMIN_RESOURCES };
