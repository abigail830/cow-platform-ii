import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2, X } from 'lucide-react';
import {
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type UserNotification,
} from '../api/notifications.ts';
import { retryKbFolderSync } from '../api/knowledgeBases.ts';
import { iconProps } from './icons/icon-props.ts';

type NotificationPanelProps = {
  onNavigate: (path: string) => void;
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export function NotificationPanel({ onNavigate }: NotificationPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await listNotifications({ limit: 30 });
      setItems(result.items);
      setUnreadCount(result.unread_count);
    } catch {
      // Ignore — bell stays empty on auth errors during logout.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open]);

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

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    await load();
  }

  async function handleDismiss(id: string) {
    await dismissNotification(id);
    await load();
  }

  async function handleAction(notification: UserNotification, actionIndex: number) {
    const action = notification.actions[actionIndex];
    if (!action) return;

    setActionId(notification.id);
    try {
      if (!notification.read_at) {
        await markNotificationRead(notification.id);
      }

      if (action.type === 'navigate' && typeof action.payload.path === 'string') {
        setOpen(false);
        onNavigate(action.payload.path);
      } else if (action.type === 'retry_folder_sync') {
        const kbId = action.payload.knowledge_base_id;
        const docIds = action.payload.document_ids;
        if (typeof kbId === 'string') {
          await retryKbFolderSync(
            kbId,
            Array.isArray(docIds) ? docIds.filter((id): id is string => typeof id === 'string') : undefined,
          );
          setOpen(false);
          onNavigate(`/knowledge/knowledge-bases/${kbId}`);
        }
      }
      await load();
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="topbar-notifications-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`topbar-notifications-btn${open ? ' active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell {...iconProps({ size: 18 })} aria-hidden />
        {unreadCount > 0 && (
          <span className="topbar-notifications-badge" aria-hidden>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="topbar-notifications-panel" role="dialog" aria-label="Notifications">
          <div className="topbar-notifications-header">
            <strong>Notifications</strong>
            <div className="topbar-notifications-header-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="topbar-notifications-mark-all"
                  onClick={() => void handleMarkAllRead()}
                >
                  <CheckCheck {...iconProps({ size: 14 })} aria-hidden />
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {loading && items.length === 0 ? (
            <p className="topbar-notifications-empty" role="status">
              <Loader2 {...iconProps({ size: 16, className: 'icon-btn-spin' })} aria-hidden />
              Loading…
            </p>
          ) : items.length === 0 ? (
            <p className="topbar-notifications-empty">No notifications</p>
          ) : (
            <ul className="topbar-notifications-list">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`topbar-notification-item${item.read_at ? '' : ' unread'} severity-${item.severity}`}
                >
                  <div className="topbar-notification-main">
                    <div className="topbar-notification-title">{item.title}</div>
                    <div className="topbar-notification-body">{item.body}</div>
                    <div className="topbar-notification-meta">{formatWhen(item.created_at)}</div>
                    {item.actions.length > 0 && (
                      <div className="topbar-notification-actions">
                        {item.actions.map((action, index) => (
                          <button
                            key={`${item.id}-${index}`}
                            type="button"
                            className="btn-secondary btn-compact"
                            disabled={actionId === item.id}
                            onClick={() => void handleAction(item, index)}
                          >
                            {actionId === item.id ? (
                              <Loader2 {...iconProps({ size: 14, className: 'icon-btn-spin' })} aria-hidden />
                            ) : null}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="topbar-notification-dismiss"
                    aria-label="Dismiss notification"
                    onClick={() => void handleDismiss(item.id)}
                  >
                    <X {...iconProps({ size: 14 })} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
