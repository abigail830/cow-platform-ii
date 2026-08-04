import type { PageIndexNode, PageIndexTree } from '../components/PageIndexTree.tsx';
import { slugifyHeading } from '../components/PageIndexTree.tsx';

export type DocumentViewMode = 'parsed' | 'pageindex' | 'original';

export type DocumentDeepLink = {
  view: DocumentViewMode;
  nodeId: string | null;
  line: number | null;
  page: number | null;
  sheet: number | null;
  heading: string | null;
  highlight: boolean;
};

export function buildDocumentSourceUrl(
  documentId: string,
  view: DocumentViewMode,
  locator?: {
    node_id?: string;
    line_num?: number;
    page_num?: number;
    sheet_index?: number;
    heading?: string;
  } | null,
  highlight = view === 'parsed',
): string {
  const params = new URLSearchParams();
  params.set('view', view);
  if (locator?.node_id) params.set('node', locator.node_id);
  if (locator?.line_num != null) params.set('line', String(locator.line_num));
  if (locator?.page_num != null) params.set('page', String(locator.page_num));
  if (locator?.sheet_index != null) params.set('sheet', String(locator.sheet_index));
  if (locator?.heading) params.set('heading', locator.heading);
  if (highlight) params.set('highlight', '1');
  return `/knowledge/documents/${documentId}?${params.toString()}`;
}

export function parseDocumentDeepLink(search: string): DocumentDeepLink {
  const params = new URLSearchParams(search);
  const viewParam = params.get('view');
  const view: DocumentViewMode =
    viewParam === 'original'
      ? 'original'
      : viewParam === 'pageindex'
        ? 'pageindex'
        : 'parsed';
  const nodeId = params.get('node')?.trim() || null;
  const heading = params.get('heading')?.trim() || null;
  const lineRaw = params.get('line');
  const pageRaw = params.get('page');
  const sheetRaw = params.get('sheet');
  const line = lineRaw != null && lineRaw !== '' ? Number(lineRaw) : null;
  const page = pageRaw != null && pageRaw !== '' ? Number(pageRaw) : null;
  const sheet = sheetRaw != null && sheetRaw !== '' ? Number(sheetRaw) : null;

  return {
    view,
    nodeId,
    line: Number.isFinite(line) ? Math.trunc(line!) : null,
    page: Number.isFinite(page) ? Math.trunc(page!) : null,
    sheet: Number.isFinite(sheet) ? Math.trunc(sheet!) : null,
    heading,
    highlight: params.get('highlight') === '1',
  };
}

function walkNodes(nodes: PageIndexNode[] | undefined, visit: (node: PageIndexNode) => void) {
  for (const node of nodes ?? []) {
    visit(node);
    walkNodes(node.nodes, visit);
  }
}

export function rightPanelTabFromView(view: DocumentViewMode): 'pageindex' | 'parsed' {
  return view === 'parsed' ? 'parsed' : 'pageindex';
}

export function findPageIndexNode(
  tree: PageIndexTree | null,
  input: Pick<DocumentDeepLink, 'nodeId' | 'line' | 'page' | 'heading'>,
): PageIndexNode | null {
  if (!tree?.structure?.length) return null;

  let match: PageIndexNode | null = null;
  walkNodes(tree.structure, (node) => {
    if (match) return;
    if (input.nodeId && node.node_id === input.nodeId) {
      match = node;
      return;
    }
    if (input.heading && slugifyHeading(node.title) === slugifyHeading(input.heading)) {
      match = node;
      return;
    }
    if (input.page != null && node.page_num === input.page) {
      match = node;
      return;
    }
    if (input.line != null && node.line_num === input.line) {
      match = node;
    }
  });

  if (match) return match;

  if (input.line != null) {
    let best: PageIndexNode | null = null;
    walkNodes(tree.structure, (node) => {
      if (typeof node.line_num !== 'number' || node.line_num > input.line!) return;
      if (!best || node.line_num > (best.line_num ?? 0)) best = node;
    });
    return best;
  }

  return null;
}

export function scrollToDocumentTarget(
  container: HTMLElement | null,
  input: Pick<DocumentDeepLink, 'nodeId' | 'line' | 'heading' | 'highlight'>,
): boolean {
  if (!container) return false;

  const slug = input.heading ? slugifyHeading(input.heading) : null;
  const target =
    (input.nodeId ? container.querySelector(`#${CSS.escape(input.nodeId)}`) : null) ??
    (slug ? container.querySelector(`#${CSS.escape(slug)}`) : null) ??
    (input.line != null ? container.querySelector(`[data-line="${input.line}"]`) : null);

  if (!(target instanceof HTMLElement)) return false;

  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (input.highlight) {
    target.classList.add('document-citation-highlight');
    window.setTimeout(() => target.classList.remove('document-citation-highlight'), 4000);
  }
  return true;
}
