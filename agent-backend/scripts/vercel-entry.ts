import { getRequestListener } from '@hono/node-server';
import app from '../src/app.ts';

export const config = {
  maxDuration: 300,
};

// Build Output API uses Node.js (req, res); hono/vercel handle() expects Web Request only.
const handler = getRequestListener(app.fetch);

export default handler;

const g = globalThis as typeof globalThis & {
  __okfVercelHandler?: typeof handler;
  __okfVercelConfig?: typeof config;
};
g.__okfVercelHandler = handler;
g.__okfVercelConfig = config;
