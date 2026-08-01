import { getRequestListener } from '@hono/node-server';
import app from '../src/app.ts';
import { startFlueRuntimeInit } from '../src/flue-vercel-init.ts';

const vercelConfig = {
  maxDuration: 300,
};

const handler = getRequestListener(app.fetch.bind(app));

// Flue init runs in the background — auth/health and other routes must not wait for it.
startFlueRuntimeInit();

const g = globalThis as typeof globalThis & {
  __okfVercelHandler?: typeof handler;
  __okfVercelConfig?: typeof vercelConfig;
};
g.__okfVercelHandler = handler;
g.__okfVercelConfig = vercelConfig;

export default handler;
