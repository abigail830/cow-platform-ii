import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Mic, Search, X } from 'lucide-react';
import {
  flattenAudioChannels,
  type AudioChannel,
} from '../api/audioChannels.ts';
import { iconProps } from './icons/icon-props.ts';

type AudioChannelMultiSelectProps = {
  channels: AudioChannel[];
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

function buildChannelOptions(channels: AudioChannel[]): ChannelOption[] {
  const flat = flattenAudioChannels(channels);
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
  if (selectedIds.length === 0) return 'Select audio channels…';
  if (selectedIds.length === 1) {
    const option = options.find((item) => item.id === selectedIds[0]);
    return option?.name ?? '1 channel';
  }
  return `${selectedIds.length} channels selected`;
}

export function audioChannelLabel(channels: AudioChannel[], id: string): string {
  const options = buildChannelOptions(channels);
  return options.find((option) => option.id === id)?.path ?? id;
}

export function AudioChannelMultiSelect({
  channels,
  selectedIds,
  onChange,
  disabled = false,
  embedded = false,
}: AudioChannelMultiSelectProps) {
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

  const selectedOptions = useMemo(
    () => options.filter((option) => selectedIds.includes(option.id)),
    [options, selectedIds],
  );

  const menuOpen = embedded || open;

  useEffect(() => {
    if (!menuOpen) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    if (embedded) {
      return () => window.clearTimeout(timer);
    }
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [embedded, menuOpen]);

  function toggleChannel(id: string) {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id],
    );
  }

  function removeChannel(id: string) {
    onChange(selectedIds.filter((item) => item !== id));
  }

  if (options.length === 0) {
    return <p className="admin-form-hint">No audio channels yet.</p>;
  }

  return (
    <div
      className={`audio-channel-multi-select${embedded ? ' embedded' : ''}`}
      ref={rootRef}
    >
      {!embedded ? (
        <button
          type="button"
          className={`audio-channel-multi-select-trigger${open ? ' open' : ''}${selectedIds.length > 0 ? ' has-selection' : ''}`}
          onClick={() => setOpen((value) => !value)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Select audio channels"
        >
          <Mic {...iconProps({ size: 16 })} aria-hidden />
          <span className="audio-channel-multi-select-label">
            {selectionLabel(selectedIds, options)}
          </span>
          <ChevronDown
            {...iconProps({ size: 16, className: 'audio-channel-multi-select-chevron' })}
            aria-hidden
          />
        </button>
      ) : null}

      {selectedOptions.length > 0 ? (
        <div className="audio-channel-multi-select-chips capability-list">
          {selectedOptions.map((option) => (
            <span key={option.id} className="capability-pill audio-channel-multi-select-chip">
              <span className="audio-channel-multi-select-chip-label">{option.path}</span>
              <button
                type="button"
                className="audio-channel-multi-select-chip-remove"
                aria-label={`Remove ${option.path}`}
                onClick={() => removeChannel(option.id)}
                disabled={disabled}
              >
                <X {...iconProps({ size: 12 })} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : embedded ? (
        <p className="admin-form-hint audio-channel-multi-select-empty-hint">
          No channels selected yet.
        </p>
      ) : null}

      {menuOpen ? (
        <div className="audio-channel-multi-select-menu">
          <div className="audio-channel-multi-select-search admin-search">
            <Search {...iconProps()} aria-hidden />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search channels…"
              aria-label="Search audio channels"
            />
          </div>
          <ul className="audio-channel-multi-select-options" role="listbox" aria-multiselectable="true">
            {filteredOptions.length === 0 ? (
              <li className="audio-channel-multi-select-empty">No channels match your search.</li>
            ) : (
              filteredOptions.map((option) => {
                const checked = selectedIds.includes(option.id);
                const showPath = option.path !== option.name;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      className={`audio-channel-multi-select-option${checked ? ' selected' : ''}`}
                      onClick={() => toggleChannel(option.id)}
                      disabled={disabled}
                    >
                      <span className="audio-channel-multi-select-check" aria-hidden>
                        {checked ? <Check {...iconProps({ size: 14 })} /> : null}
                      </span>
                      <span className="audio-channel-multi-select-option-text">
                        <span className="audio-channel-multi-select-option-name">{option.name}</span>
                        {showPath ? (
                          <span className="audio-channel-multi-select-option-path">{option.path}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
