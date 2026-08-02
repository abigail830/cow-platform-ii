import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { appModelConfigs, appPipelineConfigs, db } from '../db/index.ts';
import { kbPipelineUiMeta } from './pipeline-catalog.ts';

export type PipelineConfigRow = typeof appPipelineConfigs.$inferSelect;

export type PublicPipelineConfig = {
  id: string;
  name: string;
  description: string | null;
  pipelineName: string;
  commandTemplate: string;
  workflowFile: string | null;
  modelConfigId: string | null;
  modelConfigName: string | null;
  isEnabled: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  category?: 'knowledge' | 'document';
  boundTo?: string;
};

function enrichPipelineUi(pipeline: PublicPipelineConfig): PublicPipelineConfig {
  const meta = kbPipelineUiMeta(pipeline.pipelineName);
  if (!meta) return pipeline;
  return { ...pipeline, category: meta.category, boundTo: meta.boundTo };
}

function toPublicPipeline(
  row: PipelineConfigRow,
  modelName: string | null = null,
): PublicPipelineConfig {
  const base: PublicPipelineConfig = {
    id: row.id,
    name: row.name,
    description: row.description,
    pipelineName: row.pipelineName,
    commandTemplate: row.commandTemplate,
    workflowFile: row.workflowFile,
    modelConfigId: row.modelConfigId,
    modelConfigName: modelName,
    isEnabled: row.isEnabled,
    isSystem: row.isSystem,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return enrichPipelineUi(base);
}

export async function listPipelineConfigs(input?: {
  search?: string;
  enabledOnly?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ pipelines: PublicPipelineConfig[]; total: number }> {
  const page = Math.max(input?.page ?? 1, 1);
  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100);
  const offset = (page - 1) * limit;

  const conditions = [];
  if (input?.enabledOnly) conditions.push(eq(appPipelineConfigs.isEnabled, true));
  if (input?.search?.trim()) {
    const pattern = `%${input.search.trim()}%`;
    conditions.push(
      or(
        ilike(appPipelineConfigs.name, pattern),
        ilike(appPipelineConfigs.pipelineName, pattern),
        ilike(appPipelineConfigs.description, pattern),
      )!,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      pipeline: appPipelineConfigs,
      modelName: appModelConfigs.name,
    })
    .from(appPipelineConfigs)
    .leftJoin(appModelConfigs, eq(appPipelineConfigs.modelConfigId, appModelConfigs.id))
    .where(where)
    .orderBy(desc(appPipelineConfigs.isSystem), desc(appPipelineConfigs.isEnabled), asc(appPipelineConfigs.name))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appPipelineConfigs)
    .where(where);

  return {
    pipelines: rows.map((row) => toPublicPipeline(row.pipeline, row.modelName)),
    total: countRow?.count ?? 0,
  };
}

export async function getPipelineConfigById(id: string): Promise<PublicPipelineConfig | null> {
  const [row] = await db
    .select({
      pipeline: appPipelineConfigs,
      modelName: appModelConfigs.name,
    })
    .from(appPipelineConfigs)
    .leftJoin(appModelConfigs, eq(appPipelineConfigs.modelConfigId, appModelConfigs.id))
    .where(eq(appPipelineConfigs.id, id))
    .limit(1);
  return row ? toPublicPipeline(row.pipeline, row.modelName) : null;
}

export async function getPipelineConfigByPipelineName(
  pipelineName: string,
): Promise<PublicPipelineConfig | null> {
  const [row] = await db
    .select({
      pipeline: appPipelineConfigs,
      modelName: appModelConfigs.name,
    })
    .from(appPipelineConfigs)
    .leftJoin(appModelConfigs, eq(appPipelineConfigs.modelConfigId, appModelConfigs.id))
    .where(eq(appPipelineConfigs.pipelineName, pipelineName))
    .limit(1);
  return row ? toPublicPipeline(row.pipeline, row.modelName) : null;
}

export async function createPipelineConfig(input: {
  name: string;
  description?: string | null;
  pipelineName: string;
  commandTemplate: string;
  workflowFile?: string | null;
  modelConfigId?: string | null;
  isEnabled?: boolean;
}): Promise<PublicPipelineConfig> {
  if (input.modelConfigId) {
    const [model] = await db
      .select({ id: appModelConfigs.id, apiType: appModelConfigs.apiType })
      .from(appModelConfigs)
      .where(eq(appModelConfigs.id, input.modelConfigId))
      .limit(1);
    if (!model) throw new Error('VLM model not found');
    if (model.apiType !== 'vlm') throw new Error('Pipeline model must be a VLM model');
  }

  const [row] = await db
    .insert(appPipelineConfigs)
    .values({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      pipelineName: input.pipelineName.trim(),
      commandTemplate: input.commandTemplate.trim(),
      workflowFile: input.workflowFile?.trim() || null,
      modelConfigId: input.modelConfigId ?? null,
      isEnabled: input.isEnabled ?? true,
      isSystem: false,
    })
    .returning();
  return toPublicPipeline(row!);
}

export async function updatePipelineConfig(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    pipelineName?: string;
    commandTemplate?: string;
    workflowFile?: string | null;
    modelConfigId?: string | null;
    isEnabled?: boolean;
  },
): Promise<PublicPipelineConfig> {
  const existing = await getPipelineConfigById(id);
  if (!existing) throw new Error('Pipeline not found');

  if (existing.isSystem) {
    const forbidden = ['name', 'pipelineName', 'modelConfigId', 'isEnabled'].filter(
      (key) => input[key as keyof typeof input] !== undefined,
    );
    if (forbidden.length > 0) {
      throw new Error(`System pipeline cannot change: ${forbidden.join(', ')}`);
    }
  }

  if (input.modelConfigId) {
    const [model] = await db
      .select({ id: appModelConfigs.id, apiType: appModelConfigs.apiType })
      .from(appModelConfigs)
      .where(eq(appModelConfigs.id, input.modelConfigId))
      .limit(1);
    if (!model) throw new Error('VLM model not found');
    if (model.apiType !== 'vlm') throw new Error('Pipeline model must be a VLM model');
  }

  const [row] = await db
    .update(appPipelineConfigs)
    .set({
      ...(input.name !== undefined && !existing.isSystem ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.pipelineName !== undefined && !existing.isSystem
        ? { pipelineName: input.pipelineName.trim() }
        : {}),
      ...(input.commandTemplate !== undefined ? { commandTemplate: input.commandTemplate.trim() } : {}),
      ...(input.workflowFile !== undefined ? { workflowFile: input.workflowFile?.trim() || null } : {}),
      ...(input.modelConfigId !== undefined && !existing.isSystem
        ? { modelConfigId: input.modelConfigId }
        : {}),
      ...(input.isEnabled !== undefined && !existing.isSystem ? { isEnabled: input.isEnabled } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appPipelineConfigs.id, id))
    .returning();

  return toPublicPipeline(row!);
}

export async function deletePipelineConfig(id: string): Promise<void> {
  const existing = await getPipelineConfigById(id);
  if (!existing) throw new Error('Pipeline not found');
  if (existing.isSystem) throw new Error('System pipeline cannot be deleted');

  const [row] = await db
    .delete(appPipelineConfigs)
    .where(eq(appPipelineConfigs.id, id))
    .returning({ id: appPipelineConfigs.id });
  if (!row) throw new Error('Pipeline not found');
}
