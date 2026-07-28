import type { Conversation } from '../api/conversations.ts';
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
  return (
    <aside className="history-panel">
      <div className="history-panel-header">
        <span className="history-panel-title">Older</span>
        <button
          type="button"
          className="chat-icon-btn"
          onClick={onClose}
          title="Close history"
          aria-label="Close history"
        >
          <IconClose />
        </button>
      </div>
      <ul className="history-panel-list">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              className={activeId === conversation.id ? 'active' : ''}
              onClick={() => onSelect(conversation.id)}
            >
              <span className="title">{conversation.title ?? 'Untitled'}</span>
              <span className="meta">{new Date(conversation.updatedAt).toLocaleString()}</span>
            </button>
          </li>
        ))}
        {conversations.length === 0 && <li className="empty-item">No recent chats</li>}
      </ul>
    </aside>
  );
}
