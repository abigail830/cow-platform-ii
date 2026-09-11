import { getRequestListener } from '@hono/node-server';
import app from '../src/app.ts';

const vercelConfig = {
  maxDuration: 300,
  supportsResponseStreaming: true,
};

const handler = getRequestListener(app.fetch.bind(app));

const g = globalThis as typeof globalThis & {
  __okfVercelHandler?: typeof handler;
  __okfVercelConfig?: typeof vercelConfig;
};
g.__okfVercelHandler = handler;
g.__okfVercelConfig = vercelConfig;

export default handler;
