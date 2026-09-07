import type { SourceLocator } from '../source-ref.ts';

export type SliceNode = {
  title?: unknown;
  node_id?: unknown;
  summary?: unknown;
  prefix_summary?: unknown;
  line_num?: unknown;
  page_num?: unknown;
  nodes?: unknown;
  [key: string]: unknown;
};

export type SectionSliceResult = {
  content: string;
  locator: SourceLocator | null;
  truncated: boolean;
  next_hint: string | null;
  error?: string;
};

type FlatNode = {
  node: SliceNode;
  depth: number;
  parentId: string | null;
  siblingIndex: number;
  path: number[];
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^-?[0-9]+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return null;
}

function structureRoots(structure: unknown): SliceNode[] {
  if (Array.isArray(structure)) {
    return structure.filter((n): n is SliceNode => !!n && typeof n === 'object');
  }
  if (structure && typeof structure === 'object') {
    const tree = structure as { structure?: unknown };
    if (Array.isArray(tree.structure)) {
      return tree.structure.filter((n): n is SliceNode => !!n && typeof n === 'object');
    }
  }
  return [];
}

function walkFlat(
  nodes: unknown,
  depth: number,
  parentId: string | null,
  pathPrefix: number[],
  out: FlatNode[],
): void {
  if (!Array.isArray(nodes)) return;
  nodes.forEach((raw, siblingIndex) => {
    if (!raw || typeof raw !== 'object') return;
    const node = raw as SliceNode;
    const path = [...pathPrefix, siblingIndex];
    out.push({
      node,
      depth,
      parentId,
      siblingIndex,
      path,
    });
    const nodeId = asString(node.node_id) || null;
    walkFlat(node.nodes, depth + 1, nodeId, path, out);
  });
}

function flattenTree(structure: unknown): FlatNode[] {
  const out: FlatNode[] = [];
  walkFlat(structureRoots(structure), 0, null, [], out);
  return out;
}

export function findNodeById(structure: unknown, nodeId: string): SliceNode | null {
  const target = nodeId.trim();
  if (!target) return null;
  for (const entry of flattenTree(structure)) {
    if (asString(entry.node.node_id) === target) return entry.node;
  }
  return null;
}

export function collectLineSortedNodes(structure: unknown): Array<SliceNode & { line_num: number }> {
  const withLines: Array<SliceNode & { line_num: number }> = [];
  for (const entry of flattenTree(structure)) {
    const line = asInt(entry.node.line_num);
    if (line == null || line < 1) continue;
    withLines.push({ ...entry.node, line_num: line });
  }
  withLines.sort((a, b) => a.line_num - b.line_num);
  return withLines;
}

function splitLines(markdown: string): string[] {
  return markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function joinLines(lines: string[]): string {
  return lines.join('\n');
}

function truncateContent(
  content: string,
  maxChars: number,
  nextHintBase: string | null,
): { content: string; truncated: boolean; next_hint: string | null } {
  if (maxChars <= 0 || content.length <= maxChars) {
    return { content, truncated: false, next_hint: nextHintBase };
  }
  const sliced = content.slice(0, maxChars);
  const hint = nextHintBase
    ? `${nextHintBase}; content truncated at ${maxChars} chars — continue with a smaller range or next node`
    : `Content truncated at ${maxChars} chars — request remaining with a tighter node/pages/lines range`;
  return { content: sliced, truncated: true, next_hint: hint };
}

function locatorFromNode(node: SliceNode | null, overrides?: Partial<SourceLocator>): SourceLocator | null {
  if (!node && !overrides) return null;
  const locator: SourceLocator = { ...(overrides ?? {}) };
  if (node) {
    const nodeId = asString(node.node_id);
    const heading = asString(node.title);
    const line = asInt(node.line_num);
    const page = asInt(node.page_num);
    if (nodeId) locator.node_id = nodeId;
    if (heading) locator.heading = heading;
    if (line != null) locator.line_num = line;
    if (page != null) locator.page_num = page;
  }
  return Object.keys(locator).length > 0 ? locator : null;
}

function findNextBoundaryStartLine(structure: unknown, nodeId: string): number | null {
  const flat = flattenTree(structure);
  const index = flat.findIndex((entry) => asString(entry.node.node_id) === nodeId);
  if (index < 0) return null;
  const current = flat[index]!;

  // Prefer next sibling under the same parent.
  const nextSibling = flat.find(
    (entry) =>
      entry.parentId === current.parentId &&
      entry.depth === current.depth &&
      entry.siblingIndex === current.siblingIndex + 1,
  );
  if (nextSibling) {
    return asInt(nextSibling.node.line_num);
  }

  // Walk up: parent's next sibling (or further ancestors).
  let parentPath = current.path.slice(0, -1);
  while (parentPath.length > 0) {
    const parent = flat.find(
      (entry) =>
        entry.path.length === parentPath.length &&
        entry.path.every((value, i) => value === parentPath[i]),
    );
    if (!parent) break;
    const uncle = flat.find(
      (entry) =>
        entry.parentId === parent.parentId &&
        entry.depth === parent.depth &&
        entry.siblingIndex === parent.siblingIndex + 1,
    );
    if (uncle) {
      return asInt(uncle.node.line_num);
    }
    parentPath = parentPath.slice(0, -1);
  }

  // Fallback: next node in document order that is not a descendant.
  for (let i = index + 1; i < flat.length; i += 1) {
    const candidate = flat[i]!;
    const isDescendant =
      candidate.path.length > current.path.length &&
      current.path.every((value, idx) => candidate.path[idx] === value);
    if (isDescendant) continue;
    const line = asInt(candidate.node.line_num);
    if (line != null) return line;
  }
  return null;
}

export function sliceByLines(
  markdown: string,
  startLine: number,
  endLine: number | null | undefined,
  maxChars: number,
): SectionSliceResult {
  const lines = splitLines(markdown);
  const start = Math.max(1, Math.trunc(startLine));
  const endExclusive =
    endLine == null || !Number.isFinite(endLine)
      ? lines.length + 1
      : Math.max(start, Math.trunc(endLine));
  const selected = lines.slice(start - 1, Math.min(lines.length, endExclusive - 1));
  const content = joinLines(selected);
  const nextHint =
    endExclusive <= lines.length + 1 && endExclusive - 1 < lines.length
      ? `Continue from line ${endExclusive}`
      : null;
  const truncated = truncateContent(content, maxChars, nextHint);
  return {
    ...truncated,
    locator: { line_num: start },
  };
}

function pageLineRanges(
  structure: unknown,
): Map<number, { startLine: number; endLine: number | null }> {
  const byPage = new Map<number, number[]>();
  for (const node of collectLineSortedNodes(structure)) {
    const page = asInt(node.page_num);
    if (page == null || page < 1) continue;
    const list = byPage.get(page) ?? [];
    list.push(node.line_num);
    byPage.set(page, list);
  }

  const pages = [...byPage.keys()].sort((a, b) => a - b);
  const ranges = new Map<number, { startLine: number; endLine: number | null }>();
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]!;
    const lines = byPage.get(page)!.slice().sort((a, b) => a - b);
    const startLine = lines[0]!;
    const nextPage = pages[i + 1];
    const endLine = nextPage != null ? (byPage.get(nextPage)!.slice().sort((a, b) => a - b)[0] ?? null) : null;
    ranges.set(page, { startLine, endLine });
  }
  return ranges;
}

function sliceByFormFeedPages(
  markdown: string,
  startPage: number,
  endPage: number,
  maxChars: number,
): SectionSliceResult {
  const parts = markdown.split('\f');
  if (parts.length <= 1) {
    return {
      content: '',
      locator: { page_num: startPage },
      truncated: false,
      next_hint: null,
      error:
        'Cannot slice by page: nodes lack line_num and markdown has no form-feed page breaks. Use node_id or lines.',
    };
  }
  const start = Math.max(1, Math.trunc(startPage));
  const end = Math.max(start, Math.trunc(endPage));
  const selected = parts.slice(start - 1, end);
  const content = selected.join('\f');
  const nextHint = end < parts.length ? `Continue from page ${end + 1}` : null;
  const truncated = truncateContent(content, maxChars, nextHint);
  return {
    ...truncated,
    locator: { page_num: start },
  };
}

export function sliceByPages(
  markdown: string,
  pageIndex: unknown,
  startPage: number,
  endPage: number | null | undefined,
  maxChars: number,
): SectionSliceResult {
  const start = Math.max(1, Math.trunc(startPage));
  const end = endPage == null || !Number.isFinite(endPage) ? start : Math.max(start, Math.trunc(endPage));
  const ranges = pageLineRanges(pageIndex);
  if (ranges.size > 0) {
    const startRange = ranges.get(start);
    if (!startRange) {
      return {
        content: '',
        locator: { page_num: start },
        truncated: false,
        next_hint: null,
        error: `No line_num anchors found for page ${start}.`,
      };
    }
    let endLine: number | null = null;
    if (end > start) {
      const after = ranges.get(end + 1);
      endLine = after?.startLine ?? null;
      if (endLine == null) {
        const endRange = ranges.get(end);
        endLine = endRange?.endLine ?? null;
      }
    } else {
      endLine = startRange.endLine;
    }
    const sliced = sliceByLines(markdown, startRange.startLine, endLine, maxChars);
    return {
      ...sliced,
      locator: { page_num: start, line_num: startRange.startLine },
    };
  }
  return sliceByFormFeedPages(markdown, start, end, maxChars);
}

export function sliceByNodeId(
  markdown: string,
  pageIndex: unknown,
  nodeId: string,
  maxChars: number,
): SectionSliceResult {
  const node = findNodeById(pageIndex, nodeId);
  if (!node) {
    return {
      content: '',
      locator: { node_id: nodeId },
      truncated: false,
      next_hint: null,
      error: `Node not found: ${nodeId}`,
    };
  }

  const startLine = asInt(node.line_num);
  if (startLine != null && startLine >= 1) {
    const endLine = findNextBoundaryStartLine(pageIndex, nodeId);
    const nextNodeIdHint = (() => {
      if (endLine == null) return null;
      const next = collectLineSortedNodes(pageIndex).find((n) => n.line_num === endLine);
      const nextId = next ? asString(next.node_id) : '';
      return nextId ? `Next section starts at node_id=${nextId} (line ${endLine})` : `Continue from line ${endLine}`;
    })();
    const sliced = sliceByLines(markdown, startLine, endLine, maxChars);
    return {
      ...sliced,
      next_hint: sliced.truncated
        ? sliced.next_hint
        : nextNodeIdHint,
      locator: locatorFromNode(node),
    };
  }

  const page = asInt(node.page_num);
  if (page != null && page >= 1) {
    const sliced = sliceByPages(markdown, pageIndex, page, page, maxChars);
    return {
      ...sliced,
      locator: locatorFromNode(node, sliced.locator ?? undefined),
      error: sliced.error,
    };
  }

  return {
    content: '',
    locator: locatorFromNode(node),
    truncated: false,
    next_hint: null,
    error: `Node ${nodeId} has neither line_num nor page_num; cannot slice content.`,
  };
}

function trimNode(node: SliceNode, maxDepth: number, depth: number): Record<string, unknown> {
  const trimmed: Record<string, unknown> = {};
  const title = asString(node.title);
  const summary = asString(node.summary);
  const prefix = asString(node.prefix_summary);
  const nodeId = asString(node.node_id);
  const line = asInt(node.line_num);
  const page = asInt(node.page_num);

  if (title) trimmed.title = title;
  if (summary) trimmed.summary = summary;
  if (prefix) trimmed.prefix_summary = prefix;
  if (nodeId) trimmed.node_id = nodeId;
  if (line != null) trimmed.line_num = line;
  if (page != null) trimmed.page_num = page;

  if (depth < maxDepth && Array.isArray(node.nodes)) {
    trimmed.nodes = node.nodes
      .filter((child): child is SliceNode => !!child && typeof child === 'object')
      .map((child) => trimNode(child, maxDepth, depth + 1));
  }

  return trimmed;
}

/** Keep title/summary/prefix_summary/node_id/line_num/page_num/nodes; strip deeper than maxDepth. */
export function trimStructure(structure: unknown, maxDepth: number): unknown {
  const depth = Number.isFinite(maxDepth) ? Math.max(0, Math.trunc(maxDepth)) : Number.POSITIVE_INFINITY;
  if (depth <= 0) return [];
  const roots = structureRoots(structure);
  return roots.map((node) => trimNode(node, depth, 1));
}

export function findSubtree(structure: unknown, partNodeId: string): unknown {
  const node = findNodeById(structure, partNodeId);
  if (!node) return null;
  return [node];
}
