import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { AuthUser } from '../api/auth.ts';
import { AgentA2aInfoButton } from '../components/AgentA2aInfoButton.tsx';
import { AgentChatPanel } from '../components/AgentChatPanel.tsx';
import { ChatComposer } from '../components/ChatComposer.tsx';
import { ChatHistoryPanel } from '../components/ChatHistoryPanel.tsx';
import { AgentMenuIcon } from '../components/icons/AgentIcons.tsx';
import { IconNewSession, IconSessionHistory } from '../components/icons/ChatIcons.tsx';
import {
  createConversation,
  listConversations,
  patchConversation,
  type AgentInfo,
  type Conversation,
} from '../api/conversations.ts';
import type { AgentPromptImage } from '../chat/prompt-images.ts';
import { SourcePreviewHostProvider } from '../chat/source-preview-host.tsx';

type ChatPageContentProps = {
  user: AuthUser;
  agents: AgentInfo[];
  selectedAgent: string | null;
  onSelectAgent: (name: string) => void;
};

function ChatPageContent({ user, agents, selectedAgent, onSelectAgent }: ChatPageContentProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingInitialMessage, setPendingInitialMessage] = useState<string | null>(null);
  const [pendingInitialImages, setPendingInitialImages] = useState<AgentPromptImage[] | null>(null);

  const selectedAgentInfo = agents.find((agent) => agent.name === selectedAgent) ?? null;

  useEffect(() => {
    if (!selectedAgent && agents[0]) {
      onSelectAgent(agents[0].name);
    }
  }, [agents, onSelectAgent, selectedAgent]);

  useEffect(() => {
    if (!selectedAgent) return;
    void listConversations(selectedAgent).then(setConversations);
    setActiveId(null);
    setPendingInitialMessage(null);
    setPendingInitialImages(null);
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
    setPendingInitialImages(null);
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

  async function onSendNewChat(payload: { text: string; images: AgentPromptImage[] }) {
    const text = payload.text.trim();
    if ((!text && payload.images.length === 0) || !selectedAgent || busy) return;
    const titleSource = text || 'Image';
    setInput('');
    const conv = await createConversation(selectedAgent, titleSource.slice(0, 48));
    setConversations((prev) => [conv, ...prev]);
    setPendingInitialMessage(text || ' ');
    setPendingInitialImages(payload.images.length > 0 ? payload.images : null);
    setActiveId(conv.id);
  }

  function selectConversation(id: string) {
    setPendingInitialMessage(null);
    setPendingInitialImages(null);
    setActiveId(id);
  }

  return (
    <SourcePreviewHostProvider>
      <div className="chat-shell">
        <main className="chat-main">
        <header className="chat-header">
          <div className="chat-header-title">
            {selectedAgent && <AgentMenuIcon className="chat-header-icon" />}
            <h2>{selectedAgentInfo?.displayName ?? 'Chat'}</h2>
            {selectedAgentInfo?.a2a ? <AgentA2aInfoButton a2a={selectedAgentInfo.a2a} /> : null}
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
            {selectedAgent && activeId ? (
              <AgentChatPanel
                key={`${selectedAgent}:${activeId}`}
                agentName={selectedAgent}
                conversationId={activeId}
                userId={user.id}
                initialMessage={pendingInitialMessage}
                initialImages={pendingInitialImages}
                onInitialMessageSent={() => {
                  setPendingInitialMessage(null);
                  setPendingInitialImages(null);
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
                    <p className="empty">Start a conversation</p>
                    <div ref={messagesEndRef} />
                  </div>
                </div>
                <ChatComposer
                  value={input}
                  onChange={setInput}
                  onSend={(payload) => void onSendNewChat(payload)}
                  busy={busy}
                  attachmentsEnabled={false}
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
    </SourcePreviewHostProvider>
  );
}

export { ChatPageContent };

export function ChatPage() {
  return <Navigate to="/agents/playground" replace />;
}
