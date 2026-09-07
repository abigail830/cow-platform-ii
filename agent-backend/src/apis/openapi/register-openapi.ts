import { swaggerUI } from '@hono/swagger-ui';
import { generateSpecs } from 'hono-openapi';
import type { Hono } from 'hono';
import { enrichOpenApiSpec } from './enrich-spec.ts';

const OPENAPI_EXCLUDE: Array<string | RegExp> = [
  /^\/internal-api(?:\/|$)/,
  /^\/api\/openapi\.json$/,
  /^\/api\/docs(?:\/|$)/,
];

function defaultServerUrl(): string {
  const port = process.env.PORT ?? '8787';
  return process.env.OPENAPI_SERVER_URL ?? `http://127.0.0.1:${port}`;
}

let cachedSpec: ReturnType<typeof enrichOpenApiSpec> | null = null;

export function registerOpenApi(app: Hono): void {
  app.get('/api/openapi.json', async (c) => {
    if (!cachedSpec) {
      const raw = await generateSpecs(app, {
        includeEmptyPaths: true,
        exclude: OPENAPI_EXCLUDE,
        excludeMethods: ['OPTIONS', 'HEAD'],
        documentation: {
          info: {
            title: 'OpenKMS Agent Backend',
            version: '1.0.0',
            description:
              'Auto-generated from registered Hono routes (`includeEmptyPaths`). ' +
              'Add `describeRoute` + `validator` (hono-openapi/zod) on handlers for request/response schemas.',
          },
          servers: [{ url: defaultServerUrl(), description: 'Current backend' }],
          components: {
            securitySchemes: {
              bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'Session JWT from POST /api/auth/login',
              },
            },
          },
        },
      });
      cachedSpec = enrichOpenApiSpec(raw);
    }
    return c.json(cachedSpec);
  });

  app.get(
    '/api/docs',
    swaggerUI({
      url: '/api/openapi.json',
    }),
  );
}

/** Test helper: rebuild spec (e.g. after hot reload in dev). */
export function resetOpenApiSpecCacheForTests(): void {
  cachedSpec = null;
}
