import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Library } from 'lucide-react';
import {
  groupKnowledgeBasesByEmbedding,
  type SearchableKnowledgeBase,
} from '../api/hybridSearch.ts';
import { iconProps } from './icons/icon-props.ts';

type HybridSearchKbMultiSelectProps = {
  knowledgeBases: SearchableKnowledgeBase[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
  disabled?: boolean;
};

function selectionLabel(selectedIds: string[], knowledgeBases: SearchableKnowledgeBase[]): string {
  if (selectedIds.length === 0) return 'Knowledge bases';
  if (selectedIds.length === 1) {
    const kb = knowledgeBases.find((item) => item.id === selectedIds[0]);
    return kb?.name ?? '1 selected';
  }
  return `${selectedIds.length} knowledge bases`;
}

export function HybridSearchKbMultiSelect({
  knowledgeBases,
  selectedIds,
  onChange,
  loading = false,
  disabled = false,
}: HybridSearchKbMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const groupedKbs = useMemo(() => groupKnowledgeBasesByEmbedding(knowledgeBases), [knowledgeBases]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  function toggleKb(id: string) {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id],
    );
  }

  return (
    <div className="hybrid-search-kb-select" ref={rootRef}>
      <button
        type="button"
        className={`hybrid-search-kb-select-trigger${open ? ' open' : ''}${selectedIds.length > 0 ? ' has-selection' : ''}`}
        onClick={() => setOpen((value) => !value)}
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select knowledge bases"
      >
        <Library {...iconProps({ size: 16 })} aria-hidden />
        <span className="hybrid-search-kb-select-label">{selectionLabel(selectedIds, knowledgeBases)}</span>
        <ChevronDown {...iconProps({ size: 16, className: 'hybrid-search-kb-select-chevron' })} aria-hidden />
      </button>

      {open ? (
        <div className="hybrid-search-kb-select-menu" role="listbox" aria-multiselectable="true">
          {loading ? (
            <p className="hybrid-search-kb-select-empty">Loading…</p>
          ) : groupedKbs.length === 0 ? (
            <p className="hybrid-search-kb-select-empty">No searchable knowledge bases.</p>
          ) : (
            groupedKbs.map((group) => (
              <div key={group.embeddingModelConfigId} className="hybrid-search-kb-select-group">
                <p className="hybrid-search-kb-select-group-title">{group.embeddingModelName}</p>
                <ul className="hybrid-search-kb-select-options">
                  {group.items.map((kb) => {
                    const checked = selectedIds.includes(kb.id);
                    return (
                      <li key={kb.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={checked}
                          className={`hybrid-search-kb-select-option${checked ? ' selected' : ''}`}
                          onClick={() => toggleKb(kb.id)}
                        >
                          <span className="hybrid-search-kb-select-check" aria-hidden>
                            {checked ? <Check {...iconProps({ size: 14 })} /> : null}
                          </span>
                          <span className="hybrid-search-kb-select-option-text">
                            <span className="hybrid-search-kb-select-option-name">{kb.name}</span>
                            <span className="hybrid-search-kb-select-option-type">{kb.type}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
