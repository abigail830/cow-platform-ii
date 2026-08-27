import { and, asc, count, eq, ilike, or } from 'drizzle-orm';
import { db, appEvalJudgeScenarios, type EvalJudgeDimensionRecord } from '../db/index.ts';
import type {
  EvalJudgeDimensionDefinition,
  EvalJudgeScenarioDefinition,
} from '../services/eval-judge-dimensions.ts';

const SCENARIO_KEY_RE = /^[a-z][a-z0-9_]*$/;
const DIMENSION_ID_RE = /^[a-z][a-z0-9_]*$/;

export type EvalJudgeScenarioPublic = {
  id: string;
  scenario_key: string;
  label: string;
  description: string | null;
  requires_ground_truth: boolean;
  min_variants: number;
  dimensions: EvalJudgeDimensionDefinition[];
  is_system: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

function toPublic(row: typeof appEvalJudgeScenarios.$inferSelect): EvalJudgeScenarioPublic {
  return {
    id: row.id,
    scenario_key: row.scenarioKey,
    label: row.label,
    description: row.description,
    requires_ground_truth: row.requiresGroundTruth,
    min_variants: row.minVariants,
    dimensions: row.dimensions as EvalJudgeDimensionDefinition[],
    is_system: row.isSystem,
    is_enabled: row.isEnabled,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toScenarioDefinition(row: typeof appEvalJudgeScenarios.$inferSelect): EvalJudgeScenarioDefinition {
  return {
    id: row.scenarioKey,
    label: row.label,
    description: row.description ?? '',
    requires_ground_truth: row.requiresGroundTruth,
    min_variants: row.minVariants,
    dimensions: row.dimensions as EvalJudgeDimensionDefinition[],
  };
}

export function validateJudgeDimensions(
  dimensions: EvalJudgeDimensionRecord[],
): EvalJudgeDimensionDefinition[] {
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    throw new Error('At least one dimension is required');
  }

  const seen = new Set<string>();
  return dimensions.map((dimension, index) => {
    const id = String(dimension.id ?? '').trim();
    const label = String(dimension.label ?? '').trim();
    const criteria = String(dimension.criteria ?? '').trim();
    const scope = dimension.scope;
    const kind = dimension.kind;
    const weight = Number(dimension.weight);

    if (!id || !DIMENSION_ID_RE.test(id)) {
      throw new Error(`Dimension ${index + 1}: id must be a lowercase slug`);
    }
    if (seen.has(id)) throw new Error(`Duplicate dimension id: ${id}`);
    seen.add(id);
    if (!label) throw new Error(`Dimension ${id}: label is required`);
    if (!criteria) throw new Error(`Dimension ${id}: criteria (evaluation prompt) is required`);
    if (scope !== 'variant' && scope !== 'pairwise') {
      throw new Error(`Dimension ${id}: scope must be variant or pairwise`);
    }
    if (kind !== 'geval_score' && kind !== 'geval_winner') {
      throw new Error(`Dimension ${id}: kind must be geval_score or geval_winner`);
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`Dimension ${id}: weight must be a positive number`);
    }

    return { id, label, scope, kind, weight, criteria };
  });
}

export async function listEvalJudgeScenarioRows(options?: {
  search?: string;
  enabledOnly?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ scenarios: EvalJudgeScenarioPublic[]; total: number; page: number; limit: number }> {
  const page = Math.max(options?.page ?? 1, 1);
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const offset = (page - 1) * limit;

  const filters = [];
  if (options?.enabledOnly) filters.push(eq(appEvalJudgeScenarios.isEnabled, true));
  if (options?.search) {
    const pattern = `%${options.search}%`;
    filters.push(
      or(
        ilike(appEvalJudgeScenarios.scenarioKey, pattern),
        ilike(appEvalJudgeScenarios.label, pattern),
        ilike(appEvalJudgeScenarios.description, pattern),
      ),
    );
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [totalRow] = await db.select({ total: count() }).from(appEvalJudgeScenarios).where(whereClause);
  const rows = await db
    .select()
    .from(appEvalJudgeScenarios)
    .where(whereClause)
    .orderBy(asc(appEvalJudgeScenarios.scenarioKey))
    .limit(limit)
    .offset(offset);

  return {
    scenarios: rows.map(toPublic),
    total: Number(totalRow?.total ?? 0),
    page,
    limit,
  };
}

export async function getEvalJudgeScenarioRowById(id: string): Promise<EvalJudgeScenarioPublic | null> {
  const [row] = await db.select().from(appEvalJudgeScenarios).where(eq(appEvalJudgeScenarios.id, id)).limit(1);
  return row ? toPublic(row) : null;
}

export async function getEvalJudgeScenarioRowByKey(
  scenarioKey: string,
): Promise<typeof appEvalJudgeScenarios.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(appEvalJudgeScenarios)
    .where(eq(appEvalJudgeScenarios.scenarioKey, scenarioKey))
    .limit(1);
  return row ?? null;
}

export async function getEvalJudgeScenarioDefinitionByKey(
  scenarioKey: string,
): Promise<EvalJudgeScenarioDefinition | null> {
  const row = await getEvalJudgeScenarioRowByKey(scenarioKey);
  if (!row || !row.isEnabled) return null;
  return toScenarioDefinition(row);
}

export async function createEvalJudgeScenario(input: {
  scenarioKey: string;
  label: string;
  description?: string | null;
  requiresGroundTruth?: boolean;
  minVariants?: number;
  dimensions: EvalJudgeDimensionRecord[];
  isEnabled?: boolean;
}): Promise<EvalJudgeScenarioPublic> {
  const scenarioKey = input.scenarioKey.trim();
  if (!SCENARIO_KEY_RE.test(scenarioKey)) {
    throw new Error('scenario_key must be a lowercase slug (letters, numbers, underscores)');
  }
  if (!input.label.trim()) throw new Error('label is required');

  const minVariants = input.minVariants ?? 2;
  if (!Number.isInteger(minVariants) || minVariants < 2) {
    throw new Error('min_variants must be an integer >= 2');
  }

  const dimensions = validateJudgeDimensions(input.dimensions);
  const existing = await getEvalJudgeScenarioRowByKey(scenarioKey);
  if (existing) throw new Error(`Scenario key already exists: ${scenarioKey}`);

  const [row] = await db
    .insert(appEvalJudgeScenarios)
    .values({
      scenarioKey,
      label: input.label.trim(),
      description: input.description?.trim() || null,
      requiresGroundTruth: input.requiresGroundTruth ?? false,
      minVariants,
      dimensions,
      isSystem: false,
      isEnabled: input.isEnabled ?? true,
    })
    .returning();

  return toPublic(row!);
}

export async function updateEvalJudgeScenario(
  id: string,
  input: {
    label?: string;
    description?: string | null;
    requiresGroundTruth?: boolean;
    minVariants?: number;
    dimensions?: EvalJudgeDimensionRecord[];
    isEnabled?: boolean;
  },
): Promise<EvalJudgeScenarioPublic> {
  const [existing] = await db.select().from(appEvalJudgeScenarios).where(eq(appEvalJudgeScenarios.id, id)).limit(1);
  if (!existing) throw new Error('Judge scenario not found');

  const patch: Partial<typeof appEvalJudgeScenarios.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.label !== undefined) {
    if (!input.label.trim()) throw new Error('label is required');
    patch.label = input.label.trim();
  }
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.requiresGroundTruth !== undefined) patch.requiresGroundTruth = input.requiresGroundTruth;
  if (input.minVariants !== undefined) {
    if (!Number.isInteger(input.minVariants) || input.minVariants < 2) {
      throw new Error('min_variants must be an integer >= 2');
    }
    patch.minVariants = input.minVariants;
  }
  if (input.dimensions !== undefined) patch.dimensions = validateJudgeDimensions(input.dimensions);
  if (input.isEnabled !== undefined) patch.isEnabled = input.isEnabled;

  const [row] = await db
    .update(appEvalJudgeScenarios)
    .set(patch)
    .where(eq(appEvalJudgeScenarios.id, id))
    .returning();

  return toPublic(row!);
}

export async function deleteEvalJudgeScenario(id: string): Promise<void> {
  const [existing] = await db.select().from(appEvalJudgeScenarios).where(eq(appEvalJudgeScenarios.id, id)).limit(1);
  if (!existing) throw new Error('Judge scenario not found');
  if (existing.isSystem) throw new Error('System judge scenarios cannot be deleted');
  await db.delete(appEvalJudgeScenarios).where(eq(appEvalJudgeScenarios.id, id));
}
