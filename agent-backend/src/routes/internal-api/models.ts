import { Hono } from 'hono';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { resolveModelCliParams } from '../../services/models/model-cli-params.ts';

const models = new Hono();

models.use('*', requireCliInternalAuth);

/**
 * Generic model → CLI params (any api type). Used by CLI workers at job run time.
 * Query: model_id (uuid) and/or model_name (Models list bold display name).
 */
models.get('/cli-params', async (c) => {
  const modelId = c.req.query('model_id')?.trim();
  const modelName = c.req.query('model_name')?.trim();
  const apiType = c.req.query('api_type')?.trim() || null;

  if (!modelId && !modelName) {
    return c.json({ error: 'model_id or model_name is required' }, 400);
  }

  try {
    const params = await resolveModelCliParams({
      modelId,
      modelName,
      expectedApiType: apiType,
    });
    return c.json(params);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve model';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

export default models;
