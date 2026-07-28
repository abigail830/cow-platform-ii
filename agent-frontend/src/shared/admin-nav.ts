export const ADMIN_PAGES = [
  {
    path: '/admin/models',
    navLabel: 'Model configuration',
    titleMain: 'Model',
    titleAccent: 'Configuration',
    permissionKey: 'admin:models',
    icon: 'models' as const,
  },
  {
    path: '/admin/users',
    navLabel: 'User configuration',
    titleMain: 'User',
    titleAccent: 'Configuration',
    permissionKey: 'admin:users',
    icon: 'users' as const,
  },
  {
    path: '/admin/roles',
    navLabel: 'Role configuration',
    titleMain: 'Role',
    titleAccent: 'Configuration',
    permissionKey: 'admin:roles',
    icon: 'roles' as const,
  },
  {
    path: '/admin/permissions',
    navLabel: 'Permission catalog',
    titleMain: 'Permission',
    titleAccent: 'Catalog',
    permissionKey: 'admin:permissions',
    icon: 'permissions' as const,
  },
] as const;

/** @deprecated use ADMIN_PAGES */
export const ADMIN_NAV_ITEMS = ADMIN_PAGES;
