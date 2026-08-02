import { callRerankApi } from './rerank-provider.ts';
import type { RerankClient } from '../ports.ts';
import { DEFAULT_RERANK_INSTRUCT } from '../constants.ts';

export function createRerankClient(): RerankClient {
  return {
    async rerank({ connection, query, documents, topN, instruct }) {
      if (documents.length === 0) return [];

      const timeoutRaw = connection.extraConfig.request_timeout_ms ?? connection.extraConfig.requestTimeoutMs;
      const timeoutMs = typeof timeoutRaw === 'number' ? timeoutRaw : 30_000;
      const defaultInstruct =
        (typeof connection.extraConfig.instruct === 'string' && connection.extraConfig.instruct) ||
        DEFAULT_RERANK_INSTRUCT;

      return callRerankApi({
        baseUrl: connection.baseUrl,
        apiKey: connection.apiKey,
        modelName: connection.modelName,
        query,
        documents,
        topN,
        instruct: instruct ?? defaultInstruct,
        extraConfig: connection.extraConfig,
        timeoutMs,
      });
    },
  };
}
