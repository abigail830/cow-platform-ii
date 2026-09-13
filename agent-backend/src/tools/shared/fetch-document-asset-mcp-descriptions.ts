/** MCP tool description only — keep free of heavy imports (sharp) for serverless cold start. */

export const FETCH_DOCUMENT_ASSET_MCP_DESCRIPTION = [
  'Fetch a parsed document bundle image referenced in markdown (hybrid_search chunks or PageIndex section content).',
  'Prerequisite: document_id from result.source.document_id, hybrid_search hit, get_section_content, or get_document; path from markdown_out/… in content or parsed from …/assets/{path} in a platform asset URL.',
  'path accepts bundle-relative paths (markdown_out/foo.jpg) or a full/copy-pasted platform asset URL whose document_id matches document_id.',
  'Returns JSON metadata plus a vision-ready image_data_uri (base64 data URI, resized for model input) when the asset can be embedded; fetch_url is always included as OSS presigned fallback.',
  'Use when content contains ![alt](…/documents/{id}/assets/…) or legacy ![alt](markdown_out/…) with the same document_id.',
  'Do not invent paths; only fetch images explicitly referenced in retrieved content.',
].join(' ');

export type McpToolContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };
