import './load-env.ts';
import { serve } from '@hono/node-server';
import app from '../src/app.ts';

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch.bind(app), port }, (info) => {
  console.log(`[okf] listening on http://127.0.0.1:${info.port}`);
  console.log(`[okf] OpenAPI docs http://127.0.0.1:${info.port}/api/docs`);
});
