import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  isBundleImageRelativePath,
  normalizeBundleRelativePath,
} from './document-files.ts';

export const DOCUMENT_ASSET_API_PREFIX = '/api/knowledge/documents';
export const ASSET_TICKET_TTL_SECONDS = 900;

const PLATFORM_ASSET_PATH_RE =
  /^(?:https?:\/\/[^/]+)?\/api\/knowledge\/documents\/([0-9a-f-]{36})\/assets\/(.+)$/i;

function ticketSecret(): string {
  const secret = process.env.ASSET_TICKET_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error('JWT_SECRET or ASSET_TICKET_SECRET is required for asset tickets');
  return secret;
}

export function documentAssetApiPath(documentId: string, bundleRelativePath: string): string {
  const rel = bundleRelativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
  return `${DOCUMENT_ASSET_API_PREFIX}/${documentId}/assets/${rel}`;
}

export function platformAssetUrl(
  documentId: string,
  bundleRelativePath: string,
  apiOrigin?: string | null,
): string {
  const path = documentAssetApiPath(documentId, bundleRelativePath);
  const origin = apiOrigin?.trim().replace(/\/$/, '');
  return origin ? `${origin}${path}` : path;
}

export type ParsedPlatformAssetUrl = {
  documentId: string;
  path: string;
};

export function parsePlatformAssetUrl(src: string): ParsedPlatformAssetUrl | null {
  const trimmed = src.trim();
  const match = PLATFORM_ASSET_PATH_RE.exec(trimmed);
  if (!match) return null;
  try {
    return {
      documentId: match[1]!,
      path: decodeURIComponent(match[2]!),
    };
  } catch {
    return null;
  }
}

export function assertAllowedBundleAssetPath(rawPath: string, fileHash: string): string {
  let decoded = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    throw new Error('Invalid asset path encoding');
  }
  if (decoded.includes('..') || /%2e%2e/i.test(rawPath)) {
    throw new Error('Invalid asset path');
  }
  const rel = normalizeBundleRelativePath(fileHash, decoded);
  if (!rel) throw new Error('Invalid asset path');
  if (!isBundleImageRelativePath(rel) && !rel.startsWith('markdown_out/')) {
    throw new Error('Asset path is not an allowed bundle image');
  }
  return rel;
}

export function signAssetTicket(documentId: string, bundleRelativePath: string, exp: number): string {
  const payload = `${documentId}\n${bundleRelativePath}\n${exp}`;
  return createHmac('sha256', ticketSecret()).update(payload).digest('hex');
}

export function verifyAssetTicket(
  documentId: string,
  bundleRelativePath: string,
  expRaw: string,
  sigRaw: string,
): boolean {
  const exp = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(exp) || exp <= 0) return false;
  const now = Math.floor(Date.now() / 1000);
  if (exp < now) return false;
  if (exp - now > ASSET_TICKET_TTL_SECONDS + 60) return false;

  const sig = sigRaw.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sig)) return false;

  const expected = signAssetTicket(documentId, bundleRelativePath, exp);
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function buildDocumentAssetTicketUrl(
  documentId: string,
  bundleRelativePath: string,
  nowSec = Math.floor(Date.now() / 1000),
): { path: string; url: string; exp: number } {
  const path = bundleRelativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
  const exp = nowSec + ASSET_TICKET_TTL_SECONDS;
  const sig = signAssetTicket(documentId, path, exp);
  const base = documentAssetApiPath(documentId, path);
  return {
    path,
    url: `${base}?exp=${exp}&sig=${sig}`,
    exp,
  };
}

export function extractDocumentAssetRequestPath(
  requestPath: string,
): { documentId: string; assetPath: string } | null {
  const normalized = (requestPath.split('?')[0] ?? requestPath).replace(/\/+$/, '') || '/';

  // Vercel / root-mounted Hono: full path includes /api/knowledge/documents/...
  const full = PLATFORM_ASSET_PATH_RE.exec(normalized);
  if (full?.[1] && full[2]) {
    try {
      return { documentId: full[1], assetPath: decodeURIComponent(full[2]) };
    } catch {
      return null;
    }
  }

  // Sub-app relative path when mounted at /api/knowledge/documents: /{id}/assets/...
  const rel = normalized.match(/^\/([0-9a-f-]{36})\/assets\/(.+)$/i);
  if (rel?.[1] && rel[2]) {
    try {
      return { documentId: rel[1], assetPath: decodeURIComponent(rel[2]) };
    } catch {
      return null;
    }
  }

  return null;
}

/** Normalize MCP/HTTP input: bundle-relative path or platform asset URL (must match document_id). */
export function resolveDocumentAssetPathInput(documentId: string, pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  const withoutQuery = trimmed.split('?')[0] ?? trimmed;
  const parsed = parsePlatformAssetUrl(withoutQuery);
  if (parsed) {
    if (parsed.documentId !== documentId) {
      throw new Error('path document_id does not match document_id argument');
    }
    return parsed.path;
  }
  return withoutQuery.replace(/^\.\//, '').replace(/^\/+/, '');
}
