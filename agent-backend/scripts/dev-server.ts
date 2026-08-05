import './load-env.ts';
import { serve } from '@hono/node-server';
import app from '../src/app.ts';
import { bootAgentCatalogAsync } from '../src/agent-catalog/boot.ts';
import { startFlueRuntimeInit } from '../src/flue-vercel-init.ts';

const port = Number(process.env.PORT ?? 8787);

await bootAgentCatalogAsync();
startFlueRuntimeInit();

serve({ fetch: app.fetch.bind(app), port }, (info) => {
  console.log(`[okf] listening on http://127.0.0.1:${info.port}`);
});
