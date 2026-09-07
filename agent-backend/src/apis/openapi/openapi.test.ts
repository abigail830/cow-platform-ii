import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Hono } from 'hono';
import { generateSpecs } from 'hono-openapi';
import { enrichOpenApiSpec } from './enrich-spec.ts';

describe('openapi', () => {
  it('generates paths from registered Hono routes', async () => {
    const app = new Hono();
    app.get('/api/knowledge/documents', (c) => c.json({ documents: [] }));
    app.get('/api/agents/studio/assets', (c) => c.json({ assets: [] }));
    app.post('/api/auth/login', (c) => c.json({ token: 't' }));

    const raw = await generateSpecs(app, {
      includeEmptyPaths: true,
      excludeMethods: ['OPTIONS', 'HEAD'],
      documentation: {
        info: { title: 'test', version: '0.0.0' },
      },
    });
    const spec = enrichOpenApiSpec(raw);
    const paths = Object.keys(spec.paths ?? {});
    assert.ok(paths.includes('/api/knowledge/documents'));
    assert.ok(paths.includes('/api/agents/studio/assets'));
    assert.ok(paths.includes('/api/auth/login'));
    const login = spec.paths?.['/api/auth/login']?.post;
    assert.ok(login);
    assert.equal(login?.security, undefined);
    const docs = spec.paths?.['/api/knowledge/documents']?.get;
    assert.deepEqual(docs?.security, [{ bearerAuth: [] }]);
  });
});
