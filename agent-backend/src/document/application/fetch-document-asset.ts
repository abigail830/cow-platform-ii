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
import { readStorageBuffer } from '../../infrastructure/oss/storage-read.ts';
import { isStorageEnabled } from '../../infrastructure/oss/s3-config.ts';
import {
  assertAllowedBundleAssetPath,
  ASSET_TICKET_TTL_SECONDS,
  documentAssetApiPath,
  resolveDocumentAssetPathInput,
} from '../infrastructure/document-asset-url.ts';
import { bundleImagePathCandidates } from '../infrastructure/bundle-image-path-candidates.ts';
import {
  getStorageReadUrl,
  resolveDocumentStorageKey,
} from '../infrastructure/document-files.ts';
import {
  preprocessDocumentAssetImage,
  type PreprocessedDocumentAssetImage,
} from './preprocess-document-asset-image.ts';
import { getDocumentById } from './documents.ts';

export type DocumentAssetVisionResult =
  | {
      status: 'success';
      width: number;
      height: number;
      original_width: number | null;
      original_height: number | null;
      mime_type: string;
      bytes: number;
      image_data_uri: string;
      note: string;
    }
  | {
      status: 'skipped';
      reason: string;
    };

export type DocumentAssetFetchResult = {
  document_id: string;
  path: string;
  platform_asset_path: string;
  /** Short-lived OSS presigned GET URL (~900s) — fetch image bytes directly. */
  fetch_url: string;
  expires_in_seconds: number;
  content_type: string | null;
  vision: DocumentAssetVisionResult;
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

async function assertDocumentAssetReadAccess(
  user: AuthUser,
  documentId: string,
): Promise<{ fileHash: string }> {
  const allowed = await userHasResourcePermission(
    user.id,
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.DOCUMENTS,
    'read',
    { jwtRole: user.role },
  );
  if (!allowed) throw new Error('Forbidden');

  const channelId = await getDocumentChannelIdForDocument(documentId);
  if (!channelId) throw new Error('Document not found');

  const channelAllowed = await resolveChannelPermission(user.id, channelId, null).then((flags) =>
    satisfiesResourcePermission(flags, 'read'),
  );
  if (!channelAllowed) throw new Error('Forbidden');

  const row = await getDocumentById(documentId);
  if (!row) throw new Error('Document not found');

  return { fileHash: row.fileHash };
}

async function readBundleImageBytes(
  fileHash: string,
  bundlePathInput: string,
): Promise<{ rel: string; buffer: Buffer }> {
  const candidates = bundleImagePathCandidates(bundlePathInput);
  for (const candidate of candidates) {
    try {
      const rel = assertAllowedBundleAssetPath(candidate, fileHash);
      const buffer = await readStorageBuffer(resolveDocumentStorageKey(fileHash, rel));
      if (buffer) return { rel, buffer };
    } catch {
      // Try jpeg/jpg or markdown_out path variants.
    }
  }
  throw new Error('Document asset image not found in bundle storage');
}

function visionFromPreprocess(preprocessed: PreprocessedDocumentAssetImage): DocumentAssetVisionResult {
  return {
    status: 'success',
    width: preprocessed.width,
    height: preprocessed.height,
    original_width: preprocessed.originalWidth,
    original_height: preprocessed.originalHeight,
    mime_type: preprocessed.mimeType,
    bytes: preprocessed.bytes,
    image_data_uri: preprocessed.dataUri,
    note: preprocessed.note,
  };
}

export async function fetchDocumentAssetForUser(
  user: AuthUser,
  input: { document_id: string; path: string; max_dimension?: number },
): Promise<DocumentAssetFetchResult> {
  if (!isStorageEnabled()) {
    throw new Error('Object storage is not configured');
  }

  const { fileHash } = await assertDocumentAssetReadAccess(user, input.document_id);
  const bundlePath = resolveDocumentAssetPathInput(input.document_id, input.path);
  const { rel, buffer } = await readBundleImageBytes(fileHash, bundlePath);
  const fetchUrl = await getStorageReadUrl(resolveDocumentStorageKey(fileHash, rel));

  let vision: DocumentAssetVisionResult;
  try {
    const preprocessed = await preprocessDocumentAssetImage(buffer, {
      maxDimension: input.max_dimension,
    });
    vision = visionFromPreprocess(preprocessed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Vision preprocess failed';
    vision = { status: 'skipped', reason };
  }

  return {
    document_id: input.document_id,
    path: rel,
    platform_asset_path: documentAssetApiPath(input.document_id, rel),
    fetch_url: fetchUrl,
    expires_in_seconds: ASSET_TICKET_TTL_SECONDS,
    content_type: contentTypeFromAssetPath(rel),
    vision,
  };
}

export function base64FromImageDataUri(dataUri: string): string {
  const idx = dataUri.indexOf(',');
  return idx >= 0 ? dataUri.slice(idx + 1) : dataUri;
}
