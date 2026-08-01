export type NavPageIcon =
  | 'models'
  | 'pipelines'
  | 'storage'
  | 'documents'
  | 'users'
  | 'roles'
  | 'permissions'
  | 'playground'
  | 'session-explorer';

export type NavPage = {
  path: string;
  navLabel: string;
  titleMain: string;
  titleAccent: string;
  permissionKey: string;
  icon: NavPageIcon;
};

export const PLATFORM_BASIC_CATEGORY = 'Platform basic';

export const PLATFORM_BASIC_PAGES: readonly NavPage[] = [
  {
    path: '/admin/models',
    navLabel: 'Model configuration',
    titleMain: 'Model',
    titleAccent: 'Configuration',
    permissionKey: 'platform-basic:models',
    icon: 'models',
  },
  {
    path: '/admin/pipelines',
    navLabel: 'Pipelines',
    titleMain: 'Pipeline',
    titleAccent: 'Configuration',
    permissionKey: 'platform-basic:pipelines',
    icon: 'pipelines',
  },
  {
    path: '/admin/storage',
    navLabel: 'Object storage',
    titleMain: 'Object',
    titleAccent: 'Storage',
    permissionKey: 'platform-basic:storage',
    icon: 'storage',
  },
];

export const KNOWLEDGE_MANAGEMENT_CATEGORY = 'Knowledge Management';

export const AGENTS_CATEGORY = 'Agents';

export const AGENT_PLAYGROUND_PATH = '/agents/playground';
export const SESSION_EXPLORER_PATH = '/agents/session-explorer';

export const AGENT_PAGES: readonly NavPage[] = [
  {
    path: AGENT_PLAYGROUND_PATH,
    navLabel: 'Agent playground',
    titleMain: 'Agent',
    titleAccent: 'Playground',
    permissionKey: '',
    icon: 'playground',
  },
  {
    path: SESSION_EXPLORER_PATH,
    navLabel: 'Session explorer',
    titleMain: 'Session',
    titleAccent: 'Explorer',
    permissionKey: '',
    icon: 'session-explorer',
  },
];

export const KNOWLEDGE_MANAGEMENT_PAGES: readonly NavPage[] = [
  {
    path: '/knowledge/documents',
    navLabel: 'Document',
    titleMain: 'Document',
    titleAccent: '',
    permissionKey: 'knowledge-management:documents',
    icon: 'documents',
  },
];

export const ADMINISTRATION_CATEGORY = 'Administration';

export const ADMIN_PAGES: readonly NavPage[] = [
  {
    path: '/admin/users',
    navLabel: 'User',
    titleMain: 'User',
    titleAccent: '',
    permissionKey: 'admin:users',
    icon: 'users',
  },
  {
    path: '/admin/roles',
    navLabel: 'Role',
    titleMain: 'Role',
    titleAccent: '',
    permissionKey: 'admin:roles',
    icon: 'roles',
  },
  {
    path: '/admin/permissions',
    navLabel: 'Permission',
    titleMain: 'Permission',
    titleAccent: '',
    permissionKey: 'admin:permissions',
    icon: 'permissions',
  },
];

export const ALL_NAV_PAGES: readonly NavPage[] = [
  ...AGENT_PAGES,
  ...KNOWLEDGE_MANAGEMENT_PAGES,
  ...PLATFORM_BASIC_PAGES,
  ...ADMIN_PAGES,
];

export function getNavPage(path: string): NavPage | undefined {
  return ALL_NAV_PAGES.find((item) => item.path === path);
}

/** @deprecated use ADMIN_PAGES */
export const ADMIN_NAV_ITEMS = ADMIN_PAGES;
