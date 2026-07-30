import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
  type KeyboardEvent,
} from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { updateDocumentMetadata } from '../api/documents.ts';
import { iconProps } from './icons/icon-props.ts';

const METADATA_LABELS: Record<string, string> = {
  abstract: 'Abstract',
  author: 'Author',
  publish_date: 'Publish date',
  source: 'Source',
  tags: 'Tags',
  categories: 'Categories',
};

function metadataStringValue(metadata: Record<string, unknown>, key: string): string {
  const raw = metadata[key];
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return '';
}

function metadataListValues(metadata: Record<string, unknown>, key: string): string[] {
  const raw = metadata[key];
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function formStateFromMetadata(metadata: Record<string, unknown>) {
  return {
    abstractValue: metadataStringValue(metadata, 'abstract'),
    authorValue: metadataStringValue(metadata, 'author'),
    publishDateValue: metadataStringValue(metadata, 'publish_date'),
    sourceValue: metadataStringValue(metadata, 'source'),
    tagItems: metadataListValues(metadata, 'tags'),
    categoryItems: metadataListValues(metadata, 'categories'),
  };
}

type SaveState = 'idle' | 'saving' | 'error';

function MetadataBagelsReadonly({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="document-metadata-value-muted">—</span>;
  }

  return (
    <div className="document-metadata-bagels">
      {items.map((item) => (
        <span key={item} className="metadata-bagel" title={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

export type MetadataTagEditorHandle = {
  flushDraft: () => string[];
};

type MetadataTagEditorProps = {
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
};

const MetadataTagEditor = forwardRef<MetadataTagEditorHandle, MetadataTagEditorProps>(
  function MetadataTagEditor({ items, placeholder, onChange }, ref) {
    const [draft, setDraft] = useState('');

    function mergeDraftIntoItems(current: string[], draftText: string): string[] {
      const trimmed = draftText.trim();
      if (!trimmed) return current;
      const next = trimmed
        .split(/[,;]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const merged = [...current];
      for (const item of next) {
        if (!merged.includes(item)) merged.push(item);
      }
      return merged;
    }

    function flushDraft(): string[] {
      const merged = mergeDraftIntoItems(items, draft);
      if (merged.length !== items.length || merged.some((item, index) => item !== items[index])) {
        onChange(merged);
      }
      setDraft('');
      return merged;
    }

    useImperativeHandle(ref, () => ({ flushDraft }), [items, draft, onChange]);

    function removeItem(item: string) {
      onChange(items.filter((entry) => entry !== item));
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        flushDraft();
      }
    }

    return (
      <div className="document-metadata-bagels document-metadata-bagels-editable">
        {items.map((item) => (
          <span key={item} className="metadata-bagel metadata-bagel-editable" title={item}>
            {item}
            <button
              type="button"
              className="metadata-bagel-remove"
              onClick={() => removeItem(item)}
              aria-label={`Remove ${item}`}
            >
              <X {...iconProps({ size: 12 })} aria-hidden />
            </button>
          </span>
        ))}
        <input
          type="text"
          className="document-metadata-tag-input"
          value={draft}
          placeholder={items.length === 0 ? placeholder : 'Add…'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => flushDraft()}
        />
      </div>
    );
  },
);

type DocumentMetadataBarProps = {
  documentId: string;
  metadata: Record<string, unknown>;
  onMetadataChange?: (metadata: Record<string, unknown>) => void;
};

export function DocumentMetadataBar({ documentId, metadata, onMetadataChange }: DocumentMetadataBarProps) {
  const saveRequestIdRef = useRef(0);
  const categoryEditorRef = useRef<MetadataTagEditorHandle>(null);
  const tagEditorRef = useRef<MetadataTagEditorHandle>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [abstractValue, setAbstractValue] = useState(() => metadataStringValue(metadata, 'abstract'));
  const [authorValue, setAuthorValue] = useState(() => metadataStringValue(metadata, 'author'));
  const [publishDateValue, setPublishDateValue] = useState(() => metadataStringValue(metadata, 'publish_date'));
  const [sourceValue, setSourceValue] = useState(() => metadataStringValue(metadata, 'source'));
  const [tagItems, setTagItems] = useState(() => metadataListValues(metadata, 'tags'));
  const [categoryItems, setCategoryItems] = useState(() => metadataListValues(metadata, 'categories'));

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');

  const resetForm = useCallback((source: Record<string, unknown>) => {
    const next = formStateFromMetadata(source);
    setAbstractValue(next.abstractValue);
    setAuthorValue(next.authorValue);
    setPublishDateValue(next.publishDateValue);
    setSourceValue(next.sourceValue);
    setTagItems(next.tagItems);
    setCategoryItems(next.categoryItems);
  }, []);

  useEffect(() => {
    if (isEditing) return;
    resetForm(metadata);
  }, [metadata, isEditing, resetForm]);

  const persistMetadata = useCallback(
    async (patch: Record<string, unknown>) => {
      const requestId = ++saveRequestIdRef.current;
      setSaveState('saving');
      setSaveError('');
      try {
        const result = await updateDocumentMetadata(documentId, patch);
        if (saveRequestIdRef.current !== requestId) return;
        onMetadataChange?.(result.metadata);
        setSaveState('idle');
        setIsEditing(false);
      } catch (error) {
        if (saveRequestIdRef.current !== requestId) return;
        setSaveState('error');
        setSaveError(error instanceof Error ? error.message : 'Failed to save metadata');
      }
    },
    [documentId, onMetadataChange],
  );

  function handleStartEdit() {
    setSaveState('idle');
    setSaveError('');
    setIsEditing(true);
  }

  function handleCancelEdit() {
    resetForm(metadata);
    setSaveState('idle');
    setSaveError('');
    setIsEditing(false);
  }

  function handleSave() {
    const categories = categoryEditorRef.current?.flushDraft() ?? categoryItems;
    const tags = tagEditorRef.current?.flushDraft() ?? tagItems;

    void persistMetadata({
      abstract: abstractValue,
      author: authorValue,
      publish_date: publishDateValue,
      source: sourceValue,
      categories,
      tags,
    });
  }

  const saving = saveState === 'saving';

  return (
    <section
      className={`document-metadata-panel${isEditing ? ' document-metadata-panel-editing' : ''}`}
      aria-label="Document metadata"
    >
      <div className="document-metadata-actions">
        {!isEditing ? (
          <button
            type="button"
            className="icon-btn"
            title="Edit metadata"
            aria-label="Edit metadata"
            onClick={handleStartEdit}
          >
            <Pencil {...iconProps({ size: 16 })} aria-hidden />
          </button>
        ) : (
          <>
            <button
              type="button"
              className="icon-btn document-metadata-save-btn"
              title="Save metadata"
              aria-label="Save metadata"
              onClick={handleSave}
              disabled={saving}
            >
              <Save {...iconProps({ size: 16 })} aria-hidden />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Cancel editing"
              aria-label="Cancel editing"
              onClick={handleCancelEdit}
              disabled={saving}
            >
              <X {...iconProps({ size: 16 })} aria-hidden />
            </button>
          </>
        )}
      </div>

      {saveState === 'error' && saveError ? (
        <div className="document-metadata-save-hint document-metadata-save-hint-error" role="alert">
          {saveError}
        </div>
      ) : saving ? (
        <div className="document-metadata-save-hint" role="status">Saving…</div>
      ) : null}

      <div className="document-metadata-row document-metadata-row-abstract">
        <span className="document-metadata-key document-metadata-section-key">
          {METADATA_LABELS.abstract}
        </span>
        {isEditing ? (
          <textarea
            className="document-metadata-textarea"
            value={abstractValue}
            rows={3}
            placeholder="Add an abstract…"
            onChange={(event) => setAbstractValue(event.target.value)}
          />
        ) : (
          <div
            className="document-metadata-abstract-value document-metadata-readonly-value"
            title={abstractValue}
          >
            {abstractValue.trim() || '—'}
          </div>
        )}
      </div>

      <div className="document-metadata-row document-metadata-row-inline">
        <div className="document-metadata-inline-item">
          <span className="document-metadata-key">{METADATA_LABELS.author}</span>
          {isEditing ? (
            <input
              type="text"
              className="document-metadata-input"
              value={authorValue}
              placeholder="—"
              onChange={(event) => setAuthorValue(event.target.value)}
            />
          ) : (
            <span className="document-metadata-inline-value" title={authorValue}>
              {authorValue.trim() || '—'}
            </span>
          )}
        </div>
        <div className="document-metadata-inline-item">
          <span className="document-metadata-key">{METADATA_LABELS.publish_date}</span>
          {isEditing ? (
            <input
              type="text"
              className="document-metadata-input"
              value={publishDateValue}
              placeholder="—"
              onChange={(event) => setPublishDateValue(event.target.value)}
            />
          ) : (
            <span className="document-metadata-inline-value" title={publishDateValue}>
              {publishDateValue.trim() || '—'}
            </span>
          )}
        </div>
        <div className="document-metadata-inline-item">
          <span className="document-metadata-key">{METADATA_LABELS.source}</span>
          {isEditing ? (
            <input
              type="text"
              className="document-metadata-input"
              value={sourceValue}
              placeholder="—"
              onChange={(event) => setSourceValue(event.target.value)}
            />
          ) : (
            <span className="document-metadata-inline-value" title={sourceValue}>
              {sourceValue.trim() || '—'}
            </span>
          )}
        </div>
      </div>

      <div className="document-metadata-row document-metadata-row-bagel">
        <span className="document-metadata-key document-metadata-section-key">Categories</span>
        {isEditing ? (
          <MetadataTagEditor
            ref={categoryEditorRef}
            items={categoryItems}
            placeholder="Add categories…"
            onChange={setCategoryItems}
          />
        ) : (
          <MetadataBagelsReadonly items={categoryItems} />
        )}
      </div>

      <div className="document-metadata-row document-metadata-row-bagel">
        <span className="document-metadata-key document-metadata-section-key">Tags</span>
        {isEditing ? (
          <MetadataTagEditor
            ref={tagEditorRef}
            items={tagItems}
            placeholder="Add tags…"
            onChange={setTagItems}
          />
        ) : (
          <MetadataBagelsReadonly items={tagItems} />
        )}
      </div>
    </section>
  );
}
