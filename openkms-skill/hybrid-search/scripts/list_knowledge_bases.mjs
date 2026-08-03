#!/usr/bin/env node
/** CLI fallback: list hybrid-searchable knowledge bases. Prefer MCP tool list_knowledge_bases. */

import { parseArgs } from 'node:util';
import { OpenKmsClientError, eprintError, requestJson } from '../../shared/_client.mjs';

const { values: args } = parseArgs({
  options: {
    'group-by-embedding': { type: 'boolean', default: false },
  },
});

try {
  const data = await requestJson('GET', '/api/hybrid-search/knowledge-bases');
  const items = data && typeof data === 'object' && Array.isArray(data.items) ? data.items : [];
  const visibleIds = items
    .filter((item) => item && typeof item === 'object' && item.id)
    .map((item) => String(item.id));

  /** @type {Record<string, unknown>} */
  let payload;
  if (args['group-by-embedding']) {
    /** @type {Record<string, object[]>} */
    const groups = {};
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const embId = String(item.embedding_model_config_id ?? 'unknown');
      if (!groups[embId]) groups[embId] = [];
      groups[embId].push(item);
    }
    payload = {
      visible_ids: visibleIds,
      groups: Object.entries(groups).map(([embId, group]) => ({
        embedding_model_config_id: embId,
        embedding_model_name: group[0]?.embedding_model_name ?? null,
        items: group,
      })),
    };
  } else {
    payload = { visible_ids: visibleIds, items };
  }

  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
} catch (err) {
  eprintError(err);
  process.exit(err instanceof OpenKmsClientError && err.status === 403 ? 2 : 1);
}
