import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Folder, Minus, Search, X } from 'lucide-react';
import { flattenChannels, type DocumentChannel } from '../api/documentChannels.ts';
import { iconProps } from './icons/icon-props.ts';

type DocumentChannelMultiSelectProps = {
  channels: DocumentChannel[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Inline panel for modals — avoids clipped popover dropdowns. */
  embedded?: boolean;
};

type ChannelOption = {
  id: string;
  name: string;
  path: string;
};

function buildChannelOptions(channels: DocumentChannel[]): ChannelOption[] {
  const flat = flattenChannels(channels);
  const byId = new Map(flat.map((channel) => [channel.id, channel]));

  function pathFor(id: string): string {
    const parts: string[] = [];
    let current = byId.get(id);
    while (current) {
      parts.unshift(current.name);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return parts.join(' / ');
  }

  return flat
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      path: pathFor(channel.id),
    }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
}

function collectSubtreeIds(channel: DocumentChannel): string[] {
  const ids = [channel.id];
  for (const child of channel.children) {
    ids.push(...collectSubtreeIds(child));
  }
  return ids;
}

type SelectionState = 'none' | 'partial' | 'full';

function getSelectionState(channel: DocumentChannel, selectedSet: Set<string>): SelectionState {
  const subtree = collectSubtreeIds(channel);
  let selectedCount = 0;
  for (const id of subtree) {
    if (selectedSet.has(id)) selectedCount++;
  }
  if (selectedCount === 0) return 'none';
  if (selectedCount === subtree.length) return 'full';
  return 'partial';
}

function filterChannelTree(
  nodes: DocumentChannel[],
  query: string,
): { nodes: DocumentChannel[]; expandIds: Set<string> } {
  const q = query.trim().toLowerCase();
  if (!q) return { nodes, expandIds: new Set() };

  const expandIds = new Set<string>();

  function walk(items: DocumentChannel[]): DocumentChannel[] {
    const result: DocumentChannel[] = [];
    for (const node of items) {
      const filteredChildren = walk(node.children);
      const nameMatch = node.name.toLowerCase().includes(q);
      if (nameMatch || filteredChildren.length > 0) {
        if (filteredChildren.length > 0) expandIds.add(node.id);
        result.push({
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : node.children,
        });
      }
    }
    return result;
  }

  return { nodes: walk(nodes), expandIds };
}

function selectionLabel(selectedIds: string[], options: ChannelOption[]): string {
  if (selectedIds.length === 0) return 'Select document channels…';
  if (selectedIds.length === 1) {
    const option = options.find((item) => item.id === selectedIds[0]);
    return option?.name ?? '1 channel';
  }
  return `${selectedIds.length} channels selected`;
}

export function documentChannelLabel(channels: DocumentChannel[], id: string): string {
  const options = buildChannelOptions(channels);
  return options.find((option) => option.id === id)?.path ?? id;
}

function ChannelTreeNode({
  channel,
  depth,
  selectedSet,
  expandedIds,
  onToggleExpand,
  onToggleSelect,
  disabled,
}: {
  channel: DocumentChannel;
  depth: number;
  selectedSet: Set<string>;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (channel: DocumentChannel) => void;
  disabled: boolean;
}) {
  const hasChildren = channel.children.length > 0;
  const expanded = expandedIds.has(channel.id);
  const state = getSelectionState(channel, selectedSet);

  return (
    <li className="audio-channel-tree-node">
      <div
        className={`audio-channel-tree-row${state !== 'none' ? ' selected' : ''}${state === 'partial' ? ' partial' : ''}`}
        style={{ ['--audio-channel-tree-depth' as string]: String(depth) }}
      >
        <button
          type="button"
          className="audio-channel-tree-chevron"
          aria-label={expanded ? `Collapse ${channel.name}` : `Expand ${channel.name}`}
          aria-expanded={hasChildren ? expanded : undefined}
          disabled={!hasChildren || disabled}
          onClick={() => onToggleExpand(channel.id)}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown {...iconProps({ size: 14 })} />
            ) : (
              <ChevronRight {...iconProps({ size: 14 })} />
            )
          ) : (
            <span className="audio-channel-tree-chevron-spacer" aria-hidden />
          )}
        </button>
        <button
          type="button"
          className="audio-channel-tree-select"
          role="option"
          aria-selected={state === 'full'}
          disabled={disabled}
          onClick={() => onToggleSelect(channel)}
        >
          <span className="audio-channel-tree-check" aria-hidden="true">
            {state === 'full' ? (
              <Check {...iconProps({ size: 14 })} />
            ) : state === 'partial' ? (
              <Minus {...iconProps({ size: 14 })} />
            ) : null}
          </span>
          <Folder {...iconProps({ size: 16, className: 'audio-channel-tree-folder' })} />
          <span className="audio-channel-tree-label">{channel.name}</span>
        </button>
      </div>
      {hasChildren && expanded ? (
        <ul className="audio-channel-tree-children">
          {channel.children.map((child) => (
            <ChannelTreeNode
              key={child.id}
              channel={child}
              depth={depth + 1}
              selectedSet={selectedSet}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
              disabled={disabled}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function DocumentChannelMultiSelect({
  channels,
  selectedIds,
  onChange,
  disabled = false,
  embedded = false,
}: DocumentChannelMultiSelectProps) {
  const [open, setOpen] = useState(embedded);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => buildChannelOptions(channels), [channels]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const { nodes: displayChannels, expandIds: searchExpandIds } = useMemo(
    () => filterChannelTree(channels, search),
    [channels, search],
  );

  const effectiveExpandedIds = useMemo(() => {
    if (!search.trim()) return expandedIds;
    return new Set([...expandedIds, ...searchExpandIds]);
  }, [expandedIds, search, searchExpandIds]);

  useEffect(() => {
    if (embedded || !open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [embedded, open]);

  useEffect(() => {
    if (open && !embedded) searchRef.current?.focus();
  }, [embedded, open]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(channel: DocumentChannel) {
    const subtree = collectSubtreeIds(channel);
    const state = getSelectionState(channel, selectedSet);
    if (state === 'full') {
      const remove = new Set(subtree);
      onChange(selectedIds.filter((id) => !remove.has(id)));
      return;
    }
    onChange([...new Set([...selectedIds, ...subtree])]);
  }

  const panel = (
    <div className={`audio-channel-multi-select-menu${embedded ? ' embedded' : ''}`}>
      <div className="audio-channel-multi-select-search">
        <Search {...iconProps({ size: 16, className: 'audio-channel-multi-select-search-icon' })} />
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search channels…"
          disabled={disabled}
        />
      </div>
      <ul
        className="audio-channel-multi-select-options audio-channel-tree-list root"
        role="listbox"
        aria-multiselectable="true"
      >
        {displayChannels.length === 0 ? (
          <li className="audio-channel-multi-select-empty">No channels match</li>
        ) : (
          displayChannels.map((channel) => (
            <ChannelTreeNode
              key={channel.id}
              channel={channel}
              depth={0}
              selectedSet={selectedSet}
              expandedIds={effectiveExpandedIds}
              onToggleExpand={toggleExpand}
              onToggleSelect={toggleSelect}
              disabled={disabled}
            />
          ))
        )}
      </ul>
    </div>
  );

  if (embedded) {
    return <div className="audio-channel-multi-select embedded">{panel}</div>;
  }

  return (
    <div className="audio-channel-multi-select" ref={rootRef}>
      <button
        type="button"
        className={`audio-channel-multi-select-trigger${open ? ' open' : ''}${selectedIds.length > 0 ? ' has-selection' : ''}`}
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-expanded={open}
      >
        <span className="audio-channel-multi-select-label">{selectionLabel(selectedIds, options)}</span>
        <ChevronDown {...iconProps({ size: 16, className: 'audio-channel-multi-select-chevron' })} />
      </button>
      {open ? panel : null}
      {selectedIds.length > 0 ? (
        <div className="audio-channel-multi-select-chips">
          {selectedIds.map((id) => (
            <span key={id} className="audio-channel-multi-select-chip">
              <span className="audio-channel-multi-select-chip-label">
                {documentChannelLabel(channels, id)}
              </span>
              <button
                type="button"
                className="audio-channel-multi-select-chip-remove"
                aria-label={`Remove ${documentChannelLabel(channels, id)}`}
                onClick={() => onChange(selectedIds.filter((item) => item !== id))}
                disabled={disabled}
              >
                <X {...iconProps({ size: 12 })} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
