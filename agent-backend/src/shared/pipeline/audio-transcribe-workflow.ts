import { parse as parseYaml } from 'yaml';
import { readCliPackagedDefaultConfigYaml } from './cli-workflow-defaults.ts';
import type { PipelineConfigRow } from './pipeline-config-store.ts';

export function workflowAsrModelDisplayName(config: Record<string, unknown>): string | null {
  const top = String(config.model_name ?? '').trim();
  if (top) return top;
  const asr = config.asr;
  if (typeof asr === 'object' && asr !== null && !Array.isArray(asr)) {
    const nested = String((asr as Record<string, unknown>).model_name ?? '').trim();
    if (nested) return nested;
  }
  return null;
}

export function resolveAudioTranscribeWorkflowYaml(pipeline: PipelineConfigRow): string | null {
  const override = pipeline.configYaml?.trim();
  if (override) return override;
  return readCliPackagedDefaultConfigYaml(pipeline.pipelineName);
}

export function parseAudioTranscribeWorkflowYaml(raw: string, source: string): Record<string, unknown> {
  const text = raw.trim();
  if (!text) throw new Error(`Empty audio transcribe workflow (${source})`);
  const data = parseYaml(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Audio transcribe workflow must be a mapping (${source})`);
  }
  return data as Record<string, unknown>;
}

export function audioTranscribeModelDisplayNameFromPipeline(pipeline: PipelineConfigRow): string | null {
  const yaml = resolveAudioTranscribeWorkflowYaml(pipeline);
  if (!yaml) return null;
  const config = parseAudioTranscribeWorkflowYaml(yaml, pipeline.pipelineName);
  return workflowAsrModelDisplayName(config);
}
