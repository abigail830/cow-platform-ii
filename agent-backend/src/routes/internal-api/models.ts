import { Hono } from 'hono';
import { requireCliInternalAuth } from '../../auth/cli-internal-auth.ts';
import { resolveModelCliParams } from '../../services/model-cli-params.ts';

const models = new Hono();

models.use('*', requireCliInternalAuth);

/**
 * CLI contract: resolve a platform model config into runtime connection fields.
 * Query: model_id (uuid) and/or model_name (display name).
 */
models.get('/document-parse-defaults', async (c) => {
  const modelId = c.req.query('model_id')?.trim();
  const modelName = c.req.query('model_name')?.trim();

  if (!modelId && !modelName) {
    return c.json({ error: 'model_id or model_name is required' }, 400);
  }

  try {
    const params = await resolveModelCliParams({
      modelId,
      modelName,
      expectedApiType: 'vlm',
    });
    return c.json({
      model_id: params.model_id,
      config_name: params.config_name,
      api_type: params.api_type,
      base_url: params.base_url,
      model_name: params.model_name,
      api_key: params.api_key,
      max_concurrency: params.max_concurrency,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve model';
    const status = message.includes('not found') ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

/**
 * Generic model → CLI params (any api type). Used by backend workers at pipeline run time.
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
