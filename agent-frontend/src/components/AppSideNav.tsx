import {
  ADMIN_PAGES,
  ADMINISTRATION_CATEGORY,
  EVALUATION_CATEGORY,
  EVALUATION_PAGES,
  PLATFORM_BASIC_CATEGORY,
  PLATFORM_BASIC_PAGES,
  type NavPage,
} from '../shared/admin-nav.ts';
import type { AuthUser } from '../api/auth.ts';
import { hasPermission } from '../shared/permissions.ts';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavPageIcon } from './icons/NavIcons.tsx';
import { iconProps } from './icons/icon-props.ts';

type AppSideNavProps = {
  user: AuthUser;
  activePath: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate: (path: string) => void;
};

function NavSection({
  category,
  items,
  activePath,
  collapsed,
  onNavigate,
}: {
  category: string;
  items: readonly NavPage[];
  activePath: string;
  collapsed: boolean;
  onNavigate: (path: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <>
      {!collapsed && <div className="sidenav-category">{category}</div>}
      <ul className="sidenav-menu">
        {items.map((item) => (
          <li key={item.path}>
            <button
              type="button"
              className={`sidenav-item${activePath.startsWith(item.path) ? ' active' : ''}`}
              onClick={() => onNavigate(item.path)}
              title={collapsed ? item.navLabel : undefined}
            >
              <span className="sidenav-item-icon">
                <NavPageIcon name={item.icon} />
              </span>
              {!collapsed && <span className="sidenav-item-label">{item.navLabel}</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function AppSideNav({
  user,
  activePath,
  collapsed,
  onToggleCollapse,
  onNavigate,
}: AppSideNavProps) {
  const platformBasicItems = PLATFORM_BASIC_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read'));
  const evaluationItems = EVALUATION_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read'));
  const adminItems = ADMIN_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read'));

  return (
    <aside className={`app-sidenav${collapsed ? ' collapsed' : ''}`}>
      <nav className="sidenav-nav">
        <NavSection
          category={EVALUATION_CATEGORY}
          items={evaluationItems}
          activePath={activePath}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />

        <NavSection
          category={PLATFORM_BASIC_CATEGORY}
          items={platformBasicItems}
          activePath={activePath}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />

        <NavSection
          category={ADMINISTRATION_CATEGORY}
          items={adminItems}
          activePath={activePath}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </nav>

      <div className="sidenav-footer">
        <button
          type="button"
          className="sidenav-toggle"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen {...iconProps()} aria-hidden />
          ) : (
            <PanelLeftClose {...iconProps()} aria-hidden />
          )}
        </button>
      </div>
    </aside>
  );
}
