import { useEffect, useRef, useState } from 'react';
import type { AgentInfo } from '../api/conversations.ts';
import type { UserRole } from '../api/auth.ts';
import { AgentMenuIcon, IconSidenavCollapse, IconSidenavExpand } from './icons/AgentIcons.tsx';

type AppSideNavProps = {
  agents: AgentInfo[];
  selectedAgent: string | null;
  onSelectAgent: (name: string) => void;
  userLabel: string;
  userRole: UserRole;
  activePath: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
};

function IconModels() {
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
  userLabel,
  userRole,
  activePath,
  collapsed,
  onToggleCollapse,
  onLogout,
  onNavigate,
}: AppSideNavProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const showAdmin = userRole === 'admin' || userRole === 'operator';

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
              <li>
                <button
                  type="button"
                  className={`sidenav-item${activePath.startsWith('/admin/models') ? ' active' : ''}`}
                  onClick={() => onNavigate('/admin/models')}
                  title={collapsed ? 'Model configuration' : undefined}
                >
                  <span className="sidenav-item-icon">
                    <IconModels />
                  </span>
                  {!collapsed && <span className="sidenav-item-label">Model configuration</span>}
                </button>
              </li>
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
