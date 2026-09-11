export type NavPageIcon =
  | 'models'
  | 'pipelines'
  | 'judge-dimensions'
  | 'storage'
  | 'builtin-agents'
  | 'asr-hotwords'
  | 'documents'
  | 'audio'
  | 'knowledge'
  | 'users'
  | 'roles'
  | 'permissions'
  | 'hybrid-search'
  | 'evaluation-dataset'
  | 'evaluation-run';

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
    navLabel: 'Model Configuration',
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
    path: '/admin/builtin-agents',
    navLabel: 'Builtin Agents',
    titleMain: 'Builtin',
    titleAccent: 'Agents',
    permissionKey: 'platform-basic:builtin-agents',
    icon: 'builtin-agents',
  },
  {
    path: '/admin/storage',
    navLabel: 'Object Storage',
    titleMain: 'Object',
    titleAccent: 'Storage',
    permissionKey: 'platform-basic:storage',
    icon: 'storage',
  },
];

export const KNOWLEDGE_MANAGEMENT_CATEGORY = 'Knowledge Management';

export const KNOWLEDGE_MANAGEMENT_PAGES: readonly NavPage[] = [
  {
    path: '/knowledge/documents',
    navLabel: 'Document',
    titleMain: 'Document',
    titleAccent: '',
    permissionKey: 'knowledge-management:documents',
    icon: 'documents',
  },
  {
    path: '/knowledge/knowledge-bases',
    navLabel: 'KnowledgeBase',
    titleMain: 'Knowledge',
    titleAccent: 'Bases',
    permissionKey: 'knowledge-management:knowledge-bases',
    icon: 'knowledge',
  },
  {
    path: '/knowledge/hybrid-search',
    navLabel: 'Hybrid Search',
    titleMain: 'Hybrid',
    titleAccent: 'Search',
    permissionKey: 'knowledge-management:hybrid-search',
    icon: 'hybrid-search',
  },
  {
    path: '/knowledge/asr-hotwords',
    navLabel: 'ASR Hotwords',
    titleMain: 'ASR',
    titleAccent: 'Hotwords',
    permissionKey: 'knowledge-management:asr-hotwords',
    icon: 'asr-hotwords',
  },
];

export const EVALUATION_CATEGORY = 'Evaluation';

export const EVALUATION_PAGES: readonly NavPage[] = [
  {
    path: '/evaluation/datasets',
    navLabel: 'DataSet',
    titleMain: 'Data',
    titleAccent: 'Set',
    permissionKey: 'evaluation:datasets',
    icon: 'evaluation-dataset',
  },
  {
    path: '/evaluation/runs',
    navLabel: 'Evaluation',
    titleMain: 'Evaluation',
    titleAccent: '',
    permissionKey: 'evaluation:runs',
    icon: 'evaluation-run',
  },
  {
    path: '/evaluation/judge-dimensions',
    navLabel: 'Judge Dimensions',
    titleMain: 'Judge',
    titleAccent: 'Dimensions',
    permissionKey: 'evaluation:judge-dimensions',
    icon: 'judge-dimensions',
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
  ...KNOWLEDGE_MANAGEMENT_PAGES,
  ...EVALUATION_PAGES,
  ...PLATFORM_BASIC_PAGES,
  ...ADMIN_PAGES,
];

export function getNavPage(path: string): NavPage | undefined {
  return ALL_NAV_PAGES.find((item) => item.path === path);
}

/** @deprecated use ADMIN_PAGES */
export const ADMIN_NAV_ITEMS = ADMIN_PAGES;
