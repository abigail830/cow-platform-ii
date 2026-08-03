import { useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../api/auth.ts';
import {
  ADMIN_PAGES,
  ADMINISTRATION_CATEGORY,
  AGENTS_CATEGORY,
  KNOWLEDGE_MANAGEMENT_CATEGORY,
  KNOWLEDGE_MANAGEMENT_PAGES,
  PLATFORM_BASIC_CATEGORY,
  PLATFORM_BASIC_PAGES,
  type NavPage,
} from '../shared/admin-nav.ts';
import { HOME_PATH, visibleAgentPages } from '../shared/agent-nav.ts';
import { hasPermission } from '../shared/permissions.ts';
import { User } from 'lucide-react';
import { NavPageIcon } from './icons/NavIcons.tsx';
import { IconSidenavCollapse, IconSidenavExpand } from './icons/AgentIcons.tsx';
import { iconProps } from './icons/icon-props.ts';

type AppSideNavProps = {
  user: AuthUser;
  userLabel: string;
  activePath: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLogout: () => void;
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
  userLabel,
  activePath,
  collapsed,
  onToggleCollapse,
  onLogout,
  onNavigate,
}: AppSideNavProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const platformBasicItems = PLATFORM_BASIC_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read'));
  const knowledgeItems = KNOWLEDGE_MANAGEMENT_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read'));
  const adminItems = ADMIN_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read'));
  const agentItems = visibleAgentPages(user);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onDocClick(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [userMenuOpen]);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [collapsed]);

  return (
    <aside className={`app-sidenav${collapsed ? ' collapsed' : ''}`}>
      <button
        type="button"
        className="sidenav-header"
        onClick={() => onNavigate(HOME_PATH)}
        title="Home"
      >
        <img className="sidenav-logo" src="/cow.png" alt="" width={28} height={28} />
        {!collapsed && (
          <div className="sidenav-brand">
            <span className="sidenav-brand-main">Agent Platform</span>
            <span className="sidenav-brand-accent">II</span>
          </div>
        )}
      </button>

      <nav className="sidenav-nav">
        <NavSection
          category={AGENTS_CATEGORY}
          items={agentItems}
          activePath={activePath}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />

        <NavSection
          category={KNOWLEDGE_MANAGEMENT_CATEGORY}
          items={knowledgeItems}
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
        {!collapsed && (
          <div className="sidenav-user-wrap" ref={userMenuRef}>
            <button
              type="button"
              className="sidenav-user"
              onClick={() => setUserMenuOpen((open) => !open)}
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              title={userLabel}
            >
              <span className="sidenav-avatar" aria-hidden>
                <User {...iconProps()} />
              </span>
              <span className="sidenav-user-email" title={userLabel}>
                {userLabel}
              </span>
            </button>
            {userMenuOpen && (
              <div className="sidenav-user-menu" role="menu">
                <button
                  type="button"
                  className="sidenav-user-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onNavigate('/settings/api-keys');
                  }}
                >
                  API keys
                </button>
                <button
                  type="button"
                  className="sidenav-user-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className="sidenav-toggle"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <IconSidenavCollapse /> : <IconSidenavExpand />}
        </button>
      </div>
    </aside>
  );
}
