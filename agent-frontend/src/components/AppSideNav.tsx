import { useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../api/auth.ts';
import type { AgentInfo } from '../api/conversations.ts';
import { ADMIN_PAGES } from '../shared/admin-nav.ts';
import { canSeeAdminSection, hasPermission } from '../shared/permissions.ts';
import { AgentMenuIcon, IconSidenavCollapse, IconSidenavExpand } from './icons/AgentIcons.tsx';

type AppSideNavProps = {
  agents: AgentInfo[];
  selectedAgent: string | null;
  onSelectAgent: (name: string) => void;
  user: AuthUser;
  userLabel: string;
  activePath: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
};

function AdminNavIcon({ name }: { name: (typeof ADMIN_PAGES)[number]['icon'] }) {
  if (name === 'users') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="6" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.25" />
        <path d="M2.5 13c0-2 1.8-3.5 3.5-3.5S9.5 11 9.5 13" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M11 6.5h3M12.5 5v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'roles') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="3" y="3" width="4.5" height="4.5" rx="0.75" stroke="currentColor" strokeWidth="1.25" />
        <rect x="8.5" y="3" width="4.5" height="4.5" rx="0.75" stroke="currentColor" strokeWidth="1.25" />
        <rect x="3" y="8.5" width="4.5" height="4.5" rx="0.75" stroke="currentColor" strokeWidth="1.25" />
        <rect x="8.5" y="8.5" width="4.5" height="4.5" rx="0.75" stroke="currentColor" strokeWidth="1.25" />
      </svg>
    );
  }
  if (name === 'permissions') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 3.5h8v9H4z" stroke="currentColor" strokeWidth="1.25" />
        <path d="M6.5 7h3M6.5 9.5h3M6.5 12h2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export function AppSideNav({
  agents,
  selectedAgent,
  onSelectAgent,
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
  const adminItems = ADMIN_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read'));
  const showAdmin = canSeeAdminSection(user) && adminItems.length > 0;

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
      <div className="sidenav-header">
        <img className="sidenav-logo" src="/cow.png" alt="" width={28} height={28} />
        {!collapsed && (
          <div className="sidenav-brand">
            <span className="sidenav-brand-main">Agent Platform</span>
            <span className="sidenav-brand-accent">II</span>
          </div>
        )}
      </div>

      <nav className="sidenav-nav">
        {!collapsed && <div className="sidenav-category">Agents</div>}
        <ul className="sidenav-menu">
          {agents.map((agent) => {
            const active = activePath.startsWith('/chat') && selectedAgent === agent.name;
            return (
              <li key={agent.name}>
                <button
                  type="button"
                  className={`sidenav-item${active ? ' active' : ''}`}
                  onClick={() => onSelectAgent(agent.name)}
                  title={collapsed ? agent.displayName : undefined}
                >
                  <AgentMenuIcon name={agent.name} className="sidenav-item-icon" />
                  {!collapsed && <span className="sidenav-item-label">{agent.displayName}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {showAdmin && (
          <>
            {!collapsed && <div className="sidenav-category">Administration</div>}
            <ul className="sidenav-menu">
              {adminItems.map((item) => (
                <li key={item.path}>
                  <button
                    type="button"
                    className={`sidenav-item${activePath.startsWith(item.path) ? ' active' : ''}`}
                    onClick={() => onNavigate(item.path)}
                    title={collapsed ? item.navLabel : undefined}
                  >
                    <span className="sidenav-item-icon">
                      <AdminNavIcon name={item.icon} />
                    </span>
                    {!collapsed && <span className="sidenav-item-label">{item.navLabel}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
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
                <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="5.5" r="2.25" stroke="currentColor" strokeWidth="1.25" />
                  <path
                    d="M3.5 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                  />
                </svg>
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
