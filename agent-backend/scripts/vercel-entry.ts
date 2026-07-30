import { handle } from 'hono/vercel';
import app from '../src/app.ts';

export const config = {
  maxDuration: 300,
};

const handler = handle(app);

export default handler;

// `module` is shadowed inside the esbuild CJS graph; stash on globalThis for the build footer.
const g = globalThis as typeof globalThis & {
  __okfVercelHandler?: typeof handler;
  __okfVercelConfig?: typeof config;
};
g.__okfVercelHandler = handler;
g.__okfVercelConfig = config;
