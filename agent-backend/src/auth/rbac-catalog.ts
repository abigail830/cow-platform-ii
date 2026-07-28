import type { AccessLevel, PermissionCategory } from '../db/schema.ts';

/** Admin feature resources — each generates read + write permission keys. */
export const ADMIN_RESOURCES = {
  MODELS: 'models',
  USERS: 'users',
  ROLES: 'roles',
  PERMISSIONS: 'permissions',
} as const;

export type AdminResource = (typeof ADMIN_RESOURCES)[keyof typeof ADMIN_RESOURCES];

type ResourceDefinition = {
  resource: AdminResource;
  label: string;
  description: string;
  routePatterns: string[];
  apiPatterns: string[];
};

const ADMIN_RESOURCE_DEFS: ResourceDefinition[] = [
  {
    resource: ADMIN_RESOURCES.MODELS,
    label: 'Model configuration',
    description: 'LLM provider connections and defaults.',
    routePatterns: ['/admin/models'],
    apiPatterns: ['/api/admin/models', '/api/admin/models/*'],
  },
  {
    resource: ADMIN_RESOURCES.USERS,
    label: 'Users',
    description: 'Local accounts and role assignment.',
    routePatterns: ['/admin/users'],
    apiPatterns: ['/api/admin/users', '/api/admin/users/*'],
  },
  {
    resource: ADMIN_RESOURCES.ROLES,
    label: 'Roles',
    description: 'Role bundles and permission grants.',
    routePatterns: ['/admin/roles'],
    apiPatterns: ['/api/admin/roles', '/api/admin/roles/*'],
  },
  {
    resource: ADMIN_RESOURCES.PERMISSIONS,
    label: 'Permissions',
    description: 'Permission registry and route/API patterns.',
    routePatterns: ['/admin/permissions'],
    apiPatterns: ['/api/admin/permissions', '/api/admin/permissions/*'],
  },
];

export type PermissionDefinition = {
  key: string;
  label: string;
  description: string;
  category: PermissionCategory;
  resource: string;
  access: AccessLevel;
  routePatterns: string[];
  apiPatterns: string[];
  isSystem: boolean;
};

function buildPermission(
  category: PermissionCategory,
  def: ResourceDefinition,
  access: AccessLevel,
): PermissionDefinition {
  const accessLabel = access === 'read' ? 'Read' : 'Write';
  return {
    key: `${category}:${def.resource}:${access}`,
    label: `${def.label} — ${accessLabel}`,
    description: `${accessLabel} access to ${def.description.charAt(0).toLowerCase()}${def.description.slice(1)}`,
    category,
    resource: def.resource,
    access,
    routePatterns: def.routePatterns,
    apiPatterns: def.apiPatterns,
    isSystem: true,
  };
}

export const PERMISSION_CATALOG: PermissionDefinition[] = ADMIN_RESOURCE_DEFS.flatMap((def) => [
  buildPermission('admin', def, 'read'),
  buildPermission('admin', def, 'write'),
]);

/** Keys superseded by granular read/write permissions. */
export const OBSOLETE_PERMISSION_KEYS = [
  'admin:all',
  'admin:models',
  'admin:users',
  'admin:roles',
  'admin:permissions',
] as const;

export function permissionKey(category: string, resource: string, access: AccessLevel): string {
  return `${category}:${resource}:${access}`;
}

export function accessFromPermissionKey(key: string): AccessLevel {
  return key.endsWith(':write') ? 'write' : 'read';
}

export type ResolvedPermissionGrant = {
  key: string;
  label: string;
  category: string;
  accessLevel: AccessLevel;
  routePatterns: string[];
  apiPatterns: string[];
};

export type UserAccessProfile = {
  roleKeys: string[];
  permissions: ResolvedPermissionGrant[];
  permissionKeys: Set<string>;
};

export function hasResourcePermission(
  keys: Set<string>,
  category: string,
  resource: string,
  required: AccessLevel,
): boolean {
  const writeKey = permissionKey(category, resource, 'write');
  const readKey = permissionKey(category, resource, 'read');
  if (keys.has(writeKey)) return true;
  if (required === 'read' && keys.has(readKey)) return true;
  return false;
}

export function hasPermissionKey(keys: Set<string>, key: string, required: AccessLevel): boolean {
  if (key.endsWith(':read') || key.endsWith(':write')) {
    if (required === 'read') {
      if (keys.has(key)) return true;
      if (key.endsWith(':read')) {
        return keys.has(key.replace(/:read$/, ':write'));
      }
    }
    return keys.has(key);
  }

  const parts = key.split(':');
  if (parts.length === 2) {
    return hasResourcePermission(keys, parts[0]!, parts[1]!, required);
  }
  return keys.has(key);
}

export function canSeeAdminNav(keys: Set<string>): boolean {
  return PERMISSION_CATALOG.some(
    (def) => def.category === 'admin' && hasResourcePermission(keys, 'admin', def.resource, 'read'),
  );
}
