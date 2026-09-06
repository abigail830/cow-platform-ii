import { ChevronDown, ChevronRight, Folder, Plus, Settings, Trash2 } from 'lucide-react';
import type { DocumentChannel } from '../api/documentChannels.ts';
import type { ChannelKnowledgeItem } from '../api/documents.ts';
import { KnowledgeFileTypeIcon } from './icons/file-type-icon.tsx';
import { iconProps } from './icons/icon-props.ts';

export type KnowledgeTreeSelection =
  | { type: 'channel'; channelId: string }
  | { type: 'item'; item: ChannelKnowledgeItem };

function channelCanManage(channel: DocumentChannel): boolean {
  return Boolean(channel.my_access?.manage);
}

function channelCanWrite(channel: DocumentChannel): boolean {
  return Boolean(channel.my_access?.write);
}

function itemDisplayName(item: ChannelKnowledgeItem): string {
  return item.title || item.name;
}

function ItemIcon({ item }: { item: ChannelKnowledgeItem }) {
  return (
    <KnowledgeFileTypeIcon
      className="knowledge-tree-icon"
      filename={item.title || item.name}
      inputMode={item.input_mode}
    />
  );
}

type KnowledgeChannelTreePanelProps = {
  channels: DocumentChannel[];
  selection: KnowledgeTreeSelection | null;
  expandedChannelIds: ReadonlySet<string>;
  channelItems: Readonly<Record<string, ChannelKnowledgeItem[]>>;
  loadingChannelIds: ReadonlySet<string>;
  canCreateRoot: boolean;
  emptyMessage?: string;
  onToggleExpand: (channelId: string) => void;
  onSelectChannel: (channelId: string) => void;
  onSelectItem: (item: ChannelKnowledgeItem) => void;
  onDeleteItem: (item: ChannelKnowledgeItem) => void;
  onCreateRoot: () => void;
  onCreateChild: (parentId: string) => void;
  onSettings: (channel: DocumentChannel) => void;
  onDeleteChannel: (channel: DocumentChannel) => void;
};

function ChannelTreeBranch({
  channel,
  depth,
  selection,
  expandedChannelIds,
  channelItems,
  loadingChannelIds,
  onToggleExpand,
  onSelectChannel,
  onSelectItem,
  onDeleteItem,
  onCreateChild,
  onSettings,
  onDeleteChannel,
}: {
  channel: DocumentChannel;
  depth: number;
  selection: KnowledgeTreeSelection | null;
  expandedChannelIds: ReadonlySet<string>;
  channelItems: Readonly<Record<string, ChannelKnowledgeItem[]>>;
  loadingChannelIds: ReadonlySet<string>;
  onToggleExpand: (channelId: string) => void;
  onSelectChannel: (channelId: string) => void;
  onSelectItem: (item: ChannelKnowledgeItem) => void;
  onDeleteItem: (item: ChannelKnowledgeItem) => void;
  onCreateChild: (parentId: string) => void;
  onSettings: (channel: DocumentChannel) => void;
  onDeleteChannel: (channel: DocumentChannel) => void;
}) {
  const expanded = expandedChannelIds.has(channel.id);
  const hasChildChannels = channel.children.length > 0;
  const items = channelItems[channel.id] ?? [];
  const loadingItems = loadingChannelIds.has(channel.id);
  const channelActive =
    selection?.type === 'channel' && selection.channelId === channel.id;
  const canManage = channelCanManage(channel);
  const canWrite = channelCanWrite(channel);

  return (
    <li className="knowledge-tree-node">
      <div
        className={`knowledge-tree-row knowledge-tree-folder-row${channelActive ? ' active' : ''}`}
        style={{ ['--knowledge-tree-depth' as string]: String(depth) }}
      >
        <button
          type="button"
          className="knowledge-tree-chevron"
          aria-label={expanded ? `Collapse ${channel.name}` : `Expand ${channel.name}`}
          aria-expanded={expanded}
          onClick={() => onToggleExpand(channel.id)}
        >
          {expanded ? (
            <ChevronDown {...iconProps({ size: 14 })} />
          ) : (
            <ChevronRight {...iconProps({ size: 14 })} />
          )}
        </button>
        <button
          type="button"
          className="knowledge-tree-select"
          onClick={() => onSelectChannel(channel.id)}
        >
          <Folder {...iconProps({ className: 'knowledge-tree-icon' })} />
          <span
            className={`knowledge-tree-label${depth === 0 ? ' knowledge-tree-label-root' : ''}`}
            title={channel.name}
          >
            {channel.name}
          </span>
        </button>
        {canManage && (
          <div className="knowledge-tree-actions">
            <button
              type="button"
              className="icon-btn"
              title="Add sub-channel"
              onClick={() => onCreateChild(channel.id)}
            >
              <Plus {...iconProps()} />
            </button>
            <button type="button" className="icon-btn" title="Settings" onClick={() => onSettings(channel)}>
              <Settings {...iconProps()} />
            </button>
            <button
              type="button"
              className="icon-btn danger"
              title="Delete channel"
              onClick={() => onDeleteChannel(channel)}
            >
              <Trash2 {...iconProps()} />
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <ul className="knowledge-tree-children">
          {loadingItems && items.length === 0 && !hasChildChannels ? (
            <li className="knowledge-tree-loading" style={{ ['--knowledge-tree-depth' as string]: String(depth + 1) }}>
              Loading…
            </li>
          ) : null}
          {channel.children.map((child) => (
            <ChannelTreeBranch
              key={child.id}
              channel={child}
              depth={depth + 1}
              selection={selection}
              expandedChannelIds={expandedChannelIds}
              channelItems={channelItems}
              loadingChannelIds={loadingChannelIds}
              onToggleExpand={onToggleExpand}
              onSelectChannel={onSelectChannel}
              onSelectItem={onSelectItem}
              onDeleteItem={onDeleteItem}
              onCreateChild={onCreateChild}
              onSettings={onSettings}
              onDeleteChannel={onDeleteChannel}
            />
          ))}
          {loadingItems && items.length === 0 && hasChildChannels ? (
            <li className="knowledge-tree-loading" style={{ ['--knowledge-tree-depth' as string]: String(depth + 1) }}>
              Loading…
            </li>
          ) : null}
          {items.map((item) => {
            const itemActive =
              selection?.type === 'item' &&
              selection.item.kind === item.kind &&
              selection.item.id === item.id;
            const name = itemDisplayName(item);
            return (
              <li key={`${item.kind}-${item.id}`} className="knowledge-tree-node">
                <div
                  className={`knowledge-tree-row knowledge-tree-file-row${itemActive ? ' active' : ''}`}
                  style={{ ['--knowledge-tree-depth' as string]: String(depth + 1) }}
                >
                  <span className="knowledge-tree-chevron is-placeholder" aria-hidden>
                    <span className="knowledge-tree-chevron-spacer" />
                  </span>
                  <button type="button" className="knowledge-tree-select" onClick={() => onSelectItem(item)}>
                    <ItemIcon item={item} />
                    <span className="knowledge-tree-label" title={name}>
                      {name}
                    </span>
                  </button>
                  {canWrite ? (
                    <div className="knowledge-tree-actions">
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (window.confirm(`Delete "${name}"?`)) {
                            onDeleteItem(item);
                          }
                        }}
                      >
                        <Trash2 {...iconProps()} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function KnowledgeChannelTreePanel({
  channels,
  selection,
  expandedChannelIds,
  channelItems,
  loadingChannelIds,
  canCreateRoot,
  emptyMessage = 'No channels yet. Create one to organize documents.',
  onToggleExpand,
  onSelectChannel,
  onSelectItem,
  onDeleteItem,
  onCreateRoot,
  onCreateChild,
  onSettings,
  onDeleteChannel,
}: KnowledgeChannelTreePanelProps) {
  return (
    <aside className="documents-channel-panel knowledge-channel-tree-panel">
      <div className="documents-channel-panel-header">
        <h2>Channels</h2>
        {canCreateRoot && (
          <button type="button" className="btn-secondary" onClick={onCreateRoot}>
            + New
          </button>
        )}
      </div>
      {channels.length === 0 ? (
        <p className="documents-channel-empty">{emptyMessage}</p>
      ) : (
        <ul className="knowledge-tree-list root">
          {channels.map((channel) => (
            <ChannelTreeBranch
              key={channel.id}
              channel={channel}
              depth={0}
              selection={selection}
              expandedChannelIds={expandedChannelIds}
              channelItems={channelItems}
              loadingChannelIds={loadingChannelIds}
              onToggleExpand={onToggleExpand}
              onSelectChannel={onSelectChannel}
              onSelectItem={onSelectItem}
              onDeleteItem={onDeleteItem}
              onCreateChild={onCreateChild}
              onSettings={onSettings}
              onDeleteChannel={onDeleteChannel}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}
