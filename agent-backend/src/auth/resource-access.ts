import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
import {
  appDocumentChannels,
  appKnowledgeBases,
  appResourceGrants,
  appUsers,
  db,
  type ResourceType,
} from '../infrastructure/db/index.ts';
import {
  grantsCacheKey,
  invalidateResourceGrantCache,
  loadUserAccessProfileCached,
  type ChannelRowLite,
  type ResourceAccessRequestCache,
  type ResourceAccessScope,
} from './resource-access-request-cache.ts';
import type { ChannelNode } from '../document/domain/channel-node.ts';
import {
  buildChannelAncestorChain,
  filterChannelTreeWithAccess,
  FULL_RESOURCE_ACCESS,
  mergeResourcePermissions,
  NO_RESOURCE_ACCESS,
  normalizeResourcePermissionFlags,
  satisfiesResourcePermission,
  type ChannelNodeWithAccess,
  type ResourceAccessGrantRow,
  type ResourceAccessSettings,
  type ResourceAccessUser,
  type ResourcePermissionFlags,
  type ResourcePermissionLevel,
} from './resource-access-utils.ts';

export type { ResourceType };

export type {
  ChannelNodeWithAccess,
  ResourceAccessGrantRow,
  ResourceAccessSettings,
  ResourceAccessUser,
  ResourcePermissionFlags,
  ResourcePermissionLevel,
};
export {
  buildChannelAncestorChain,
  filterChannelTreeWithAccess,
  FULL_RESOURCE_ACCESS,
  mergeResourcePermissions,
  NO_RESOURCE_ACCESS,
  normalizeResourcePermissionFlags,
  resourcePermissionLabel,
  satisfiesResourcePermission,
} from './resource-access-utils.ts';

export type ResourceAccessPutInput = {
  others: ResourcePermissionFlags;
  users: Array<{
    userId: string;
    read: boolean;
    write: boolean;
    manage: boolean;
  }>;
};

type GrantRow = typeof appResourceGrants.$inferSelect;

export type ResourceAccessSettingsOptions = ResourceAccessScope & {
  myAccess?: ResourcePermissionFlags;
};

type ResourcePermissionPreload = ResourceAccessScope & {
  channelRows?: ChannelRowLite[];
  grantsByResource?: Map<string, GrantRow[]>;
  admin?: boolean;
};

function flagsFromGrantRow(row: Pick<GrantRow, 'canRead' | 'canWrite' | 'canManage'>): ResourcePermissionFlags {
  return normalizeResourcePermissionFlags({
    read: row.canRead,
    write: row.canWrite,
    manage: row.canManage,
  });
}

export async function isPlatformAdmin(userId: string, scope?: ResourceAccessScope): Promise<boolean> {
  if (scope?.cache?.platformAdmin.has(userId)) {
    return scope.cache.platformAdmin.get(userId)!;
  }

  const profile = await loadUserAccessProfileCached(userId, scope?.cache);
  if (profile.roleKeys.includes('admin')) {
    scope?.cache?.platformAdmin.set(userId, true);
    return true;
  }

  if (scope?.jwtRole === 'admin' || scope?.jwtRole === 'operator') {
    scope?.cache?.platformAdmin.set(userId, true);
    return true;
  }

  const [user] = await db.select({ role: appUsers.role }).from(appUsers).where(eq(appUsers.id, userId)).limit(1);
  const admin = user?.role === 'admin' || user?.role === 'operator';
  scope?.cache?.platformAdmin.set(userId, admin);
  return admin;
}

async function loadOwnerId(resourceType: ResourceType, resourceId: string): Promise<string | null> {
  if (resourceType === 'document_channel') {
    const [row] = await db
      .select({ createdBy: appDocumentChannels.createdBy })
      .from(appDocumentChannels)
      .where(eq(appDocumentChannels.id, resourceId))
      .limit(1);
    return row?.createdBy ?? null;
  }

  const [row] = await db
    .select({ createdBy: appKnowledgeBases.createdBy })
    .from(appKnowledgeBases)
    .where(eq(appKnowledgeBases.id, resourceId))
    .limit(1);
  return row?.createdBy ?? null;
}

async function loadGrantsForResources(
  resourceType: ResourceType,
  resourceIds: string[],
  cache?: ResourceAccessRequestCache,
): Promise<Map<string, GrantRow[]>> {
  if (resourceIds.length === 0) return new Map();

  const byResource = new Map<string, GrantRow[]>();
  const missingIds: string[] = [];

  for (const resourceId of resourceIds) {
    const cached = cache?.grantsByResource.get(grantsCacheKey(resourceType, resourceId));
    if (cached) {
      byResource.set(resourceId, cached);
    } else {
      missingIds.push(resourceId);
    }
  }

  if (missingIds.length > 0) {
    const rows = await db
      .select()
      .from(appResourceGrants)
      .where(and(eq(appResourceGrants.resourceType, resourceType), inArray(appResourceGrants.resourceId, missingIds)));

    for (const resourceId of missingIds) {
      byResource.set(resourceId, []);
    }
    for (const row of rows) {
      const list = byResource.get(row.resourceId) ?? [];
      list.push(row);
      byResource.set(row.resourceId, list);
      cache?.grantsByResource.set(grantsCacheKey(resourceType, row.resourceId), list);
    }
    for (const resourceId of missingIds) {
      cache?.grantsByResource.set(grantsCacheKey(resourceType, resourceId), byResource.get(resourceId) ?? []);
    }
  }

  return byResource;
}

function permissionAtLevel(
  userId: string,
  ownerId: string | null,
  grants: GrantRow[],
): ResourcePermissionFlags {
  if (ownerId && ownerId === userId) return FULL_RESOURCE_ACCESS;

  const userGrant = grants.find((grant) => grant.granteeType === 'user' && grant.granteeUserId === userId);
  if (userGrant) return flagsFromGrantRow(userGrant);

  const othersGrant = grants.find((grant) => grant.granteeType === 'others');
  if (othersGrant) return flagsFromGrantRow(othersGrant);

  return NO_RESOURCE_ACCESS;
}

async function loadAllChannelRows(): Promise<ChannelRowLite[]> {
  return db
    .select({
      id: appDocumentChannels.id,
      parentId: appDocumentChannels.parentId,
      createdBy: appDocumentChannels.createdBy,
    })
    .from(appDocumentChannels);
}

async function loadChannelAncestorRows(
  channelId: string,
  cache?: ResourceAccessRequestCache,
): Promise<ChannelRowLite[]> {
  const rows: ChannelRowLite[] = [];
  let currentId: string | null = channelId;
  const seen = new Set<string>();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const cachedRow: ChannelRowLite | undefined = cache?.channelRowsById.get(currentId);
    if (cachedRow) {
      rows.push(cachedRow);
      currentId = cachedRow.parentId;
      continue;
    }

    const [row] = await db
      .select({
        id: appDocumentChannels.id,
        parentId: appDocumentChannels.parentId,
        createdBy: appDocumentChannels.createdBy,
      })
      .from(appDocumentChannels)
      .where(eq(appDocumentChannels.id, currentId))
      .limit(1);
    if (!row) break;
    cache?.channelRowsById.set(currentId, row);
    rows.push(row);
    currentId = row.parentId;
  }

  return rows;
}

export async function resolveChannelPermission(
  userId: string,
  channelId: string,
  preloaded?: ResourcePermissionPreload,
): Promise<ResourcePermissionFlags> {
  const scope = preloaded;
  const admin =
    preloaded?.admin ??
    (await isPlatformAdmin(userId, scope));
  if (admin) return FULL_RESOURCE_ACCESS;

  const channelRows =
    preloaded?.channelRows ?? (await loadChannelAncestorRows(channelId, scope?.cache));
  const chain = buildChannelAncestorChain(
    channelId,
    channelRows.map((row) => ({ id: row.id, parent_id: row.parentId })),
  );
  if (chain.length === 0) return NO_RESOURCE_ACCESS;

  const ownerById = new Map(channelRows.map((row) => [row.id, row.createdBy]));
  const grantsByResource =
    preloaded?.grantsByResource ??
    (await loadGrantsForResources('document_channel', chain, scope?.cache));

  const perms = chain.map((id) =>
    permissionAtLevel(userId, ownerById.get(id) ?? null, grantsByResource.get(id) ?? []),
  );
  return mergeResourcePermissions(...perms);
}

export async function resolveKnowledgeBasePermission(
  userId: string,
  knowledgeBaseId: string,
  scope?: ResourceAccessScope,
): Promise<ResourcePermissionFlags> {
  if (await isPlatformAdmin(userId, scope)) return FULL_RESOURCE_ACCESS;

  const ownerId = await loadOwnerId('knowledge_base', knowledgeBaseId);
  const grantsByResource = await loadGrantsForResources('knowledge_base', [knowledgeBaseId], scope?.cache);
  return permissionAtLevel(userId, ownerId, grantsByResource.get(knowledgeBaseId) ?? []);
}

export async function userHasChannelAccess(
  userId: string,
  channelId: string,
  required: ResourcePermissionLevel,
  preloaded?: Parameters<typeof resolveChannelPermission>[2],
): Promise<boolean> {
  const flags = await resolveChannelPermission(userId, channelId, preloaded);
  return satisfiesResourcePermission(flags, required);
}

export async function userHasKnowledgeBaseAccess(
  userId: string,
  knowledgeBaseId: string,
  required: ResourcePermissionLevel,
  scope?: ResourceAccessScope,
): Promise<boolean> {
  const flags = await resolveKnowledgeBasePermission(userId, knowledgeBaseId, scope);
  return satisfiesResourcePermission(flags, required);
}

export async function resolveViewerResourcePermission(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  scope?: ResourceAccessScope,
): Promise<ResourcePermissionFlags> {
  if (resourceType === 'document_channel') {
    return resolveChannelPermission(userId, resourceId, scope);
  }
  return resolveKnowledgeBasePermission(userId, resourceId, scope);
}

export async function listAccessibleChannelIds(userId: string): Promise<Set<string>> {
  if (await isPlatformAdmin(userId)) {
    const rows = await loadAllChannelRows();
    return new Set(rows.map((row) => row.id));
  }

  const channelRows = await loadAllChannelRows();
  const grantsByResource = await loadGrantsForResources(
    'document_channel',
    channelRows.map((row) => row.id),
  );
  const admin = false;
  const readable = new Set<string>();

  for (const row of channelRows) {
    const flags = await resolveChannelPermission(userId, row.id, {
      channelRows,
      grantsByResource,
      admin,
    });
    if (flags.read) readable.add(row.id);
  }

  return readable;
}

export async function listAccessibleKnowledgeBaseIds(userId: string): Promise<Set<string>> {
  if (await isPlatformAdmin(userId)) {
    const rows = await db.select({ id: appKnowledgeBases.id }).from(appKnowledgeBases);
    return new Set(rows.map((row) => row.id));
  }

  const rows = await db.select({ id: appKnowledgeBases.id }).from(appKnowledgeBases);
  const grantsByResource = await loadGrantsForResources(
    'knowledge_base',
    rows.map((row) => row.id),
  );
  const ownerRows = await db
    .select({ id: appKnowledgeBases.id, createdBy: appKnowledgeBases.createdBy })
    .from(appKnowledgeBases);

  const readable = new Set<string>();
  for (const row of ownerRows) {
    const flags = permissionAtLevel(userId, row.createdBy, grantsByResource.get(row.id) ?? []);
    if (flags.read) readable.add(row.id);
  }
  return readable;
}

export async function buildChannelTreeForUser(
  userId: string,
  tree: ChannelNode[],
): Promise<ChannelNodeWithAccess[]> {
  const readableIds = await listAccessibleChannelIds(userId);
  const channelRows = await loadAllChannelRows();
  const grantsByResource = await loadGrantsForResources(
    'document_channel',
    channelRows.map((row) => row.id),
  );
  const admin = await isPlatformAdmin(userId);

  const accessById = new Map<string, ResourcePermissionFlags>();
  for (const row of channelRows) {
    const flags = await resolveChannelPermission(userId, row.id, {
      channelRows,
      grantsByResource,
      admin,
    });
    accessById.set(row.id, flags);
  }

  return filterChannelTreeWithAccess(tree, readableIds, accessById);
}

async function loadUserSummary(userId: string): Promise<ResourceAccessUser | null> {
  const [row] = await db
    .select({
      id: appUsers.id,
      email: appUsers.email,
      displayName: appUsers.displayName,
    })
    .from(appUsers)
    .where(eq(appUsers.id, userId))
    .limit(1);
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.displayName };
}

export async function getResourceAccessSettings(
  resourceType: ResourceType,
  resourceId: string,
  viewerUserId: string,
  options?: ResourceAccessSettingsOptions,
): Promise<ResourceAccessSettings | null> {
  const ownerId = await loadOwnerId(resourceType, resourceId);
  if (ownerId === null && resourceType === 'document_channel') {
    const [exists] = await db
      .select({ id: appDocumentChannels.id })
      .from(appDocumentChannels)
      .where(eq(appDocumentChannels.id, resourceId))
      .limit(1);
    if (!exists) return null;
  }
  if (ownerId === null && resourceType === 'knowledge_base') {
    const [exists] = await db
      .select({ id: appKnowledgeBases.id })
      .from(appKnowledgeBases)
      .where(eq(appKnowledgeBases.id, resourceId))
      .limit(1);
    if (!exists) return null;
  }
  const grants = (await loadGrantsForResources(resourceType, [resourceId], options?.cache)).get(resourceId) ?? [];
  const othersGrant = grants.find((grant) => grant.granteeType === 'others');
  const userGrants = grants.filter((grant) => grant.granteeType === 'user' && grant.granteeUserId);

  const userIds = userGrants.map((grant) => grant.granteeUserId!).filter(Boolean);
  const userRows =
    userIds.length === 0
      ? []
      : await db
          .select({
            id: appUsers.id,
            email: appUsers.email,
            displayName: appUsers.displayName,
          })
          .from(appUsers)
          .where(inArray(appUsers.id, userIds));

  const userById = new Map(userRows.map((row) => [row.id, row]));
  const users: ResourceAccessGrantRow[] = userGrants
    .map((grant) => {
      const user = userById.get(grant.granteeUserId!);
      if (!user) return null;
      const flags = flagsFromGrantRow(grant);
      return {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        ...flags,
      };
    })
    .filter((row): row is ResourceAccessGrantRow => row != null);

  const myAccess =
    options?.myAccess ??
    (await resolveViewerResourcePermission(viewerUserId, resourceType, resourceId, options));

  return {
    owner: ownerId ? ((await loadUserSummary(ownerId)) ?? null) : null,
    others: othersGrant ? flagsFromGrantRow(othersGrant) : NO_RESOURCE_ACCESS,
    users,
    my_access: myAccess,
  };
}

export async function replaceResourceAccessSettings(
  resourceType: ResourceType,
  resourceId: string,
  actorUserId: string,
  input: ResourceAccessPutInput,
  scope?: ResourceAccessScope,
): Promise<ResourceAccessSettings> {
  const canManage = await resolveViewerResourcePermission(actorUserId, resourceType, resourceId, scope).then(
    (flags) => satisfiesResourcePermission(flags, 'manage'),
  );
  if (!canManage) throw new Error('Forbidden');

  const others = normalizeResourcePermissionFlags(input.others);
  const users = input.users.map((grant) => ({
    userId: grant.userId,
    ...normalizeResourcePermissionFlags(grant),
  }));

  const ownerId = await loadOwnerId(resourceType, resourceId);
  const filteredUsers = users.filter((grant) => grant.userId !== ownerId);

  await db.transaction(async (tx) => {
    await tx
      .delete(appResourceGrants)
      .where(and(eq(appResourceGrants.resourceType, resourceType), eq(appResourceGrants.resourceId, resourceId)));

    await tx.insert(appResourceGrants).values({
      resourceType,
      resourceId,
      granteeType: 'others',
      granteeUserId: null,
      canRead: others.read,
      canWrite: others.write,
      canManage: others.manage,
    });

    if (filteredUsers.length > 0) {
      await tx.insert(appResourceGrants).values(
        filteredUsers.map((grant) => ({
          resourceType,
          resourceId,
          granteeType: 'user' as const,
          granteeUserId: grant.userId,
          canRead: grant.read,
          canWrite: grant.write,
          canManage: grant.manage,
        })),
      );
    }
  });

  invalidateResourceGrantCache(scope?.cache, resourceType, resourceId);

  const settings = await getResourceAccessSettings(resourceType, resourceId, actorUserId, scope);
  if (!settings) throw new Error('Resource not found');
  return settings;
}

export async function transferResourceOwner(
  resourceType: ResourceType,
  resourceId: string,
  actorUserId: string,
  newOwnerUserId: string,
  scope?: ResourceAccessScope,
): Promise<ResourceAccessSettings> {
  const canManage = await resolveViewerResourcePermission(actorUserId, resourceType, resourceId, scope).then(
    (flags) => satisfiesResourcePermission(flags, 'manage'),
  );
  if (!canManage) throw new Error('Forbidden');

  const [newOwner] = await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.id, newOwnerUserId)).limit(1);
  if (!newOwner) throw new Error('User not found');

  if (resourceType === 'document_channel') {
    const [updated] = await db
      .update(appDocumentChannels)
      .set({ createdBy: newOwnerUserId, updatedAt: new Date() })
      .where(eq(appDocumentChannels.id, resourceId))
      .returning({ id: appDocumentChannels.id });
    if (!updated) throw new Error('Channel not found');
  } else {
    const [updated] = await db
      .update(appKnowledgeBases)
      .set({ createdBy: newOwnerUserId, updatedAt: new Date() })
      .where(eq(appKnowledgeBases.id, resourceId))
      .returning({ id: appKnowledgeBases.id });
    if (!updated) throw new Error('Knowledge base not found');
  }

  await db
    .delete(appResourceGrants)
    .where(
      and(
        eq(appResourceGrants.resourceType, resourceType),
        eq(appResourceGrants.resourceId, resourceId),
        eq(appResourceGrants.granteeType, 'user'),
        eq(appResourceGrants.granteeUserId, newOwnerUserId),
      ),
    );

  invalidateResourceGrantCache(scope?.cache, resourceType, resourceId);

  const settings = await getResourceAccessSettings(resourceType, resourceId, actorUserId, scope);
  if (!settings) throw new Error('Resource not found');
  return settings;
}

export async function lookupUsersForSharing(search: string | undefined, limit = 20): Promise<ResourceAccessUser[]> {
  const trimmed = search?.trim();
  const conditions = trimmed
    ? or(ilike(appUsers.email, `%${trimmed}%`), ilike(appUsers.displayName, `%${trimmed}%`))
    : undefined;

  const rows = await db
    .select({
      id: appUsers.id,
      email: appUsers.email,
      displayName: appUsers.displayName,
    })
    .from(appUsers)
    .where(conditions)
    .orderBy(asc(appUsers.email))
    .limit(Math.min(Math.max(limit, 1), 50));

  return rows;
}

export async function getDocumentChannelIdForDocument(documentId: string): Promise<string | null> {
  const { getDocumentById } = await import('../document/application/documents.ts');
  const doc = await getDocumentById(documentId);
  return doc?.channelId ?? null;
}
