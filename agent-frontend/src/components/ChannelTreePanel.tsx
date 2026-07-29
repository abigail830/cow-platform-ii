import { Folder, Plus, Settings, Trash2 } from 'lucide-react';
import type { DocumentChannel } from '../api/documentChannels.ts';
import { iconProps } from './icons/icon-props.ts';

type ChannelTreePanelProps = {
  channels: DocumentChannel[];
  selectedId: string | null;
  canWrite: boolean;
  onSelect: (channelId: string) => void;
  onCreateRoot: () => void;
  onCreateChild: (parentId: string) => void;
  onSettings: (channel: DocumentChannel) => void;
  onDelete: (channel: DocumentChannel) => void;
};

function ChannelTreeNode({
  channel,
  depth,
  selectedId,
  canWrite,
  onSelect,
  onCreateChild,
  onSettings,
  onDelete,
}: {
  channel: DocumentChannel;
  depth: number;
  selectedId: string | null;
  canWrite: boolean;
  onSelect: (channelId: string) => void;
  onCreateChild: (parentId: string) => void;
  onSettings: (channel: DocumentChannel) => void;
  onDelete: (channel: DocumentChannel) => void;
}) {
  const active = selectedId === channel.id;

  return (
    <li className="channel-tree-item">
      <div className={`channel-tree-row${active ? ' active' : ''}`} style={{ paddingLeft: `${0.5 + depth * 0.85}rem` }}>
        <button type="button" className="channel-tree-select" onClick={() => onSelect(channel.id)}>
          <Folder {...iconProps({ className: 'storage-icon' })} />
          <span className="channel-tree-name" title={channel.name}>
            {channel.name}
          </span>
        </button>
        {canWrite && (
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
              channel={child}
              depth={depth + 1}
              selectedId={selectedId}
              canWrite={canWrite}
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

export function ChannelTreePanel({
  channels,
  selectedId,
  canWrite,
  onSelect,
  onCreateRoot,
  onCreateChild,
  onSettings,
  onDelete,
}: ChannelTreePanelProps) {
  return (
    <aside className="documents-channel-panel">
      <div className="documents-channel-panel-header">
        <h2>Channels</h2>
        {canWrite && (
          <button type="button" className="btn-secondary" onClick={onCreateRoot}>
            + New
          </button>
        )}
      </div>
      {channels.length === 0 ? (
        <p className="documents-channel-empty">No channels yet. Create one to organize documents.</p>
      ) : (
        <ul className="channel-tree-list root">
          {channels.map((channel) => (
            <ChannelTreeNode
              key={channel.id}
              channel={channel}
              depth={0}
              selectedId={selectedId}
              canWrite={canWrite}
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
