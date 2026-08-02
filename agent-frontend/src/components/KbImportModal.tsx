import { useEffect, useMemo, useState } from 'react';
import {
  buildChannelTree,
  collectDescendantChannelIds,
  fetchImportSources,
  type ImportSourceChannel,
  type ImportSourceChannelNode,
  type ImportSourceDocument,
} from '../api/knowledgeBases.ts';

type KbImportModalProps = {
  title?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (input: { channelIds: string[]; documentIds: string[] }) => Promise<void>;
};

function ChannelTreeNode({
  node,
  depth,
  ancestorChannelSelected,
  selectedChannelIds,
  selectedDocumentIds,
  documentsByChannel,
  onToggleChannel,
  onToggleDocument,
}: {
  node: ImportSourceChannelNode;
  depth: number;
  ancestorChannelSelected: boolean;
  selectedChannelIds: Set<string>;
  selectedDocumentIds: Set<string>;
  documentsByChannel: Record<string, ImportSourceDocument[]>;
  onToggleChannel: (id: string, checked: boolean) => void;
  onToggleDocument: (id: string, checked: boolean) => void;
}) {
  const docs = documentsByChannel[node.id] ?? [];
  const channelDirectlySelected = selectedChannelIds.has(node.id);
  const channelEffectivelySelected = channelDirectlySelected || ancestorChannelSelected;

  return (
    <div className="kb-import-channel" style={{ paddingLeft: `${depth * 12}px` }}>
      <label
        className={`kb-import-row${channelEffectivelySelected && !channelDirectlySelected ? ' kb-import-row-inherited' : ''}`}
      >
        <input
          type="checkbox"
          className="brand-checkbox"
          checked={channelEffectivelySelected}
          disabled={ancestorChannelSelected}
          onChange={(e) => onToggleChannel(node.id, e.target.checked)}
        />
        <span className="kb-import-channel-name">{node.name}</span>
        <span className="kb-import-count">{docs.length} docs</span>
      </label>
      {docs.length > 0 && (
        <ul className="kb-import-doc-list">
          {docs.map((doc) => (
            <li key={doc.id}>
              <label
                className={`kb-import-row kb-import-doc-row${channelEffectivelySelected && !selectedDocumentIds.has(doc.id) ? ' kb-import-row-inherited' : ''}`}
              >
                <input
                  type="checkbox"
                  className="brand-checkbox"
                  checked={selectedDocumentIds.has(doc.id) || channelEffectivelySelected}
                  disabled={channelEffectivelySelected}
                  onChange={(e) => onToggleDocument(doc.id, e.target.checked)}
                />
                <span>{doc.name}</span>
                <span className="kb-import-doc-meta">{doc.file_type}</span>
              </label>
            </li>
          ))}
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
          documentsByChannel={documentsByChannel}
          onToggleChannel={onToggleChannel}
          onToggleDocument={onToggleDocument}
        />
      ))}
    </div>
  );
}

export function KbImportModal({
  title = 'Import knowledge',
  confirmLabel = 'Import',
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const sources = await fetchImportSources();
        setFlatChannels(sources.channels);
        setDocumentsByChannel(sources.documents_by_channel);
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
    setSelectedDocumentIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleConfirm() {
    if (selectionCount === 0) {
      setError('Select at least one document.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const channelIds = [...selectedChannelIds];
      const docIds = [...selectedDocumentIds];
      await onConfirm({ channelIds, documentIds: docIds });
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
    return docSet.size;
  }, [flatChannels, documentsByChannel, selectedChannelIds, selectedDocumentIds]);

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
          Select channels (all documents in subtree) or individual documents.
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
                documentsByChannel={documentsByChannel}
                onToggleChannel={toggleChannel}
                onToggleDocument={toggleDocument}
              />
            ))}
          </div>
        )}

        <p className="kb-import-selection">{selectionCount} document(s) selected</p>

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
