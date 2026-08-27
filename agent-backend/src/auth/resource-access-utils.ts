import type { ChannelNode } from '../services/documents/documents.ts';

export type ResourcePermissionLevel = 'read' | 'write' | 'manage';

export type ResourcePermissionFlags = {
  read: boolean;
  write: boolean;
  manage: boolean;
};

export const FULL_RESOURCE_ACCESS: ResourcePermissionFlags = { read: true, write: true, manage: true };
export const NO_RESOURCE_ACCESS: ResourcePermissionFlags = { read: false, write: false, manage: false };

export type ResourceAccessUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type ResourceAccessGrantRow = {
  userId: string;
  email: string;
  displayName: string | null;
  read: boolean;
  write: boolean;
  manage: boolean;
};

export type ResourceAccessSettings = {
  owner: ResourceAccessUser | null;
  others: ResourcePermissionFlags;
  users: ResourceAccessGrantRow[];
  my_access: ResourcePermissionFlags;
};

export function mergeResourcePermissions(...perms: ResourcePermissionFlags[]): ResourcePermissionFlags {
  return {
    read: perms.some((perm) => perm.read),
    write: perms.some((perm) => perm.write),
    manage: perms.some((perm) => perm.manage),
  };
}

export function normalizeResourcePermissionFlags(flags: {
  read?: boolean;
  write?: boolean;
  manage?: boolean;
}): ResourcePermissionFlags {
  const manage = Boolean(flags.manage);
  const write = manage || Boolean(flags.write);
  const read = write || Boolean(flags.read);
  return { read, write, manage };
}

export function satisfiesResourcePermission(
  flags: ResourcePermissionFlags,
  required: ResourcePermissionLevel,
): boolean {
  if (required === 'manage') return flags.manage;
  if (required === 'write') return flags.write || flags.manage;
  return flags.read || flags.write || flags.manage;
}

export function resourcePermissionLabel(flags: ResourcePermissionFlags): string {
  const parts: string[] = [];
  if (flags.read) parts.push('r');
  if (flags.write) parts.push('w');
  if (flags.manage) parts.push('m');
  return parts.length > 0 ? parts.join('') : '—';
}

export function buildChannelAncestorChain(
  channelId: string,
  rows: Array<{ id: string; parent_id: string | null }>,
): string[] {
  const parentById = new Map(rows.map((row) => [row.id, row.parent_id]));
  const chain: string[] = [];
  let current: string | null = channelId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = parentById.get(current) ?? null;
  }
  return chain;
}

export type ChannelNodeWithAccess = ChannelNode & {
  my_access: ResourcePermissionFlags;
  children: ChannelNodeWithAccess[];
};

export function filterChannelTreeWithAccess(
  nodes: ChannelNode[],
  readableIds: Set<string>,
  accessById: Map<string, ResourcePermissionFlags>,
): ChannelNodeWithAccess[] {
  const result: ChannelNodeWithAccess[] = [];

  for (const node of nodes) {
    const children = filterChannelTreeWithAccess(node.children, readableIds, accessById);
    const selfReadable = readableIds.has(node.id);
    if (!selfReadable && children.length === 0) continue;

    result.push({
      ...node,
      my_access: accessById.get(node.id) ?? NO_RESOURCE_ACCESS,
      children,
    });
  }

  return result;
}
