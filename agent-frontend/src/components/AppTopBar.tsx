import { useEffect, useRef, useState } from 'react';
import { Toolbox, User } from 'lucide-react';
import type { AuthUser } from '../api/auth.ts';
import { KNOWLEDGE_MANAGEMENT_PAGES } from '../shared/admin-nav.ts';
import { isAdminSectionPath, resolveDefaultAdminPath } from '../shared/app-layout-mode.ts';
import { HOME_PATH } from '../shared/app-nav.ts';
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

export function AppTopBar({ user, userLabel, activePath, onNavigate, onLogout }: AppTopBarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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
          {knowledgeItems.map((item) => (
            <button
              key={item.path}
              type="button"
              className={`topbar-nav-item${activePath.startsWith(item.path) ? ' active' : ''}`}
              onClick={() => onNavigate(item.path)}
            >
              <span className="topbar-nav-item-icon" aria-hidden>
                <NavPageIcon name={item.icon} />
              </span>
              <span>{item.navLabel}</span>
            </button>
          ))}
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
            <Toolbox {...iconProps({ size: 18 })} aria-hidden />
          </button>
        )}
        {showAdmin && <span className="topbar-right-divider" aria-hidden />}
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
              <User {...iconProps({ size: 18 })} />
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
