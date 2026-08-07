/** Pure helpers to materialize PageIndex discovery fields from import artifacts. */

export type PageIndexNode = {
  title?: unknown;
  node_id?: unknown;
  summary?: unknown;
  prefix_summary?: unknown;
  line_num?: unknown;
  page_num?: unknown;
  nodes?: unknown;
  [key: string]: unknown;
};

export type PageIndexTree = {
  doc_name?: unknown;
  structure?: unknown;
  strategy?: unknown;
  [key: string]: unknown;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function walkNodes(nodes: unknown, visit: (node: PageIndexNode) => void): void {
  if (!Array.isArray(nodes)) return;
  for (const raw of nodes) {
    if (!raw || typeof raw !== 'object') continue;
    const node = raw as PageIndexNode;
    visit(node);
    walkNodes(node.nodes, visit);
  }
}

export function flattenTocTitles(pageIndex: PageIndexTree | null | undefined): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();
  walkNodes(pageIndex?.structure, (node) => {
    const title = asString(node.title);
    if (!title || seen.has(title)) return;
    seen.add(title);
    titles.push(title);
  });
  return titles;
}

export function flattenNodeSummaries(pageIndex: PageIndexTree | null | undefined): string[] {
  const parts: string[] = [];
  walkNodes(pageIndex?.structure, (node) => {
    const summary = asString(node.summary);
    const prefix = asString(node.prefix_summary);
    if (summary) parts.push(summary);
    if (prefix) parts.push(prefix);
  });
  return parts;
}

export function buildDiscoveryText(input: {
  documentName: string;
  channelPath: string;
  metadata?: Record<string, unknown> | null;
  pageIndex?: PageIndexTree | null;
}): string {
  const meta = input.metadata ?? {};
  const parts = [
    input.documentName,
    input.channelPath,
    asString(meta.abstract),
    asString(meta.author),
    asString(meta.source),
    ...asStringArray(meta.tags),
    ...asStringArray(meta.categories),
    ...flattenTocTitles(input.pageIndex),
    ...flattenNodeSummaries(input.pageIndex),
  ]
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function extractPageIndexStrategy(pageIndex: PageIndexTree | null | undefined): string | null {
  const strategy = asString(pageIndex?.strategy);
  return strategy || null;
}

export function extractPageCount(
  parsingResult: Record<string, unknown> | null | undefined,
  pageIndex?: PageIndexTree | null,
): number | null {
  const fromParsing = parsingResult?.page_count;
  if (typeof fromParsing === 'number' && Number.isFinite(fromParsing)) {
    return Math.trunc(fromParsing);
  }
  if (typeof fromParsing === 'string' && /^[0-9]+$/.test(fromParsing)) {
    return Number.parseInt(fromParsing, 10);
  }

  let maxPage = 0;
  walkNodes(pageIndex?.structure, (node) => {
    if (typeof node.page_num === 'number' && Number.isFinite(node.page_num)) {
      maxPage = Math.max(maxPage, Math.trunc(node.page_num));
    }
  });
  return maxPage > 0 ? maxPage : null;
}

export function materializeDiscoveryFields(input: {
  documentName: string;
  channelPath: string;
  metadata?: Record<string, unknown> | null;
  pageIndex?: PageIndexTree | null;
  parsingResult?: Record<string, unknown> | null;
}): {
  discoveryText: string;
  tocTitles: string[];
  pageCount: number | null;
  pageIndexStrategy: string | null;
} {
  const tocTitles = flattenTocTitles(input.pageIndex);
  return {
    discoveryText: buildDiscoveryText(input),
    tocTitles,
    pageCount: extractPageCount(input.parsingResult, input.pageIndex),
    pageIndexStrategy: extractPageIndexStrategy(input.pageIndex),
  };
}
