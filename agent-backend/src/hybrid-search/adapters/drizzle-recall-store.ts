import { getPool } from '../../db/pool.ts';
import type { RecallStore } from '../ports.ts';
import {
  mergeRecallLists,
  queryDenseChunks,
  queryDenseFaqs,
  queryLexicalChunks,
  queryLexicalFaqs,
} from './drizzle-recall-queries.ts';

export function createDrizzleRecallStore(): RecallStore {
  const pool = getPool();

  return {
    async denseRecall({ kbIds, kbNames, embeddingGroupId, queryVector, searchType, limit }) {
      const lists = [];
      if (searchType === 'all' || searchType === 'chunks') {
        lists.push(
          await queryDenseChunks(pool, { kbIds, queryVector, limit, kbNames, embeddingGroupId }),
        );
      }
      if (searchType === 'all' || searchType === 'faqs') {
        lists.push(
          await queryDenseFaqs(pool, { kbIds, queryVector, limit, kbNames, embeddingGroupId }),
        );
      }
      return mergeRecallLists(lists, limit);
    },

    async lexicalRecall({ kbIds, kbNames, embeddingGroupId, query, searchType, limit }) {
      const lists = [];
      if (searchType === 'all' || searchType === 'chunks') {
        lists.push(
          await queryLexicalChunks(pool, { kbIds, query, limit, kbNames, embeddingGroupId }),
        );
      }
      if (searchType === 'all' || searchType === 'faqs') {
        lists.push(
          await queryLexicalFaqs(pool, { kbIds, query, limit, kbNames, embeddingGroupId }),
        );
      }
      return mergeRecallLists(lists, limit);
    },
  };
}
