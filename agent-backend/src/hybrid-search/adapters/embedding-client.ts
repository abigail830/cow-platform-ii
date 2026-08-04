import { embeddingSupportsDimensions } from '../../shared/embedding-provider.ts';
import { outboundFetch } from '../../shared/outbound-fetch.ts';
import type { EmbeddingClient, ModelConnection } from '../ports.ts';

function embeddingsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/$/, '');
  return base.endsWith('/v1') ? `${base}/embeddings` : `${base}/v1/embeddings`;
}

function decodeEmbeddingValue(emb: unknown): number[] {
  if (Array.isArray(emb)) return emb.map((v) => Number(v));
  if (typeof emb === 'string') {
    const buf = Buffer.from(emb, 'base64');
    const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    return [...floats];
  }
  throw new Error('Unexpected embedding response format');
}

export function createOpenAiCompatibleEmbeddingClient(): EmbeddingClient {
  return {
    async embedQuery(connection, query, dimensions) {
      const body: Record<string, unknown> = {
        model: connection.modelName,
        input: query,
        encoding_format: 'float',
      };
      if (
        dimensions != null &&
        embeddingSupportsDimensions({
          modelId: connection.modelName,
          baseUrl: connection.baseUrl,
          extraConfig: connection.extraConfig,
        })
      ) {
        body.dimensions = dimensions;
      }

      const url = embeddingsUrl(connection.baseUrl);
      const response = await outboundFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${connection.apiKey ?? 'no-key'}`,
        },
        body: JSON.stringify(body),
        timeoutMs: 60_000,
        retries: 2,
        label: `Embedding API (${connection.configName})`,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
        data?: Array<{ embedding?: unknown }>;
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? `Embedding API failed (${response.status})`);
      }

      const embedding = payload.data?.[0]?.embedding;
      if (embedding == null) throw new Error('Embedding API returned no vector');
      return decodeEmbeddingValue(embedding);
    },
  };
}

export type { ModelConnection };
