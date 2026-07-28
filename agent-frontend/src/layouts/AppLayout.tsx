import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, fetchMe, getToken, setSession, type AuthUser } from '../api/auth.ts';
import { listAgents, type AgentInfo } from '../api/conversations.ts';
import { AppSideNav } from '../components/AppSideNav.tsx';

export type AppOutletContext = {
  user: AuthUser;
  agents: AgentInfo[];
  selectedAgent: string | null;
  setSelectedAgent: (name: string) => void;
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
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [navCollapsed, setNavCollapsed] = useState(false);

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
        const agentList = await listAgents();
        setAgents(agentList);
      } catch {
        clearSession();
        navigate('/login', { replace: true });
      } finally {
        setBooting(false);
      }
    })();
  }, [navigate]);

  function logout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  function handleSelectAgent(name: string) {
    setSelectedAgent(name);
    if (!location.pathname.startsWith('/chat')) {
      navigate('/chat');
    }
  }

  if (booting || !user) {
    return <div className="boot">Loading…</div>;
  }

  const outletContext: AppOutletContext = {
    user,
    agents,
    selectedAgent,
    setSelectedAgent,
  };

  return (
    <AppOutletContextInternal.Provider value={outletContext}>
      <div className={`chat-layout${navCollapsed ? ' nav-collapsed' : ''}`}>
        <AppSideNav
          agents={agents}
          selectedAgent={selectedAgent}
          onSelectAgent={handleSelectAgent}
          user={user}
          userLabel={user.displayName ?? user.email}
          activePath={location.pathname}
          collapsed={navCollapsed}
          onToggleCollapse={() => setNavCollapsed((value) => !value)}
          onLogout={logout}
          onNavigate={(path: string) => navigate(path)}
        />
        <div className="app-main">
          <Outlet context={outletContext} />
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
