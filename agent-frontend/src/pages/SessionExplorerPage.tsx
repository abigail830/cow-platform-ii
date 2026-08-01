import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { FlueConversationMessage } from '@flue/react';
import {
  getExplorerSessionMessages,
  listExplorerSessions,
  type ExplorerSession,
} from '../api/session-explorer.ts';
import {
  filterRenderableParts,
  groupConsecutiveMessages,
  mergeAssistantParts,
  partRenderKey,
} from '../chat/groupMessages.ts';
import { MessagePart } from '../chat/MessagePart.tsx';
import { AssistantMessageBubble, UserMessageBubble } from '../components/ChatMessageBubble.tsx';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { getNavPage } from '../shared/admin-nav.ts';
import { canSeeSessionExplorer, isPlatformAdminUser } from '../shared/agent-nav.ts';
import { ChevronRight, Loader2, Search, X } from 'lucide-react';
import { iconProps } from '../components/icons/icon-props.ts';

const PAGE = getNavPage('/agents/session-explorer')!;

function formatInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: formatInputDate(from), to: formatInputDate(to) };
}

function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function sessionTitle(session: ExplorerSession): string {
  return session.title?.trim() || 'Untitled session';
}

function userLabel(session: ExplorerSession): string {
  return session.user.displayName?.trim() || session.user.email;
}

function LoadingState({ label }: { label: string }) {
  return (
    <p className="session-explorer-loading" role="status" aria-live="polite">
      <Loader2 {...iconProps({ size: 18, className: 'session-explorer-loading-icon' })} aria-hidden />
      {label}
    </p>
  );
}

export function SessionExplorerPage() {
  const { user, agents } = useAppOutletContext();
  const defaults = useMemo(() => defaultDateRange(), []);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [sessionIdQuery, setSessionIdQuery] = useState('');
  const [keywordQuery, setKeywordQuery] = useState('');
  const [sessions, setSessions] = useState<ExplorerSession[]>([]);
  const [isAdminView, setIsAdminView] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailSession, setDetailSession] = useState<ExplorerSession | null>(null);
  const [detailMessages, setDetailMessages] = useState<FlueConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const selectedIdRef = useRef<string | null>(null);

  const showAdminFilters = isPlatformAdminUser(user) || isAdminView;
  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('session-explorer-split', 52, {
    minPct: 28,
    maxPct: 72,
  });

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedAgent && agents[0]) {
      setSelectedAgent(agents[0].name);
    }
  }, [agents, selectedAgent]);

  const loadSessions = useCallback(async () => {
    if (!selectedAgent) return;
    setLoading(true);
    setError('');
    try {
      const result = await listExplorerSessions({
        agent: selectedAgent,
        from: fromDate,
        to: toDate,
        sessionId: sessionIdQuery,
        keyword: keywordQuery,
      });
      setSessions(result.sessions);
      setIsAdminView(result.isAdmin);
      const currentSelectedId = selectedIdRef.current;
      if (currentSelectedId && !result.sessions.some((session) => session.id === currentSelectedId)) {
        setSelectedId(null);
        setDetailSession(null);
        setDetailMessages([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sessions';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
        setForbidden(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedAgent, fromDate, toDate, sessionIdQuery, keywordQuery]);

  useEffect(() => {
    if (!selectedAgent || !canSeeSessionExplorer(user)) return;
    void loadSessions();
  }, [loadSessions, selectedAgent, user]);

  useEffect(() => {
    if (!selectedId) {
      setDetailSession(null);
      setDetailMessages([]);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    void getExplorerSessionMessages(selectedId)
      .then((result) => {
        if (cancelled) return;
        setDetailSession(result.session);
        setDetailMessages(result.messages as FlueConversationMessage[]);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const detailRows = useMemo(
    () => groupConsecutiveMessages(detailMessages),
    [detailMessages],
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? null,
    [sessions, selectedId],
  );

  const detailHeaderTitle = detailSession
    ? sessionTitle(detailSession)
    : selectedSession
      ? sessionTitle(selectedSession)
      : 'Session';

  function resetFilters() {
    const range = defaultDateRange();
    setFromDate(range.from);
    setToDate(range.to);
    setSessionIdQuery('');
    setKeywordQuery('');
  }

  const tableColSpan = showAdminFilters ? 6 : 5;

  if (!canSeeSessionExplorer(user)) {
    return <Navigate to="/agents/playground" replace />;
  }

  if (forbidden) {
    return <Navigate to="/agents/playground" replace />;
  }

  return (
    <main className="admin-page session-explorer-page">
      <header className="admin-header">
        <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
        <AdminPageDescription>
          Browse agent conversations by date range. Administrators see all users; agent players see only their own
          sessions.
        </AdminPageDescription>
      </header>

      <div className="session-explorer-toolbar">
        <select
          className="session-explorer-select"
          value={selectedAgent}
          onChange={(event) => setSelectedAgent(event.target.value)}
          aria-label="Agent"
        >
          {agents.map((agent) => (
            <option key={agent.name} value={agent.name}>
              {agent.displayName}
            </option>
          ))}
        </select>

        <div className="session-explorer-date-range">
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            aria-label="From date"
          />
          <span className="session-explorer-date-sep">至</span>
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            aria-label="To date"
          />
        </div>

        <input
          className="session-explorer-input"
          value={sessionIdQuery}
          onChange={(event) => setSessionIdQuery(event.target.value)}
          placeholder="Session ID (独立检索)"
        />

        {showAdminFilters && (
          <input
            className="session-explorer-input"
            value={keywordQuery}
            onChange={(event) => setKeywordQuery(event.target.value)}
            placeholder="关键词 (用户名/邮箱)"
          />
        )}

        <button type="button" className="session-explorer-reset-btn" onClick={resetFilters}>
          重置
        </button>
        <button type="button" className="btn-primary session-explorer-search-btn" onClick={() => void loadSessions()}>
          <Search {...iconProps()} />
          查询
        </button>
      </div>

      {error && <p className="error inline">{error}</p>}

      <div
        ref={containerRef}
        className={`session-explorer-layout${selectedId ? ' has-detail' : ''}`}
        style={
          selectedId
            ? { ['--session-explorer-left-pct' as string]: `${leftPct}%` }
            : undefined
        }
      >
        <div className="session-explorer-list-panel">
          <div className="admin-table-wrap session-explorer-table-wrap">
            <table className="admin-table session-explorer-table">
              <thead>
                <tr>
                  <th className="session-explorer-select-col" aria-label="Select" />
                  <th>Session ID</th>
                  {showAdminFilters && <th>用户</th>}
                  <th>轮次</th>
                  <th>时间</th>
                  <th className="session-explorer-detail-hint-col" aria-label="View detail" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={tableColSpan} className="admin-table-empty session-explorer-table-loading">
                      <LoadingState label="Loading sessions…" />
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={tableColSpan} className="admin-table-empty">
                      No sessions in this range.
                    </td>
                  </tr>
                ) : (
                  sessions.map((session) => {
                    const selected = selectedId === session.id;
                    return (
                      <tr
                        key={session.id}
                        className={selected ? 'session-explorer-row selected' : 'session-explorer-row'}
                        onClick={() => setSelectedId(session.id)}
                      >
                        <td className="session-explorer-select-col">
                          <span className={`session-explorer-radio${selected ? ' checked' : ''}`} aria-hidden />
                        </td>
                        <td className="session-explorer-session-cell">
                          <div className="session-explorer-session-title">{sessionTitle(session)}</div>
                          <div className="session-explorer-session-id">{session.id}</div>
                        </td>
                        {showAdminFilters && (
                          <td className="session-explorer-user-cell">
                            <div>{userLabel(session)}</div>
                            <div className="session-explorer-muted">{session.user.email}</div>
                          </td>
                        )}
                        <td>{session.turnCount}</td>
                        <td>{formatSessionTime(session.updatedAt)}</td>
                        <td className="session-explorer-detail-hint-col" aria-hidden>
                          <ChevronRight {...iconProps()} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedId && (
          <>
            <div
              className="session-explorer-split-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize session list"
              onMouseDown={onHandleMouseDown}
            />
            <aside className="session-explorer-detail-panel">
              <header className="session-explorer-detail-header">
                <div className="session-explorer-detail-header-text">
                  <h2>{detailHeaderTitle}</h2>
                  {selectedId && <p className="session-explorer-detail-session-id">{selectedId}</p>}
                </div>
                <button
                  type="button"
                  className="session-explorer-close-btn"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close session detail"
                >
                  <X {...iconProps()} />
                </button>
              </header>

              <div className="session-explorer-detail-body chat-messages">
                {detailLoading ? (
                  <LoadingState label="Loading conversation…" />
                ) : (
                  <div className="chat-column">
                    {detailRows.map((row) => {
                      if (row.kind === 'user') {
                        return <UserMessageBubble key={row.message.id} message={row.message} />;
                      }

                      const parts = filterRenderableParts(mergeAssistantParts(row.messages));
                      return (
                        <AssistantMessageBubble
                          key={row.messages.map((message) => message.id).join(':') || 'assistant'}
                          messages={row.messages}
                        >
                          {parts.map((part, index) => (
                            <MessagePart key={partRenderKey(part, index)} part={part} />
                          ))}
                        </AssistantMessageBubble>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          </>
        )}
      </div>
    </main>
  );
}
