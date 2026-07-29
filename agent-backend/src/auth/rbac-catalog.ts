import type { AccessLevel, PermissionCategory } from '../db/schema.ts';

export const PLATFORM_BASIC_CATEGORY = 'platform-basic' as const;

export const PLATFORM_BASIC_RESOURCES = {
  MODELS: 'models',
  STORAGE: 'storage',
} as const;

export type PlatformBasicResource = (typeof PLATFORM_BASIC_RESOURCES)[keyof typeof PLATFORM_BASIC_RESOURCES];

export const ADMIN_RESOURCES = {
  USERS: 'users',
  ROLES: 'roles',
  PERMISSIONS: 'permissions',
} as const;

export const KNOWLEDGE_MANAGEMENT_CATEGORY = 'knowledge-management' as const;

export const KNOWLEDGE_MANAGEMENT_RESOURCES = {
  DOCUMENTS: 'documents',
} as const;

export type KnowledgeManagementResource =
  (typeof KNOWLEDGE_MANAGEMENT_RESOURCES)[keyof typeof KNOWLEDGE_MANAGEMENT_RESOURCES];

export type AdminResource = (typeof ADMIN_RESOURCES)[keyof typeof ADMIN_RESOURCES];

type ResourceDefinition = {
  resource: string;
  label: string;
  description: string;
  routePatterns: string[];
  apiPatterns: string[];
};

const PLATFORM_BASIC_RESOURCE_DEFS: ResourceDefinition[] = [
  {
    resource: PLATFORM_BASIC_RESOURCES.MODELS,
    label: 'Model configuration',
    description: 'LLM provider connections and defaults.',
    routePatterns: ['/admin/models'],
    apiPatterns: ['/api/admin/models', '/api/admin/models/*'],
  },
  {
    resource: PLATFORM_BASIC_RESOURCES.STORAGE,
    label: 'Object storage',
    description: 'S3-compatible bucket browser and object moves.',
    routePatterns: ['/admin/storage'],
    apiPatterns: ['/api/console/storage', '/api/console/storage/*'],
  },
];

const KNOWLEDGE_MANAGEMENT_RESOURCE_DEFS: ResourceDefinition[] = [
  {
    resource: KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS,
    label: 'Documents',
    description: 'Channel folders and document uploads.',
    routePatterns: ['/knowledge/documents'],
    apiPatterns: [
      '/api/document-channels',
      '/api/document-channels/*',
      '/api/documents',
      '/api/documents/*',
    ],
  },
];

const ADMIN_RESOURCE_DEFS: ResourceDefinition[] = [
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

function buildPermissions(
  category: PermissionCategory,
  defs: ResourceDefinition[],
): PermissionDefinition[] {
  return defs.flatMap((def) =>
    (['read', 'write'] as const).map((access) => {
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
    }),
  );
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  ...buildPermissions(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCE_DEFS),
  ...buildPermissions(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCE_DEFS),
  ...buildPermissions('admin', ADMIN_RESOURCE_DEFS),
];

/** Keys superseded by granular read/write permissions or category moves. */
export const OBSOLETE_PERMISSION_KEYS = [
  'admin:all',
  'admin:models',
  'admin:models:read',
  'admin:models:write',
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
  return PERMISSION_CATALOG.some((def) =>
    hasResourcePermission(keys, def.category, def.resource, 'read'),
  );
}
