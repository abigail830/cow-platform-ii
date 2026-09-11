import type { OpenAPIV3_1 } from 'openapi-types';

type Operation = OpenAPIV3_1.OperationObject;

const TAG_RULES: Array<{ prefix: string; tag: string }> = [
  { prefix: '/api/auth', tag: 'Auth' },
  { prefix: '/api/user/api-keys', tag: 'Auth' },
  { prefix: '/api/knowledge/document-channels', tag: 'Knowledge · Document Channels' },
  { prefix: '/api/knowledge/documents', tag: 'Knowledge · Documents' },
  { prefix: '/api/knowledge/captures', tag: 'Knowledge · Captures' },
  { prefix: '/api/knowledge/knowledge-bases', tag: 'Knowledge · Knowledge Bases' },
  { prefix: '/api/knowledge/hybrid-search', tag: 'Knowledge · Hybrid Search' },
  { prefix: '/api/knowledge/asr-hotwords', tag: 'Knowledge · ASR Hotwords' },
  { prefix: '/api/evaluation', tag: 'Evaluation' },
  { prefix: '/api/admin', tag: 'Admin' },
  { prefix: '/api/mcp', tag: 'MCP' },
];

function tagForPath(path: string): string {
  for (const rule of TAG_RULES) {
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) {
      return rule.tag;
    }
  }
  if (path.startsWith('/api/')) return 'API';
  return 'System';
}

function isPublicPath(path: string, method: string): boolean {
  if (path === '/api/auth/login' && method === 'post') return true;
  if (path === '/health' && method === 'get') return true;
  return false;
}

/** Add tags + JWT security after hono-openapi generates the base spec. */
export function enrichOpenApiSpec(spec: OpenAPIV3_1.Document): OpenAPIV3_1.Document {
  const paths = spec.paths ?? {};
  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const [method, operation] of Object.entries(item)) {
      if (!operation || typeof operation !== 'object' || method === 'parameters') continue;
      const op = operation as Operation;
      const tag = tagForPath(path);
      op.tags = Array.from(new Set([...(op.tags ?? []), tag]));
      if (path.startsWith('/api/') && !isPublicPath(path, method)) {
        op.security = [{ bearerAuth: [] }];
      }
      if (!op.summary && op.operationId) {
        op.summary = op.operationId;
      }
    }
  }

  const tagNames = new Set<string>();
  for (const item of Object.values(paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const operation of Object.values(item)) {
      if (!operation || typeof operation !== 'object') continue;
      for (const tag of (operation as Operation).tags ?? []) {
        tagNames.add(tag);
      }
    }
  }

  return {
    ...spec,
    tags: [...tagNames].sort().map((name) => ({ name })),
  };
}
