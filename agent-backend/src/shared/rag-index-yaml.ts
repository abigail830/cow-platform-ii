/**
 * Pure RAG index workflow YAML helpers (no DB).
 */
import { parse as parseYaml } from 'yaml';
import type { KbChunkConfig } from '../db/schema.ts';
import { DEFAULT_KB_CHUNK_CONFIG } from '../db/schema.ts';
import { readCliPackagedDefaultConfigYaml } from './cli-workflow-defaults.ts';
import { RAG_KB_PIPELINE_NAME } from './pipeline-catalog.ts';

export type RagIndexYamlConfig = {
  modelName: string;
  dimensions: number;
  chunk: KbChunkConfig;
};

function parseDimensions(raw: unknown): number {
  const dimensions =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(dimensions) || dimensions < 1 || dimensions > 65536) {
    throw new Error(
      `RAG index config missing or invalid dimensions (got ${String(raw)}). ` +
        `Set it in Admin → Pipelines → ${RAG_KB_PIPELINE_NAME} Config YAML.`,
    );
  }
  return Math.trunc(dimensions);
}

function parseChunk(raw: unknown): KbChunkConfig {
  if (raw == null) return { ...DEFAULT_KB_CHUNK_CONFIG };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`RAG index config "chunk" must be a mapping`);
  }
  const map = raw as Record<string, unknown>;
  const strategyRaw = String(map.strategy ?? DEFAULT_KB_CHUNK_CONFIG.strategy).trim();
  const strategy =
    strategyRaw === 'fixed_size' || strategyRaw === 'paragraph' || strategyRaw === 'markdown_header'
      ? strategyRaw
      : DEFAULT_KB_CHUNK_CONFIG.strategy;

  const hasSizeKnob = map.chunk_size != null || map.chunk_overlap != null;
  // markdown_header: size knobs optional (omit = header-only split).
  // paragraph: size knobs optional (omit = one chunk per paragraph).
  // fixed_size: size knobs required (defaulted when omitted).
  if (strategy !== 'fixed_size' && !hasSizeKnob) {
    return { strategy };
  }

  const chunkSizeRaw = map.chunk_size ?? DEFAULT_KB_CHUNK_CONFIG.chunk_size;
  const chunkOverlapRaw = map.chunk_overlap ?? DEFAULT_KB_CHUNK_CONFIG.chunk_overlap;
  const chunk_size =
    typeof chunkSizeRaw === 'number'
      ? chunkSizeRaw
      : typeof chunkSizeRaw === 'string'
        ? Number(chunkSizeRaw)
        : DEFAULT_KB_CHUNK_CONFIG.chunk_size!;
  const chunk_overlap =
    typeof chunkOverlapRaw === 'number'
      ? chunkOverlapRaw
      : typeof chunkOverlapRaw === 'string'
        ? Number(chunkOverlapRaw)
        : DEFAULT_KB_CHUNK_CONFIG.chunk_overlap!;

  if (!Number.isFinite(chunk_size) || chunk_size < 1) {
    throw new Error('RAG index config chunk.chunk_size must be a positive number');
  }
  if (!Number.isFinite(chunk_overlap) || chunk_overlap < 0) {
    throw new Error('RAG index config chunk.chunk_overlap must be >= 0');
  }

  return {
    strategy,
    chunk_size: Math.trunc(chunk_size),
    chunk_overlap: Math.trunc(chunk_overlap),
  };
}

export function parseRagIndexYaml(raw: string, source: string): RagIndexYamlConfig {
  let data: unknown;
  try {
    data = parseYaml(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid YAML';
    throw new Error(`Invalid RAG index config YAML (${source}): ${message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`RAG index config YAML must be a mapping (${source})`);
  }
  const map = data as Record<string, unknown>;
  const modelName = String(map.model_name ?? '').trim();
  if (!modelName) {
    throw new Error(
      `RAG index config missing model_name. Set it in Admin → Pipelines → ${RAG_KB_PIPELINE_NAME} Config YAML.`,
    );
  }
  return {
    modelName,
    dimensions: parseDimensions(map.dimensions),
    chunk: parseChunk(map.chunk),
  };
}

export function resolveRagIndexWorkflowYamlText(pipeline: {
  configYaml?: string | null;
} | null | undefined): { yaml: string; source: string; configYamlSnapshot: string | null } {
  const override = pipeline?.configYaml?.trim() || null;
  if (override) {
    return { yaml: override, source: 'pipeline.config_yaml', configYamlSnapshot: override };
  }
  const packaged = readCliPackagedDefaultConfigYaml(RAG_KB_PIPELINE_NAME);
  if (!packaged?.trim()) {
    throw new Error(
      `No RAG index worker config found for pipeline ${RAG_KB_PIPELINE_NAME} ` +
        `(set Admin Config YAML or package openkms-cli/workflows/${RAG_KB_PIPELINE_NAME}.yml)`,
    );
  }
  return {
    yaml: packaged,
    source: 'cli packaged default',
    configYamlSnapshot: null,
  };
}
