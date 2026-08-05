import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  buildChannelTree,
  collectDescendantChannelIds,
  fetchImportSources,
  type ImportSourceChannel,
  type ImportSourceChannelNode,
  type ImportSourceDocument,
} from '../api/knowledgeBases.ts';
import { iconProps } from './icons/icon-props.ts';

type KbImportModalProps = {
  title?: string;
  confirmLabel?: string;
  /** Document IDs already in this KB — shown checked + disabled, excluded from new import. */
  importedDocumentIds?: Iterable<string>;
  onCancel: () => void;
  onConfirm: (input: { channelIds: string[]; documentIds: string[] }) => Promise<void>;
};

function ChannelTreeNode({
  node,
  depth,
  ancestorChannelSelected,
  selectedChannelIds,
  selectedDocumentIds,
  importedDocumentIds,
  expandedChannelIds,
  documentsByChannel,
  flatChannels,
  onToggleChannel,
  onToggleDocument,
  onToggleExpand,
}: {
  node: ImportSourceChannelNode;
  depth: number;
  ancestorChannelSelected: boolean;
  selectedChannelIds: Set<string>;
  selectedDocumentIds: Set<string>;
  importedDocumentIds: Set<string>;
  expandedChannelIds: Set<string>;
  documentsByChannel: Record<string, ImportSourceDocument[]>;
  flatChannels: ImportSourceChannel[];
  onToggleChannel: (id: string, checked: boolean) => void;
  onToggleDocument: (id: string, checked: boolean) => void;
  onToggleExpand: (id: string) => void;
}) {
  const docs = documentsByChannel[node.id] ?? [];
  const channelDirectlySelected = selectedChannelIds.has(node.id);
  const channelEffectivelySelected = channelDirectlySelected || ancestorChannelSelected;
  const expanded = expandedChannelIds.has(node.id);
  const hasChildren = node.children.length > 0 || docs.length > 0;

  const subtreeDocIds = useMemo(() => {
    const ids = new Set<string>();
    const channelIds = collectDescendantChannelIds(node.id, flatChannels);
    channelIds.add(node.id);
    for (const cid of channelIds) {
      for (const doc of documentsByChannel[cid] ?? []) {
        ids.add(doc.id);
      }
    }
    return ids;
  }, [node.id, flatChannels, documentsByChannel]);

  const subtreeHasDocs = subtreeDocIds.size > 0;
  const subtreeAllImported =
    subtreeHasDocs && [...subtreeDocIds].every((id) => importedDocumentIds.has(id));
  const channelLocked = ancestorChannelSelected || subtreeAllImported;

  return (
    <div className="kb-import-channel" style={{ paddingLeft: `${depth * 12}px` }}>
      <div
        className={`kb-import-row kb-import-channel-row${channelEffectivelySelected && !channelDirectlySelected && !subtreeAllImported ? ' kb-import-row-inherited' : ''}${subtreeAllImported ? ' kb-import-row-imported' : ''}`}
      >
        {hasChildren ? (
          <button
            type="button"
            className={`kb-import-expand-btn${expanded ? ' expanded' : ''}`}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={() => onToggleExpand(node.id)}
          >
            <ChevronRight {...iconProps({ size: 14 })} />
          </button>
        ) : (
          <span className="kb-import-expand-spacer" aria-hidden />
        )}
        <label className="kb-import-channel-label">
          <input
            type="checkbox"
            className="brand-checkbox"
            checked={channelEffectivelySelected || subtreeAllImported}
            disabled={channelLocked}
            onChange={(e) => onToggleChannel(node.id, e.target.checked)}
          />
          <span className="kb-import-channel-name">{node.name}</span>
          <span className="kb-import-count">{subtreeDocIds.size} docs</span>
        </label>
      </div>
      {expanded ? (
        <>
          {docs.length > 0 && (
            <ul className="kb-import-doc-list">
              {docs.map((doc) => {
                const alreadyImported = importedDocumentIds.has(doc.id);
                const checked =
                  alreadyImported || selectedDocumentIds.has(doc.id) || channelEffectivelySelected;
                const disabled = alreadyImported || channelEffectivelySelected;
                return (
                  <li key={doc.id}>
                    <label
                      className={`kb-import-row kb-import-doc-row${channelEffectivelySelected && !selectedDocumentIds.has(doc.id) && !alreadyImported ? ' kb-import-row-inherited' : ''}${alreadyImported ? ' kb-import-row-imported' : ''}`}
                    >
                      <span className="kb-import-expand-spacer" aria-hidden />
                      <input
                        type="checkbox"
                        className="brand-checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) => onToggleDocument(doc.id, e.target.checked)}
                      />
                      <span>{doc.name}</span>
                      <span className="kb-import-doc-meta">{doc.file_type}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {node.children.map((child) => (
            <ChannelTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              ancestorChannelSelected={channelEffectivelySelected}
              selectedChannelIds={selectedChannelIds}
              selectedDocumentIds={selectedDocumentIds}
              importedDocumentIds={importedDocumentIds}
              expandedChannelIds={expandedChannelIds}
              documentsByChannel={documentsByChannel}
              flatChannels={flatChannels}
              onToggleChannel={onToggleChannel}
              onToggleDocument={onToggleDocument}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

export function KbImportModal({
  title = 'Import knowledge',
  confirmLabel = 'Import',
  importedDocumentIds: importedDocumentIdsProp,
  onCancel,
  onConfirm,
}: KbImportModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flatChannels, setFlatChannels] = useState<ImportSourceChannel[]>([]);
  const [documentsByChannel, setDocumentsByChannel] = useState<
    Record<string, ImportSourceDocument[]>
  >({});
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [expandedChannelIds, setExpandedChannelIds] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);

  const importedDocumentIds = useMemo(
    () => new Set(importedDocumentIdsProp ?? []),
    [importedDocumentIdsProp],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const sources = await fetchImportSources();
        setFlatChannels(sources.channels);
        setDocumentsByChannel(sources.documents_by_channel);
        // Default: all channels collapsed.
        setExpandedChannelIds(new Set());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load import sources');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const tree = useMemo(() => buildChannelTree(flatChannels), [flatChannels]);

  function toggleChannel(id: string, checked: boolean) {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleDocument(id: string, checked: boolean) {
    if (importedDocumentIds.has(id)) return;
    setSelectedDocumentIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Expand current selection to concrete document IDs, excluding already-imported. */
  function resolveNewDocumentIds(): string[] {
    const docSet = new Set<string>();
    for (const channelId of selectedChannelIds) {
      const descendants = collectDescendantChannelIds(channelId, flatChannels);
      descendants.add(channelId);
      for (const cid of descendants) {
        for (const doc of documentsByChannel[cid] ?? []) {
          docSet.add(doc.id);
        }
      }
    }
    for (const id of selectedDocumentIds) {
      docSet.add(id);
    }
    return [...docSet].filter((id) => !importedDocumentIds.has(id));
  }

  async function handleConfirm() {
    const documentIds = resolveNewDocumentIds();
    if (documentIds.length === 0) {
      setError(
        importedDocumentIds.size > 0
          ? 'All selected documents are already imported. Choose new documents.'
          : 'Select at least one document.',
      );
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      // Flatten to document IDs so channel expansion cannot re-include imported docs.
      await onConfirm({ channelIds: [], documentIds });
      setSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setSubmitting(false);
    }
  }

  const selectionCount = useMemo(() => {
    const docSet = new Set(selectedDocumentIds);
    for (const channelId of selectedChannelIds) {
      const descendants = collectDescendantChannelIds(channelId, flatChannels);
      descendants.add(channelId);
      for (const cid of descendants) {
        for (const doc of documentsByChannel[cid] ?? []) {
          docSet.add(doc.id);
        }
      }
    }
    let count = 0;
    for (const id of docSet) {
      if (!importedDocumentIds.has(id)) count += 1;
    }
    return count;
  }, [
    flatChannels,
    documentsByChannel,
    selectedChannelIds,
    selectedDocumentIds,
    importedDocumentIds,
  ]);

  const importedInTreeCount = useMemo(() => {
    let count = 0;
    for (const docs of Object.values(documentsByChannel)) {
      for (const doc of docs) {
        if (importedDocumentIds.has(doc.id)) count += 1;
      }
    }
    return count;
  }, [documentsByChannel, importedDocumentIds]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card kb-import-modal"
        role="dialog"
        aria-labelledby="kb-import-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="kb-import-title">{title}</h2>
        <p className="admin-muted">
          Expand a channel to browse documents, or select a channel to import its whole subtree.
          {importedInTreeCount > 0
            ? ' Already imported documents are checked and locked.'
            : null}
        </p>

        {error && <p className="admin-error" role="alert">{error}</p>}

        {loading ? (
          <p className="admin-muted">Loading documents…</p>
        ) : (
          <div className="kb-import-tree">
            {tree.map((node) => (
              <ChannelTreeNode
                key={node.id}
                node={node}
                depth={0}
                ancestorChannelSelected={false}
                selectedChannelIds={selectedChannelIds}
                selectedDocumentIds={selectedDocumentIds}
                importedDocumentIds={importedDocumentIds}
                expandedChannelIds={expandedChannelIds}
                documentsByChannel={documentsByChannel}
                flatChannels={flatChannels}
                onToggleChannel={toggleChannel}
                onToggleDocument={toggleDocument}
                onToggleExpand={toggleExpand}
              />
            ))}
          </div>
        )}

        <p className="kb-import-selection">
          {selectionCount} document(s) to import
          {importedInTreeCount > 0 ? ` · ${importedInTreeCount} already imported` : null}
        </p>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={submitting || selectionCount === 0}
            onClick={() => void handleConfirm()}
          >
            {submitting ? 'Starting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
