import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppSideNav } from '../components/AppSideNav.tsx';
import { AgentChatPanel } from '../components/AgentChatPanel.tsx';
import { ChatComposer } from '../components/ChatComposer.tsx';
import { ChatHistoryPanel } from '../components/ChatHistoryPanel.tsx';
import { AgentMenuIcon } from '../components/icons/AgentIcons.tsx';
import { IconNewSession, IconSessionHistory } from '../components/icons/ChatIcons.tsx';
import { clearSession, fetchMe, getToken, type AuthUser } from '../api/auth.ts';
import {
  createConversation,
  listAgents,
  listConversations,
  patchConversation,
  type AgentInfo,
  type Conversation,
} from '../api/conversations.ts';

export function ChatPage() {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingInitialMessage, setPendingInitialMessage] = useState<string | null>(null);

  const selectedAgentInfo = agents.find((agent) => agent.name === selectedAgent) ?? null;

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
        const first = agentList[0]?.name ?? null;
        setSelectedAgent(first);
        if (first) {
          const convs = await listConversations(first);
          setConversations(convs);
        }
      } catch {
        clearSession();
        navigate('/login', { replace: true });
      } finally {
        setBooting(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAgent) return;
    void listConversations(selectedAgent).then(setConversations);
    setActiveId(null);
    setPendingInitialMessage(null);
    setHistoryOpen(false);
  }, [selectedAgent]);

  const recentConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [conversations],
  );

  async function refreshConversations() {
    if (!selectedAgent) return;
    const convs = await listConversations(selectedAgent);
    setConversations(convs);
  }

  async function startNewChat() {
    if (!selectedAgent) return;
    const conv = await createConversation(selectedAgent, 'New conversation');
    setConversations((prev) => [conv, ...prev]);
    setPendingInitialMessage(null);
    setActiveId(conv.id);
    setHistoryOpen(false);
  }

  async function onTitleFromMessage(title: string) {
    if (!activeId) return;
    const conv = conversations.find((c) => c.id === activeId);
    if (!conv || conv.title !== 'New conversation') return;
    try {
      await patchConversation(activeId, title);
      await refreshConversations();
    } catch {
      // non-fatal
    }
  }

  async function onSendNewChat() {
    if (!input.trim() || !selectedAgent || busy) return;
    const text = input.trim();
    setInput('');
    const conv = await createConversation(selectedAgent, text.slice(0, 48));
    setConversations((prev) => [conv, ...prev]);
    setPendingInitialMessage(text);
    setActiveId(conv.id);
  }

  function selectConversation(id: string) {
    setPendingInitialMessage(null);
    setActiveId(id);
  }

  function logout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  if (booting) {
    return <div className="boot">Loading…</div>;
  }

  return (
    <div className={`chat-layout${navCollapsed ? ' nav-collapsed' : ''}`}>
      <AppSideNav
        agents={agents}
        selectedAgent={selectedAgent}
        onSelectAgent={setSelectedAgent}
        userLabel={user?.displayName ?? user?.email ?? ''}
        collapsed={navCollapsed}
        onToggleCollapse={() => setNavCollapsed((value) => !value)}
        onLogout={logout}
      />

      <div className="chat-shell">
        <main className="chat-main">
          <header className="chat-header">
            <div className="chat-header-title">
              {selectedAgent && <AgentMenuIcon name={selectedAgent} className="chat-header-icon" />}
              <h2>{selectedAgentInfo?.displayName ?? 'Chat'}</h2>
            </div>
            <div className="chat-header-actions">
              <button
                type="button"
                className="chat-icon-btn"
                onClick={() => void startNewChat()}
                title="New session"
                aria-label="New session"
              >
                <IconNewSession />
              </button>
              <button
                type="button"
                className={`chat-icon-btn${historyOpen ? ' active' : ''}`}
                onClick={() => setHistoryOpen((open) => !open)}
                title="Session history"
                aria-label="Session history"
              >
                <IconSessionHistory />
              </button>
            </div>
          </header>

          <div className="chat-body">
            <div className="chat-stage">
              {selectedAgent && user && activeId ? (
                <AgentChatPanel
                  key={`${selectedAgent}:${activeId}`}
                  agentName={selectedAgent}
                  conversationId={activeId}
                  userId={user.id}
                  initialMessage={pendingInitialMessage}
                  onInitialMessageSent={() => {
                    setPendingInitialMessage(null);
                    void refreshConversations();
                  }}
                  onTitleFromMessage={(title) => void onTitleFromMessage(title)}
                  input={input}
                  onInputChange={setInput}
                  onBusyChange={setBusy}
                  messagesEndRef={messagesEndRef}
                />
              ) : (
                <>
                  <div className="chat-messages">
                    <div className="chat-column">
                      <p className="empty">
                        Start a conversation
                      </p>
                      <div ref={messagesEndRef} />
                    </div>
                  </div>
                  <ChatComposer
                    value={input}
                    onChange={setInput}
                    onSend={() => void onSendNewChat()}
                    busy={busy}
                  />
                </>
              )}
            </div>
          </div>
        </main>

        {historyOpen && (
          <ChatHistoryPanel
            conversations={recentConversations}
            activeId={activeId}
            onSelect={selectConversation}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
