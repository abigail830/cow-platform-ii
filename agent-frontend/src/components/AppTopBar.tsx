import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Settings, User } from 'lucide-react';
import type { AuthUser } from '../api/auth.ts';
import { KNOWLEDGE_MANAGEMENT_PAGES, type NavPage } from '../shared/admin-nav.ts';
import {
  isAdminSectionPath,
  isAgentsSectionPath,
  isKnowledgeSectionPath,
  resolveDefaultAdminPath,
} from '../shared/app-layout-mode.ts';
import { HOME_PATH, visibleAgentPages } from '../shared/agent-nav.ts';
import { hasPermission } from '../shared/permissions.ts';
import { NavPageIcon } from './icons/NavIcons.tsx';
import { iconProps } from './icons/icon-props.ts';

type AppTopBarProps = {
  user: AuthUser;
  userLabel: string;
  activePath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
};

type TopNavDropdownProps = {
  label: string;
  items: readonly NavPage[];
  activePath: string;
  isSectionActive: boolean;
  onNavigate: (path: string) => void;
};

function TopNavDropdown({
  label,
  items,
  activePath,
  isSectionActive,
  onNavigate,
}: TopNavDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className={`topbar-dropdown${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`topbar-nav-item${isSectionActive ? ' active' : ''}${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{label}</span>
        <ChevronDown {...iconProps({ size: 12 })} aria-hidden />
      </button>
      {open && (
        <div className="topbar-dropdown-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.path}
              type="button"
              role="menuitem"
              className={`topbar-dropdown-item${activePath.startsWith(item.path) ? ' active' : ''}`}
              onClick={() => {
                setOpen(false);
                onNavigate(item.path);
              }}
            >
              <span className="topbar-dropdown-item-icon">
                <NavPageIcon name={item.icon} />
              </span>
              <span>{item.navLabel}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppTopBar({ user, userLabel, activePath, onNavigate, onLogout }: AppTopBarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const agentItems = visibleAgentPages(user);
  const knowledgeItems = KNOWLEDGE_MANAGEMENT_PAGES.filter((item) =>
    hasPermission(user, item.permissionKey, 'read'),
  );
  const showAdmin = resolveDefaultAdminPath(user) !== '/';

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

  function handleAdminClick() {
    if (isAdminSectionPath(activePath)) return;
    onNavigate(resolveDefaultAdminPath(user));
  }

  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-brand"
          onClick={() => onNavigate(HOME_PATH)}
          title="Home"
        >
          <img className="topbar-logo" src="/cow.png" alt="" width={24} height={24} />
          <span className="topbar-brand-main">Agent Platform</span>
          <span className="topbar-brand-accent">II</span>
        </button>
      </div>

      <nav className="topbar-nav" aria-label="Main">
        <div className="topbar-nav-links">
          <TopNavDropdown
            label="Agents"
            items={agentItems}
            activePath={activePath}
            isSectionActive={isAgentsSectionPath(activePath)}
            onNavigate={onNavigate}
          />
          <TopNavDropdown
            label="Knowledge"
            items={knowledgeItems}
            activePath={activePath}
            isSectionActive={isKnowledgeSectionPath(activePath)}
            onNavigate={onNavigate}
          />
        </div>
      </nav>

      <div className="topbar-right">
        {showAdmin && (
          <button
            type="button"
            className={`topbar-admin-entry${isAdminSectionPath(activePath) ? ' active' : ''}`}
            onClick={handleAdminClick}
            title="Administration"
            aria-label="Administration"
          >
            <Settings {...iconProps()} aria-hidden />
          </button>
        )}
        <div className="topbar-user-wrap" ref={userMenuRef}>
          <button
            type="button"
            className="topbar-user"
            onClick={() => setUserMenuOpen((open) => !open)}
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
            title={userLabel}
          >
            <span className="topbar-avatar" aria-hidden>
              <User {...iconProps()} />
            </span>
            <span className="topbar-user-email">{userLabel}</span>
          </button>
          {userMenuOpen && (
            <div className="topbar-user-menu" role="menu">
              <button
                type="button"
                className="topbar-user-menu-item"
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
                className="topbar-user-menu-item"
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
      </div>
    </header>
  );
}
