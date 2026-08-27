import { Hono } from 'hono';
import { EVALUATION_CATEGORY, EVALUATION_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  createEvalJudgeScenario,
  deleteEvalJudgeScenario,
  getEvalJudgeScenarioRowById,
  listEvalJudgeScenarioRows,
  updateEvalJudgeScenario,
} from '../../shared/eval/eval-judge-scenario-store.ts';

const judgeDimensions = new Hono();

judgeDimensions.use('*', requireAuth);

judgeDimensions.get(
  '/',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.JUDGE_DIMENSIONS, 'read'),
  async (c) => {
    const search = c.req.query('search')?.trim() || undefined;
    const enabledOnly = c.req.query('enabled_only') === 'true';
    const page = Math.max(Number(c.req.query('page') ?? 1), 1);
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50), 1), 100);
    const result = await listEvalJudgeScenarioRows({ search, enabledOnly, page, limit });
    return c.json(result);
  },
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

judgeDimensions.get(
  '/:id',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.JUDGE_DIMENSIONS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id || !UUID_RE.test(id)) return c.json({ error: 'Not found' }, 404);
    const scenario = await getEvalJudgeScenarioRowById(id);
    if (!scenario) return c.json({ error: 'Not found' }, 404);
    return c.json({ scenario });
  },
);

judgeDimensions.post(
  '/',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.JUDGE_DIMENSIONS, 'write'),
  async (c) => {
    const body = await c.req.json<{
      scenario_key?: string;
      label?: string;
      description?: string | null;
      requires_ground_truth?: boolean;
      min_variants?: number;
      dimensions?: Array<{
        id: string;
        label: string;
        scope: 'variant' | 'pairwise' | 'variant_vs_gt';
        kind: 'geval_score' | 'geval_winner' | 'cer_score' | 'wer_score';
        weight: number;
        criteria: string;
        evaluation_steps?: string[];
      }>;
      is_enabled?: boolean;
    }>();

    if (!body.scenario_key?.trim()) return c.json({ error: 'scenario_key is required' }, 400);
    if (!body.label?.trim()) return c.json({ error: 'label is required' }, 400);
    if (!Array.isArray(body.dimensions)) return c.json({ error: 'dimensions is required' }, 400);

    try {
      const scenario = await createEvalJudgeScenario({
        scenarioKey: body.scenario_key,
        label: body.label,
        description: body.description,
        requiresGroundTruth: body.requires_ground_truth,
        minVariants: body.min_variants,
        dimensions: body.dimensions,
        isEnabled: body.is_enabled,
      });
      return c.json({ scenario }, 201);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : 'Failed to create judge scenario' },
        400,
      );
    }
  },
);

judgeDimensions.put(
  '/:id',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.JUDGE_DIMENSIONS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id || !UUID_RE.test(id)) return c.json({ error: 'Not found' }, 404);

    const body = await c.req.json<{
      label?: string;
      description?: string | null;
      requires_ground_truth?: boolean;
      min_variants?: number;
      dimensions?: Array<{
        id: string;
        label: string;
        scope: 'variant' | 'pairwise' | 'variant_vs_gt';
        kind: 'geval_score' | 'geval_winner' | 'cer_score' | 'wer_score';
        weight: number;
        criteria: string;
        evaluation_steps?: string[];
      }>;
      is_enabled?: boolean;
    }>();

    if (!Array.isArray(body.dimensions)) {
      return c.json({ error: 'dimensions is required' }, 400);
    }

    try {
      const scenario = await updateEvalJudgeScenario(id, {
        label: body.label,
        description: body.description,
        requiresGroundTruth: body.requires_ground_truth,
        minVariants: body.min_variants,
        dimensions: body.dimensions,
        isEnabled: body.is_enabled,
      });
      return c.json({ scenario });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update judge scenario';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

judgeDimensions.delete(
  '/:id',
  requireResourcePermission(EVALUATION_CATEGORY, EVALUATION_RESOURCES.JUDGE_DIMENSIONS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id || !UUID_RE.test(id)) return c.json({ error: 'Not found' }, 404);

    try {
      await deleteEvalJudgeScenario(id);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete judge scenario';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

export default judgeDimensions;
