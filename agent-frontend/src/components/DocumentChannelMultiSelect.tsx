import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Folder, Search, X } from 'lucide-react';
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

export function DocumentChannelMultiSelect({
  channels,
  selectedIds,
  onChange,
  disabled = false,
  embedded = false,
}: DocumentChannelMultiSelectProps) {
  const [open, setOpen] = useState(embedded);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => buildChannelOptions(channels), [channels]);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter(
      (option) =>
        option.name.toLowerCase().includes(query) || option.path.toLowerCase().includes(query),
    );
  }, [options, search]);

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

  function toggleOption(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  const panel = (
    <div className={`audio-channel-multi-select-panel${embedded ? ' embedded' : ''}`}>
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
      <ul className="audio-channel-multi-select-list" role="listbox" aria-multiselectable="true">
        {filteredOptions.length === 0 ? (
          <li className="audio-channel-multi-select-empty">No channels match</li>
        ) : (
          filteredOptions.map((option) => {
            const selected = selectedIds.includes(option.id);
            return (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`audio-channel-multi-select-option${selected ? ' selected' : ''}`}
                  onClick={() => toggleOption(option.id)}
                  disabled={disabled}
                >
                  <span className="audio-channel-multi-select-check" aria-hidden="true">
                    {selected ? <Check {...iconProps({ size: 14 })} /> : null}
                  </span>
                  <Folder {...iconProps({ size: 16, className: 'audio-channel-multi-select-folder' })} />
                  <span className="audio-channel-multi-select-option-text">
                    <span className="audio-channel-multi-select-option-name">{option.name}</span>
                    <span className="audio-channel-multi-select-option-path">{option.path}</span>
                  </span>
                </button>
              </li>
            );
          })
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
        className="audio-channel-multi-select-trigger"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-expanded={open}
      >
        <span>{selectionLabel(selectedIds, options)}</span>
        <ChevronDown {...iconProps({ size: 16, className: 'audio-channel-multi-select-chevron' })} />
      </button>
      {open ? panel : null}
      {selectedIds.length > 0 ? (
        <div className="audio-channel-multi-select-tags">
          {selectedIds.map((id) => (
            <span key={id} className="audio-channel-multi-select-tag">
              {documentChannelLabel(channels, id)}
              <button
                type="button"
                aria-label={`Remove ${documentChannelLabel(channels, id)}`}
                onClick={() => toggleOption(id)}
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
