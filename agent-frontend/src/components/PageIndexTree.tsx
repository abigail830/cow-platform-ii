import type { ReactNode } from 'react';

export type PageIndexNode = {
  title: string;
  node_id: string;
  line_num?: number;
  page_num?: number;
  summary?: string;
  prefix_summary?: string;
  nodes?: PageIndexNode[];
};

export type PageIndexTree = {
  doc_name?: string;
  structure?: PageIndexNode[];
};

export function slugifyHeading(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function renderNodes(
  nodes: PageIndexNode[],
  depth: number,
  activeNodeId: string | null,
  onSelect: (node: PageIndexNode) => void,
): ReactNode {
  return nodes.map((node) => (
    <li key={node.node_id} className="page-index-node">
      <button
        type="button"
        className={`page-index-node-btn${activeNodeId === node.node_id ? ' active' : ''}`}
        style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
        onClick={() => onSelect(node)}
        title={node.title}
      >
        <span className="page-index-node-title">{node.title}</span>
        {(typeof node.page_num === 'number' || typeof node.line_num === 'number') && (
          <span className="page-index-node-meta">
            {typeof node.page_num === 'number' && (
              <span className="page-index-node-ref">P{node.page_num}</span>
            )}
            {typeof node.line_num === 'number' && (
              <span className="page-index-node-ref">L{node.line_num}</span>
            )}
          </span>
        )}
      </button>
      {node.nodes && node.nodes.length > 0 && (
        <ul className="page-index-children">{renderNodes(node.nodes, depth + 1, activeNodeId, onSelect)}</ul>
      )}
    </li>
  ));
}

type PageIndexTreePanelProps = {
  tree: PageIndexTree | null;
  activeNodeId: string | null;
  onSelectNode: (node: PageIndexNode) => void;
};

export function PageIndexTreePanel({ tree, activeNodeId, onSelectNode }: PageIndexTreePanelProps) {
  const structure = tree?.structure ?? [];

  if (!structure.length) {
    return (
      <div className="document-detail-panel-empty">
        <p>No page index yet.</p>
        <p className="document-detail-panel-hint">Run the pipeline to build a heading tree from markdown.</p>
      </div>
    );
  }

  return (
    <div className="page-index-panel">
      {tree?.doc_name && <p className="page-index-doc-name">{tree.doc_name}</p>}
      <ul className="page-index-tree">{renderNodes(structure, 0, activeNodeId, onSelectNode)}</ul>
    </div>
  );
}
