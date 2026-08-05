import type { AccessLevel, PermissionCategory } from '../db/schema.ts';

export const PLATFORM_BASIC_CATEGORY = 'platform-basic' as const;

export const PLATFORM_BASIC_RESOURCES = {
  MODELS: 'models',
  STORAGE: 'storage',
  PIPELINES: 'pipelines',
  BUILTIN_AGENTS: 'builtin-agents',
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
  KNOWLEDGE_BASES: 'knowledge-bases',
  HYBRID_SEARCH: 'hybrid-search',
} as const;

export type KnowledgeManagementResource =
  (typeof KNOWLEDGE_MANAGEMENT_RESOURCES)[keyof typeof KNOWLEDGE_MANAGEMENT_RESOURCES];

export const AGENT_CATEGORY = 'agent' as const;

export const AGENT_RESOURCES = {
  ASSET_MARKET: 'asset-market',
  PLAYGROUND: 'playground',
  SESSION_EXPLORER: 'session-explorer',
} as const;

export type AgentResource = (typeof AGENT_RESOURCES)[keyof typeof AGENT_RESOURCES];

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
  {
    resource: PLATFORM_BASIC_RESOURCES.PIPELINES,
    label: 'Pipelines',
    description: 'Document processing pipeline templates for openkms-cli.',
    routePatterns: ['/admin/pipelines'],
    apiPatterns: ['/api/admin/pipelines', '/api/admin/pipelines/*'],
  },
  {
    resource: PLATFORM_BASIC_RESOURCES.BUILTIN_AGENTS,
    label: 'Builtin agents',
    description: 'Sync workflow agents for extraction, polish, and image ingest.',
    routePatterns: ['/admin/builtin-agents'],
    apiPatterns: [
      '/api/admin/builtin-agents',
      '/api/admin/builtin-agents/*',
      '/api/builtin-agents',
      '/api/builtin-agents/*',
    ],
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
  {
    resource: KNOWLEDGE_MANAGEMENT_RESOURCES.KNOWLEDGE_BASES,
    label: 'Knowledge bases',
    description: 'PageIndex knowledge bases and document import.',
    routePatterns: ['/knowledge/knowledge-bases'],
    apiPatterns: ['/api/knowledge-bases', '/api/knowledge-bases/*'],
  },
];

const KNOWLEDGE_MANAGEMENT_FEATURE_DEFS: ResourceDefinition[] = [
  {
    resource: KNOWLEDGE_MANAGEMENT_RESOURCES.HYBRID_SEARCH,
    label: 'Hybrid search',
    description: 'Cross-knowledge-base hybrid retrieval playground.',
    routePatterns: ['/knowledge/hybrid-search'],
    apiPatterns: ['/api/hybrid-search', '/api/hybrid-search/*'],
  },
];

const AGENT_RW_RESOURCE_DEFS: ResourceDefinition[] = [
  {
    resource: AGENT_RESOURCES.ASSET_MARKET,
    label: 'Asset market',
    description: 'Browse platform assets and create or edit personal studio agents and MCP credentials.',
    routePatterns: ['/agents/asset-market'],
    apiPatterns: ['/api/studio', '/api/studio/*'],
  },
];

const AGENT_FEATURE_DEFS: ResourceDefinition[] = [
  {
    resource: AGENT_RESOURCES.PLAYGROUND,
    label: 'Agent playground',
    description: 'Chat with catalog agents and manage personal conversations.',
    routePatterns: ['/agents/playground', '/chat'],
    apiPatterns: ['/api/agents', '/api/agents/*', '/api/conversations', '/api/conversations/*'],
  },
  {
    resource: AGENT_RESOURCES.SESSION_EXPLORER,
    label: 'Session explorer',
    description: 'Browse agent conversation history by date range and user.',
    routePatterns: ['/agents/session-explorer'],
    apiPatterns: ['/api/session-explorer', '/api/session-explorer/*'],
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

/** Features with a single on/off grant — no read/write split. */
function buildFeaturePermissions(
  category: PermissionCategory,
  defs: ResourceDefinition[],
): PermissionDefinition[] {
  return defs.map((def) => ({
    key: `${category}:${def.resource}`,
    label: def.label,
    description: def.description,
    category,
    resource: def.resource,
    access: 'read' as const,
    routePatterns: def.routePatterns,
    apiPatterns: def.apiPatterns,
    isSystem: true,
  }));
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  ...buildPermissions(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCE_DEFS),
  ...buildPermissions(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_RESOURCE_DEFS),
  ...buildFeaturePermissions(KNOWLEDGE_MANAGEMENT_CATEGORY, KNOWLEDGE_MANAGEMENT_FEATURE_DEFS),
  ...buildPermissions(AGENT_CATEGORY, AGENT_RW_RESOURCE_DEFS),
  ...buildFeaturePermissions(AGENT_CATEGORY, AGENT_FEATURE_DEFS),
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
  'agent:playground:read',
  'agent:playground:write',
  'agent:session-explorer:read',
  'agent:session-explorer:write',
  'knowledge-management:hybrid-search:read',
  'knowledge-management:hybrid-search:write',
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
  const flatKey = `${category}:${resource}`;
  if (keys.has(flatKey)) return true;

  const writeKey = permissionKey(category, resource, 'write');
  const readKey = permissionKey(category, resource, 'read');
  if (keys.has(writeKey)) return true;
  if (required === 'read' && keys.has(readKey)) return true;
  return false;
}

export function hasPermissionKey(keys: Set<string>, key: string, required: AccessLevel): boolean {
  if (keys.has(key)) return true;

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
