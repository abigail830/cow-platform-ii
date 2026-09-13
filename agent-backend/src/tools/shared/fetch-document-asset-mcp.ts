import type { AuthUser } from '../../auth/jwt.ts';
import { redactSecrets } from '../../infrastructure/redact-secrets.ts';
import type { McpToolContentBlock } from './fetch-document-asset-mcp-descriptions.ts';

export type { McpToolContentBlock } from './fetch-document-asset-mcp-descriptions.ts';

export async function fetchDocumentAssetMcpContent(
  user: AuthUser,
  input: { document_id: string; path: string; max_dimension?: number },
): Promise<{ content: McpToolContentBlock[] }> {
  const { base64FromImageDataUri, fetchDocumentAssetForUser } = await import(
    '../../document/application/fetch-document-asset.ts'
  );
  const result = await fetchDocumentAssetForUser(user, input);
  const text = redactSecrets(JSON.stringify(result, null, 2));
  const content: McpToolContentBlock[] = [{ type: 'text', text }];

  if (result.vision.status === 'success') {
    content.push({
      type: 'image',
      data: base64FromImageDataUri(result.vision.image_data_uri),
      mimeType: result.vision.mime_type,
    });
  }

  return { content };
}
