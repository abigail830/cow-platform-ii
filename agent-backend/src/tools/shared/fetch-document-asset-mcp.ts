import type { AuthUser } from '../../auth/jwt.ts';
import { fetchDocumentAssetForUser } from '../../document/application/fetch-document-asset.ts';
import { redactSecrets } from '../../infrastructure/redact-secrets.ts';

export const FETCH_DOCUMENT_ASSET_MCP_DESCRIPTION = [
  'Fetch a parsed document bundle image referenced in markdown (hybrid_search chunks or PageIndex section content).',
  'Prerequisite: document_id from result.source.document_id, hybrid_search hit, get_section_content, or get_document; path from markdown_out/… in content or parsed from …/assets/{path} in a platform asset URL.',
  'path accepts bundle-relative paths (markdown_out/foo.jpg) or a full/copy-pasted platform asset URL whose document_id matches document_id.',
  'Returns fetch_url: a short-lived OSS presigned GET (~900s) for downloading image bytes; platform_asset_path is the stable API path.',
  'Use when content contains ![alt](…/documents/{id}/assets/…) or legacy ![alt](markdown_out/…) with the same document_id.',
  'Do not invent paths; only fetch images explicitly referenced in retrieved content.',
].join(' ');

export async function fetchDocumentAssetMcpText(
  user: AuthUser,
  input: { document_id: string; path: string },
): Promise<string> {
  const result = await fetchDocumentAssetForUser(user, input);
  return redactSecrets(JSON.stringify(result, null, 2));
}
