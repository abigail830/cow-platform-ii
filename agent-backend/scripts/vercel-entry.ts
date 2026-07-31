import { getRequestListener } from '@hono/node-server';
import app from '../src/app.ts';
import { initFlueRuntime } from '../src/flue-vercel-init.ts';

const vercelConfig = {
  maxDuration: 300,
};

let handler: ReturnType<typeof getRequestListener> | undefined;
let bootPromise: Promise<void> | undefined;

function bootstrap(): Promise<void> {
  if (!bootPromise) {
    bootPromise = initFlueRuntime().then(() => {
      handler = getRequestListener(app.fetch.bind(app));
      const g = globalThis as typeof globalThis & {
        __okfVercelHandler?: typeof handler;
        __okfVercelConfig?: typeof vercelConfig;
      };
      g.__okfVercelHandler = handler;
      g.__okfVercelConfig = vercelConfig;
    });
  }
  return bootPromise;
}

const serve = (req: Parameters<ReturnType<typeof getRequestListener>>[0], res: Parameters<ReturnType<typeof getRequestListener>>[1]) => {
  bootstrap()
    .then(() => handler!(req, res))
    .catch((error) => {
      console.error('[vercel] bootstrap failed:', error);
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : String(error));
    });
};

const g = globalThis as typeof globalThis & {
  __okfVercelHandler?: typeof serve;
  __okfVercelConfig?: typeof vercelConfig;
};
g.__okfVercelHandler = serve;
g.__okfVercelConfig = vercelConfig;

export default serve;
