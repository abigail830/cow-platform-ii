import { Hono } from 'hono';
import { cors } from 'hono/cors';
import './load-env.ts';
import { registerModelProviders } from './providers.ts';
import auth from './apis/auth/auth.ts';
import userApiKeys from './apis/auth/user-api-keys.ts';
import admin from './apis/admin/index.ts';
import knowledge from './apis/knowledge/index.ts';
import hybridSearchMcp from './tools/mcp/routes/hybrid-search.ts';
import pageIndexSearchMcp from './tools/mcp/routes/pageindex-search.ts';
import evaluation from './apis/eval/index.ts';
import internalApi from './apis/internal-api/index.ts';
import { OPENKMS_API_KEY_HEADER } from './auth/openkms-headers.ts';
import { recoverOrphanedPipelineWorkOnStartup, startPipelinePollScheduler } from './pipeline/application/pipeline-poller.ts';
import { registerOpenApi } from './apis/openapi/register-openapi.ts';

registerModelProviders();
void recoverOrphanedPipelineWorkOnStartup()
  .then(() => startPipelinePollScheduler())
  .catch((error) => {
    console.error('[pipeline] startup recovery failed:', error);
    startPipelinePollScheduler();
  });

const app = new Hono();

app.use(
  '*',
  cors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5180,http://127.0.0.1:5180')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    allowHeaders: [
      'Authorization',
      'Content-Type',
      OPENKMS_API_KEY_HEADER,
      'mcp-session-id',
      'Last-Event-ID',
      'mcp-protocol-version',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Stream-Next-Offset', 'Stream-Up-To-Date'],
  }),
);

app.get('/health', (c) => c.json({ ok: true, service: 'agent-backend' }));

app.route('/api/auth', auth);
app.route('/api/user/api-keys', userApiKeys);
app.route('/api/admin', admin);
app.route('/api/knowledge', knowledge);
app.route('/api/evaluation', evaluation);
app.route('/api/mcp/hybrid-search', hybridSearchMcp);
app.route('/api/mcp/pageindex-search', pageIndexSearchMcp);
app.route('/internal-api', internalApi);

registerOpenApi(app);

export default app;
