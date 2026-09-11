import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, fetchMe, getToken, setSession, type AuthUser } from '../api/auth.ts';
import { AppSideNav } from '../components/AppSideNav.tsx';
import { AppTopBar } from '../components/AppTopBar.tsx';
import { canAccessAppPath, resolveAppHomePath } from '../shared/app-nav.ts';
import { getAppLayoutMode } from '../shared/app-layout-mode.ts';

export type AppOutletContext = {
  user: AuthUser;
};

const AppOutletContextInternal = createContext<AppOutletContext | null>(null);

export function useAppOutletContext(): AppOutletContext {
  const ctx = useContext(AppOutletContextInternal);
  if (!ctx) throw new Error('useAppOutletContext must be used within AppLayout');
  return ctx;
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [navCollapsed, setNavCollapsed] = useState(false);

  const layoutMode = getAppLayoutMode(location.pathname);
  const showSideNav = layoutMode === 'admin';

  useEffect(() => {
    if (!getToken()) {
      navigate('/login', { replace: true });
      return;
    }
    void (async () => {
      try {
        const me = await fetchMe();
        setUser(me);
        const token = getToken();
        if (token) setSession(token, me);
      } catch {
        clearSession();
        navigate('/login', { replace: true });
      } finally {
        setBooting(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (!user || booting) return;
    if (!canAccessAppPath(user, location.pathname)) {
      navigate(resolveAppHomePath(user), { replace: true });
    }
  }, [booting, location.pathname, navigate, user]);

  function logout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  if (booting || !user) {
    return <div className="boot">Loading…</div>;
  }

  const outletContext: AppOutletContext = {
    user,
  };

  const bodyClassName = [
    'app-body',
    `layout-${layoutMode}`,
    showSideNav && navCollapsed ? 'nav-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <AppOutletContextInternal.Provider value={outletContext}>
      <div className={`app-shell layout-${layoutMode}`}>
        <AppTopBar
          user={user}
          userLabel={user.displayName ?? user.email}
          activePath={location.pathname}
          onNavigate={(path: string) => navigate(path)}
          onLogout={logout}
        />
        <div className={bodyClassName}>
          {showSideNav && (
            <AppSideNav
              user={user}
              activePath={location.pathname}
              collapsed={navCollapsed}
              onToggleCollapse={() => setNavCollapsed((value) => !value)}
              onNavigate={(path: string) => navigate(path)}
            />
          )}
          <div className="app-main">
            <Outlet context={outletContext} />
          </div>
        </div>
      </div>
    </AppOutletContextInternal.Provider>
  );
}

type AdminPageTitleProps = {
  main: string;
  accent: string;
};

export function AdminPageTitle({ main, accent }: AdminPageTitleProps) {
  if (!accent) {
    return (
      <h1>
        <span className="admin-title-accent">{main}</span>
      </h1>
    );
  }

  return (
    <h1>
      <span className="admin-title-main">{main}</span>{' '}
      <span className="admin-title-accent">{accent}</span>
    </h1>
  );
}

export function AdminPageDescription({ children }: { children: ReactNode }) {
  return <p className="admin-header-desc">{children}</p>;
}
