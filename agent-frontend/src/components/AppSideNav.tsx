import { useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../api/auth.ts';
import type { AgentInfo } from '../api/conversations.ts';
import {
  ADMIN_PAGES,
  ADMINISTRATION_CATEGORY,
  KNOWLEDGE_MANAGEMENT_CATEGORY,
  KNOWLEDGE_MANAGEMENT_PAGES,
  PLATFORM_BASIC_CATEGORY,
  PLATFORM_BASIC_PAGES,
  type NavPage,
} from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';
import { NavPageIcon } from './icons/NavIcons.tsx';
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
  const platformBasicItems = PLATFORM_BASIC_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read'));
  const knowledgeItems = KNOWLEDGE_MANAGEMENT_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read'));
  const adminItems = ADMIN_PAGES.filter((item) => hasPermission(user, item.permissionKey, 'read'));

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

        <NavSection
          category={PLATFORM_BASIC_CATEGORY}
          items={platformBasicItems}
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
