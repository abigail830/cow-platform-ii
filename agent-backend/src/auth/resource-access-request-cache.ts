import type { Context } from 'hono';
import type { UserRole } from './jwt.ts';
import type { UserAccessProfile } from './rbac.ts';
import { loadUserAccessProfile } from './rbac.ts';
import type { ResourceType, appResourceGrants } from '../infrastructure/db/index.ts';

type GrantRow = typeof appResourceGrants.$inferSelect;

export type ChannelRowLite = { id: string; parentId: string | null; createdBy: string | null };

export type ResourceAccessRequestCache = {
  userAccessProfiles: Map<string, UserAccessProfile>;
  platformAdmin: Map<string, boolean>;
  grantsByResource: Map<string, GrantRow[]>;
  channelRowsById: Map<string, ChannelRowLite>;
};

export type ResourceAccessScope = {
  cache?: ResourceAccessRequestCache;
  jwtRole?: UserRole;
};

const CACHE_KEY = 'resourceAccessCache';

export function grantsCacheKey(resourceType: ResourceType, resourceId: string): string {
  return `${resourceType}:${resourceId}`;
}

export function getOrCreateRequestCache(c: Context): ResourceAccessRequestCache {
  const existing = c.get(CACHE_KEY) as ResourceAccessRequestCache | undefined;
  if (existing) return existing;
  const cache: ResourceAccessRequestCache = {
    userAccessProfiles: new Map(),
    platformAdmin: new Map(),
    grantsByResource: new Map(),
    channelRowsById: new Map(),
  };
  c.set(CACHE_KEY, cache);
  return cache;
}

export function getRequestCache(c: Context): ResourceAccessRequestCache | undefined {
  return c.get(CACHE_KEY) as ResourceAccessRequestCache | undefined;
}

export function scopeFromContext(c: Context): ResourceAccessScope {
  const user = c.get('user') as { role: UserRole } | undefined;
  return {
    cache: getOrCreateRequestCache(c),
    jwtRole: user?.role,
  };
}

export async function loadUserAccessProfileCached(
  userId: string,
  cache?: ResourceAccessRequestCache,
): Promise<UserAccessProfile> {
  if (cache?.userAccessProfiles.has(userId)) {
    return cache.userAccessProfiles.get(userId)!;
  }
  const profile = await loadUserAccessProfile(userId);
  cache?.userAccessProfiles.set(userId, profile);
  return profile;
}

export function invalidateResourceGrantCache(
  cache: ResourceAccessRequestCache | undefined,
  resourceType: ResourceType,
  resourceId: string,
): void {
  cache?.grantsByResource.delete(grantsCacheKey(resourceType, resourceId));
}

declare module 'hono' {
  interface ContextVariableMap {
    resourceAccessCache: ResourceAccessRequestCache;
  }
}
