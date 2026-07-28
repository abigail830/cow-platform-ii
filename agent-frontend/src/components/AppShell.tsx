import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession, fetchMe, getToken, type AuthUser } from '../api/auth.ts';
import { listAgents, type AgentInfo } from '../api/conversations.ts';
import { AppSideNav } from './AppSideNav.tsx';

type AppShellProps = {
  children: ReactNode | ((ctx: { user: AuthUser; agents: AgentInfo[] }) => ReactNode);
  activePath: string;
  selectedAgent?: string | null;
  onSelectAgent?: (name: string) => void;
};

export function AppShell({ children, activePath, selectedAgent = null, onSelectAgent }: AppShellProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
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
    onSelectAgent?.(name);
    if (!activePath.startsWith('/chat')) {
      navigate('/chat');
    }
  }

  if (booting || !user) {
    return <div className="boot">Loading…</div>;
  }

  const content = typeof children === 'function' ? children({ user, agents }) : children;

  return (
    <div className={`chat-layout${navCollapsed ? ' nav-collapsed' : ''}`}>
      <AppSideNav
        agents={agents}
        selectedAgent={selectedAgent}
        onSelectAgent={handleSelectAgent}
        userLabel={user.displayName ?? user.email}
        userRole={user.role}
        activePath={activePath}
        collapsed={navCollapsed}
        onToggleCollapse={() => setNavCollapsed((value) => !value)}
        onLogout={logout}
        onNavigate={(path) => navigate(path)}
      />
      <div className="app-main">{content}</div>
    </div>
  );
}
