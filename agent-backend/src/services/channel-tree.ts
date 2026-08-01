import type { ChannelNode } from './documents.ts';

export type ChannelTreeRow = {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  pipeline_id: string | null;
  metadata_extraction_model_id: string | null;
  auto_start_pipeline: boolean;
  created_at: string;
  updated_at: string;
};

export function buildChannelTree(rows: ChannelTreeRow[]): ChannelNode[] {
  const nodes = new Map<string, ChannelNode>();
  for (const row of rows) {
    nodes.set(row.id, { ...row, children: [] });
  }

  const roots: ChannelNode[] = [];
  for (const node of nodes.values()) {
    if (node.parent_id && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function collectDescendantIds(
  rootId: string,
  rows: Array<{ id: string; parent_id: string | null }>,
): Set<string> {
  const childrenByParent = new Map<string | null, string[]>();
  for (const row of rows) {
    const list = childrenByParent.get(row.parent_id) ?? [];
    list.push(row.id);
    childrenByParent.set(row.parent_id, list);
  }

  const result = new Set<string>();
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    stack.push(...(childrenByParent.get(current) ?? []));
  }
  return result;
}

/** Ancestor channel names from root to leaf, joined with `/`. */
export function buildChannelPath(
  channelId: string,
  rows: Array<{ id: string; name: string; parent_id: string | null }>,
): string {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const parts: string[] = [];
  let current: string | null = channelId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const row = byId.get(current);
    if (!row) break;
    parts.push(row.name);
    current = row.parent_id;
  }
  parts.reverse();
  return parts.join('/');
}
