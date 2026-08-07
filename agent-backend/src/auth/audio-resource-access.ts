import { eq, inArray, and } from 'drizzle-orm';
import { appAudioChannels, appResourceGrants, appUsers, db } from '../db/index.ts';
import { loadUserAccessProfile } from './rbac.ts';
import type { AudioChannelNode } from '../services/audios.ts';
import {
  buildChannelAncestorChain,
  filterChannelTreeWithAccess,
  FULL_RESOURCE_ACCESS,
  mergeResourcePermissions,
  NO_RESOURCE_ACCESS,
  normalizeResourcePermissionFlags,
  satisfiesResourcePermission,
  type ChannelNodeWithAccess,
  type ResourcePermissionFlags,
  type ResourcePermissionLevel,
} from './resource-access-utils.ts';

async function isAudioPlatformAdmin(userId: string): Promise<boolean> {
  const profile = await loadUserAccessProfile(userId);
  if (profile.roleKeys.includes('admin')) return true;
  const [user] = await db.select({ role: appUsers.role }).from(appUsers).where(eq(appUsers.id, userId)).limit(1);
  return user?.role === 'admin' || user?.role === 'operator';
}

type ChannelRowLite = { id: string; parentId: string | null; createdBy: string | null };
type GrantRow = typeof appResourceGrants.$inferSelect;

function flagsFromGrantRow(row: Pick<GrantRow, 'canRead' | 'canWrite' | 'canManage'>): ResourcePermissionFlags {
  return normalizeResourcePermissionFlags({
    read: row.canRead,
    write: row.canWrite,
    manage: row.canManage,
  });
}

async function loadGrantsForAudioChannels(resourceIds: string[]): Promise<Map<string, GrantRow[]>> {
  if (resourceIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(appResourceGrants)
    .where(
      and(eq(appResourceGrants.resourceType, 'audio_channel'), inArray(appResourceGrants.resourceId, resourceIds)),
    );

  const byResource = new Map<string, GrantRow[]>();
  for (const row of rows) {
    const list = byResource.get(row.resourceId) ?? [];
    list.push(row);
    byResource.set(row.resourceId, list);
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

async function loadAllAudioChannelRows(): Promise<ChannelRowLite[]> {
  return db
    .select({
      id: appAudioChannels.id,
      parentId: appAudioChannels.parentId,
      createdBy: appAudioChannels.createdBy,
    })
    .from(appAudioChannels);
}

export async function resolveAudioChannelPermission(
  userId: string,
  channelId: string,
  preloaded?: {
    channelRows?: ChannelRowLite[];
    grantsByResource?: Map<string, GrantRow[]>;
    admin?: boolean;
  },
): Promise<ResourcePermissionFlags> {
  if (preloaded?.admin ?? (await isAudioPlatformAdmin(userId))) return FULL_RESOURCE_ACCESS;

  const channelRows = preloaded?.channelRows ?? (await loadAllAudioChannelRows());
  const chain = buildChannelAncestorChain(
    channelId,
    channelRows.map((row) => ({ id: row.id, parent_id: row.parentId })),
  );
  if (chain.length === 0) return NO_RESOURCE_ACCESS;

  const ownerById = new Map(channelRows.map((row) => [row.id, row.createdBy]));
  const grantsByResource =
    preloaded?.grantsByResource ?? (await loadGrantsForAudioChannels(chain));

  const perms = chain.map((id) =>
    permissionAtLevel(userId, ownerById.get(id) ?? null, grantsByResource.get(id) ?? []),
  );
  return mergeResourcePermissions(...perms);
}

export async function userHasAudioChannelAccess(
  userId: string,
  channelId: string,
  required: ResourcePermissionLevel,
  preloaded?: Parameters<typeof resolveAudioChannelPermission>[2],
): Promise<boolean> {
  const flags = await resolveAudioChannelPermission(userId, channelId, preloaded);
  return satisfiesResourcePermission(flags, required);
}

export async function listAccessibleAudioChannelIds(userId: string): Promise<Set<string>> {
  if (await isAudioPlatformAdmin(userId)) {
    const rows = await loadAllAudioChannelRows();
    return new Set(rows.map((row) => row.id));
  }

  const channelRows = await loadAllAudioChannelRows();
  const grantsByResource = await loadGrantsForAudioChannels(channelRows.map((row) => row.id));
  const readable = new Set<string>();

  for (const row of channelRows) {
    const flags = await resolveAudioChannelPermission(userId, row.id, {
      channelRows,
      grantsByResource,
      admin: false,
    });
    if (flags.read) readable.add(row.id);
  }

  return readable;
}

export async function buildAudioChannelTreeForUser(
  userId: string,
  tree: AudioChannelNode[],
): Promise<ChannelNodeWithAccess[]> {
  const readableIds = await listAccessibleAudioChannelIds(userId);
  const channelRows = await loadAllAudioChannelRows();
  const grantsByResource = await loadGrantsForAudioChannels(channelRows.map((row) => row.id));
  const admin = await isAudioPlatformAdmin(userId);

  const accessById = new Map<string, ResourcePermissionFlags>();
  for (const row of channelRows) {
    const flags = await resolveAudioChannelPermission(userId, row.id, {
      channelRows,
      grantsByResource,
      admin,
    });
    accessById.set(row.id, flags);
  }

  return filterChannelTreeWithAccess(tree, readableIds, accessById);
}

export async function getAudioChannelIdForAudio(audioId: string): Promise<string | null> {
  const { getAudioById } = await import('../services/audios.ts');
  const audio = await getAudioById(audioId);
  return audio?.channelId ?? null;
}

export async function loadAudioChannelOwnerId(channelId: string): Promise<string | null> {
  const [row] = await db
    .select({ createdBy: appAudioChannels.createdBy })
    .from(appAudioChannels)
    .where(eq(appAudioChannels.id, channelId))
    .limit(1);
  return row?.createdBy ?? null;
}
