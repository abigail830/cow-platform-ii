import { Folder, Plus, Settings, Trash2 } from 'lucide-react';
import type { ResourcePermissionFlags } from '../api/resourceAccess.ts';
import { iconProps } from './icons/icon-props.ts';

export type ChannelTreeNode = {
  id: string;
  name: string;
  my_access?: ResourcePermissionFlags;
  children: ChannelTreeNode[];
};

function channelCanManage(channel: ChannelTreeNode): boolean {
  return Boolean(channel.my_access?.manage);
}

type ChannelTreePanelProps<T extends ChannelTreeNode> = {
  channels: T[];
  selectedId: string | null;
  canCreateRoot: boolean;
  emptyMessage?: string;
  onSelect: (channelId: string) => void;
  onCreateRoot: () => void;
  onCreateChild: (parentId: string) => void;
  onSettings: (channel: T) => void;
  onDelete: (channel: T) => void;
};

function ChannelTreeNode<T extends ChannelTreeNode>({
  channel,
  depth,
  selectedId,
  canCreateRoot,
  onSelect,
  onCreateChild,
  onSettings,
  onDelete,
}: {
  channel: T;
  depth: number;
  selectedId: string | null;
  canCreateRoot: boolean;
  onSelect: (channelId: string) => void;
  onCreateChild: (parentId: string) => void;
  onSettings: (channel: T) => void;
  onDelete: (channel: T) => void;
}) {
  const active = selectedId === channel.id;
  const canManage = channelCanManage(channel);

  return (
    <li className="channel-tree-item">
      <div className={`channel-tree-row${active ? ' active' : ''}`} style={{ paddingLeft: `${0.5 + depth * 0.85}rem` }}>
        <button type="button" className="channel-tree-select" onClick={() => onSelect(channel.id)}>
          <Folder {...iconProps({ className: 'storage-icon' })} />
          <span className="channel-tree-name" title={channel.name}>
            {channel.name}
          </span>
        </button>
        {canManage && (
          <div className="channel-tree-actions">
            <button type="button" className="icon-btn" title="Add sub-channel" onClick={() => onCreateChild(channel.id)}>
              <Plus {...iconProps()} />
            </button>
            <button type="button" className="icon-btn" title="Settings" onClick={() => onSettings(channel)}>
              <Settings {...iconProps()} />
            </button>
            <button type="button" className="icon-btn danger" title="Delete" onClick={() => onDelete(channel)}>
              <Trash2 {...iconProps()} />
            </button>
          </div>
        )}
      </div>
      {channel.children.length > 0 && (
        <ul className="channel-tree-list">
          {channel.children.map((child) => (
            <ChannelTreeNode
              key={child.id}
              channel={child as T}
              depth={depth + 1}
              selectedId={selectedId}
              canCreateRoot={canCreateRoot}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onSettings={onSettings}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ChannelTreePanel<T extends ChannelTreeNode>({
  channels,
  selectedId,
  canCreateRoot,
  emptyMessage = 'No channels yet. Create one to organize documents.',
  onSelect,
  onCreateRoot,
  onCreateChild,
  onSettings,
  onDelete,
}: ChannelTreePanelProps<T>) {
  return (
    <aside className="documents-channel-panel">
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
        <ul className="channel-tree-list root">
          {channels.map((channel) => (
            <ChannelTreeNode
              key={channel.id}
              channel={channel}
              depth={0}
              selectedId={selectedId}
              canCreateRoot={canCreateRoot}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onSettings={onSettings}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}
