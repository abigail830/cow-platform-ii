import { useMemo } from 'react';
import type { Conversation } from '../api/conversations.ts';
import { groupConversationsByRecency } from '../chat/groupConversationsByRecency.ts';
import { IconClose } from './icons/ChatIcons.tsx';

type ChatHistoryPanelProps = {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function ChatHistoryPanel({
  conversations,
  activeId,
  onSelect,
  onClose,
}: ChatHistoryPanelProps) {
  const groups = useMemo(() => groupConversationsByRecency(conversations), [conversations]);

  return (
    <aside className="history-panel">
      <div className="history-panel-header">
        <button
          type="button"
          className="chat-icon-btn history-panel-close"
          onClick={onClose}
          title="Close history"
          aria-label="Close history"
        >
          <IconClose />
        </button>
      </div>
      <div className="history-panel-body">
        {groups.length === 0 ? (
          <p className="history-panel-empty">No recent chats</p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="history-panel-section">
              <h3 className="history-panel-section-label">{group.label}</h3>
              <ul className="history-panel-list">
                {group.conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      className={activeId === conversation.id ? 'active' : ''}
                      onClick={() => onSelect(conversation.id)}
                    >
                      <span className="title">{conversation.title ?? 'Untitled'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
