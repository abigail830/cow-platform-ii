import type { AuthUser } from '../../auth/jwt.ts';
import {
  KNOWLEDGE_MANAGEMENT_CATEGORY,
  KNOWLEDGE_MANAGEMENT_RESOURCES,
} from '../../auth/rbac-catalog.ts';
import { userHasResourcePermission } from '../../auth/rbac.ts';
import {
  getDocumentChannelIdForDocument,
  resolveChannelPermission,
  satisfiesResourcePermission,
} from '../../auth/resource-access.ts';
import { isStorageEnabled } from '../../infrastructure/oss/s3-config.ts';
import {
  assertAllowedBundleAssetPath,
  ASSET_TICKET_TTL_SECONDS,
  documentAssetApiPath,
  resolveDocumentAssetPathInput,
} from '../infrastructure/document-asset-url.ts';
import {
  getStorageReadUrl,
  resolveDocumentStorageKey,
} from '../infrastructure/document-files.ts';
import { getDocumentById } from './documents.ts';

export type DocumentAssetFetchResult = {
  document_id: string;
  path: string;
  platform_asset_path: string;
  /** Short-lived OSS presigned GET URL (~900s) — fetch image bytes directly. */
  fetch_url: string;
  expires_in_seconds: number;
  content_type: string | null;
};

function contentTypeFromAssetPath(path: string): string | null {
  const ext = path.split('/').pop()?.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    svg: 'image/svg+xml',
  };
  return map[ext] ?? null;
}

export async function fetchDocumentAssetForUser(
  user: AuthUser,
  input: { document_id: string; path: string },
): Promise<DocumentAssetFetchResult> {
  if (!isStorageEnabled()) {
    throw new Error('Object storage is not configured');
  }

  const allowed = await userHasResourcePermission(
    user.id,
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS,
    'read',
    { jwtRole: user.role },
  );
  if (!allowed) throw new Error('Forbidden');

  const channelId = await getDocumentChannelIdForDocument(input.document_id);
  if (!channelId) throw new Error('Document not found');

  const channelAllowed = await resolveChannelPermission(user.id, channelId, null).then((flags) =>
    satisfiesResourcePermission(flags, 'read'),
  );
  if (!channelAllowed) throw new Error('Forbidden');

  const row = await getDocumentById(input.document_id);
  if (!row) throw new Error('Document not found');

  const bundlePath = resolveDocumentAssetPathInput(input.document_id, input.path);
  const rel = assertAllowedBundleAssetPath(bundlePath, row.fileHash);
  const fetchUrl = await getStorageReadUrl(resolveDocumentStorageKey(row.fileHash, rel));

  return {
    document_id: input.document_id,
    path: rel,
    platform_asset_path: documentAssetApiPath(input.document_id, rel),
    fetch_url: fetchUrl,
    expires_in_seconds: ASSET_TICKET_TTL_SECONDS,
    content_type: contentTypeFromAssetPath(rel),
  };
}
