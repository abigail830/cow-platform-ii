import type { AuthUser } from '../api/auth.ts';
import {
  ADMIN_PAGES,
  EVALUATION_PAGES,
  KNOWLEDGE_MANAGEMENT_PAGES,
  PLATFORM_BASIC_PAGES,
} from './admin-nav.ts';
import { hasPermission } from './permissions.ts';
import { visibleAgentPages } from './agent-nav.ts';

export type AppLayoutMode = 'home' | 'flat' | 'admin';

export function getAppLayoutMode(pathname: string): AppLayoutMode {
  if (pathname === '/') return 'home';
  if (isAdminSectionPath(pathname)) return 'admin';
  if (isFlatSectionPath(pathname)) return 'flat';
  return 'home';
}

export function isAdminSectionPath(pathname: string): boolean {
  return pathname.startsWith('/evaluation/') || pathname.startsWith('/admin/');
}

export function isFlatSectionPath(pathname: string): boolean {
  return (
    pathname.startsWith('/agents/') ||
    pathname.startsWith('/knowledge/') ||
    pathname === '/chat' ||
    pathname.startsWith('/chat/') ||
    pathname.startsWith('/settings/')
  );
}

export function isAgentsSectionPath(pathname: string): boolean {
  return pathname.startsWith('/agents/') || pathname === '/chat' || pathname.startsWith('/chat/');
}

export function isKnowledgeSectionPath(pathname: string): boolean {
  return pathname.startsWith('/knowledge/');
}

/** First admin-section route the user may open (Evaluation → Platform basic → Administration). */
export function resolveDefaultAdminPath(user: AuthUser): string {
  const candidates = [
    ...EVALUATION_PAGES,
    ...PLATFORM_BASIC_PAGES,
    ...ADMIN_PAGES,
  ].filter((item) => hasPermission(user, item.permissionKey, 'read'));
  return candidates[0]?.path ?? '/';
}

/** First agents route the user may open. */
export function resolveDefaultAgentsPath(user: AuthUser): string {
  return visibleAgentPages(user)[0]?.path ?? '/';
}

/** First knowledge route the user may open. */
export function resolveDefaultKnowledgePath(user: AuthUser): string {
  const candidates = KNOWLEDGE_MANAGEMENT_PAGES.filter((item) =>
    hasPermission(user, item.permissionKey, 'read'),
  );
  return candidates[0]?.path ?? '/';
}
