#!/usr/bin/env node
/** Run hybrid search over visible knowledge bases. */

import { parseArgs } from 'node:util';
import { OpenKmsClientError, eprintError, requestJson } from '../../shared/_client.mjs';

const DEFAULT_TOP_K = 10;
const DEFAULT_SEARCH_TYPE = 'all';
const DEFAULT_RRF_K = 60;
const DEFAULT_RECALL_K = 25;

/** @param {string | undefined} raw */
function parseKbIds(raw) {
  if (!raw) return null;
  const ids = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return ids.length ? ids : null;
}

async function fetchVisibleIds() {
  const data = await requestJson('GET', '/api/hybrid-search/knowledge-bases');
  const items = data && typeof data === 'object' && Array.isArray(data.items) ? data.items : [];
  const visible = items
    .filter((item) => item && typeof item === 'object' && item.id)
    .map((item) => String(item.id));
  return visible;
}

/** @param {string[] | null} requested @param {string[]} visible */
function resolveKbIds(requested, visible) {
  if (!visible.length) {
    throw new OpenKmsClientError('No searchable knowledge bases visible to this API key.');
  }
  if (requested == null) return visible;
  const illegal = requested.filter((kbId) => !visible.includes(kbId));
  if (illegal.length) {
    throw new OpenKmsClientError(
      `Knowledge base IDs not visible or invalid: ${illegal.join(', ')}. Re-run list_knowledge_bases.`,
    );
  }
  return requested;
}

const { values: args } = parseArgs({
  options: {
    query: { type: 'string', short: 'q' },
    'kb-ids': { type: 'string' },
    'top-k': { type: 'string', default: String(DEFAULT_TOP_K) },
    'search-type': { type: 'string', default: DEFAULT_SEARCH_TYPE },
    'recall-k': { type: 'string', default: String(DEFAULT_RECALL_K) },
    'rrf-k': { type: 'string', default: String(DEFAULT_RRF_K) },
    'no-bm25': { type: 'boolean', default: false },
    'rerank-model-id': { type: 'string' },
    pretty: { type: 'boolean', default: false },
  },
});

if (!args.query?.trim()) {
  console.error('Missing required --query');
  process.exit(1);
}

try {
  const visible = await fetchVisibleIds();
  const kbIds = resolveKbIds(parseKbIds(args['kb-ids']), visible);

  /** @type {Record<string, unknown>} */
  const body = {
    query: args.query.trim(),
    knowledge_base_ids: kbIds,
    search_type: args['search-type'],
    top_k: Number(args['top-k']) || DEFAULT_TOP_K,
    settings: {
      bm25_enabled: !args['no-bm25'],
      rrf_k: Number(args['rrf-k']) || DEFAULT_RRF_K,
      recall_k: Number(args['recall-k']) || DEFAULT_RECALL_K,
    },
  };
  if (args['rerank-model-id']) {
    /** @type {Record<string, unknown>} */ (body.settings).rerank_model_config_id =
      args['rerank-model-id'];
  }

  const result = await requestJson('POST', '/api/hybrid-search', { body });
  console.log(JSON.stringify(result, null, 2));

  if (args.pretty && result && typeof result === 'object' && Array.isArray(result.items)) {
    console.error(`\n${result.items.length} result(s) from ${kbIds.length} KB(s)`);
    for (const [idx, item] of result.items.slice(0, 10).entries()) {
      if (!item || typeof item !== 'object') continue;
      const kb = item.knowledge_base_name ?? '?';
      const source = item.source_name ?? '?';
      const score = item.score;
      console.error(`  ${idx + 1}. [${score}] ${kb} — ${source}`);
    }
  }

  process.exit(0);
} catch (err) {
  eprintError(err);
  process.exit(err instanceof OpenKmsClientError && err.status === 403 ? 2 : 1);
}
