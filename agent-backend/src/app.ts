import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import './load-env.ts';
import { registerModelProviders } from './providers.ts';
import auth from './apis/auth/auth.ts';
import userApiKeys from './apis/auth/user-api-keys.ts';
import agentRoutes from './apis/agents/index.ts';
import admin from './apis/admin/index.ts';
import knowledge from './apis/knowledge/index.ts';
import hybridSearchMcp from './tools/mcp/routes/hybrid-search.ts';
import pageIndexSearchMcp from './tools/mcp/routes/pageindex-search.ts';
import postgresMcp from './tools/mcp/routes/postgres.ts';
import mysqlMcp from './tools/mcp/routes/mysql.ts';
import evaluation from './apis/eval/index.ts';
import internalApi from './apis/internal-api/index.ts';
import { rememberOpenKmsApiKeyForInstance } from './auth/openkms-instance-env.ts';
import { OPENKMS_API_KEY_HEADER } from './auth/openkms-headers.ts';
import { bearerToken, verifyToken } from './auth/jwt.ts';
import { ensureFlueReady } from './agents/runtime/init.ts';
import { runWithAgentRequestContext } from './agents/runtime/agent-request-context.ts';
import { agentInstanceStreamRegistry } from './agents/runtime/agent-instance-stream-registry.ts';
import { fixAgentAttachmentResponseHeaders } from './agents/runtime/attachment-response-headers.ts';
import { isAgentLiveSseRequest, parseAgentInstancePath } from './agents/runtime/agent-instance-path.ts';
import { recoverOrphanedPipelineWorkOnStartup, startPipelinePollScheduler } from './pipeline/application/pipeline-poller.ts';
import { cleanupExpiredSessionFiles } from './agents/session/services/session-files-cleanup.ts';
import { registerOpenApi } from './apis/openapi/register-openapi.ts';
import { registerInProcessMcpFetch } from './agents/runtime/platform-mcp-loopback-fetch.ts';

registerModelProviders();
void recoverOrphanedPipelineWorkOnStartup()
  .then(() => startPipelinePollScheduler())
  .catch((error) => {
    console.error('[pipeline] startup recovery failed:', error);
    startPipelinePollScheduler();
  });
void cleanupExpiredSessionFiles()
  .then((removed) => {
    if (removed > 0) console.info(`[session-files] cleaned up ${removed} expired file(s)`);
  })
  .catch((error) => {
    console.error('[session-files] startup cleanup failed:', error);
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
      'x-flue-instance-id',
      'x-datasource-id',
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
app.route('/api/agents', agentRoutes);
app.route('/api/admin', admin);
app.route('/api/knowledge', knowledge);
app.route('/api/evaluation', evaluation);
app.route('/api/mcp/hybrid-search', hybridSearchMcp);
app.route('/api/mcp/pageindex-search', pageIndexSearchMcp);
app.route('/api/mcp/postgres', postgresMcp);
app.route('/api/mcp/mysql', mysqlMcp);
app.route('/internal-api', internalApi);

const flueRoutes = new Hono();
flueRoutes.use('*', async (c, next) => {
  const parsed = parseAgentInstancePath(new URL(c.req.url).pathname);
  const run = async () => {
    if (parsed) {
      rememberOpenKmsApiKeyForInstance(parsed.instanceId, c.req.raw);
      const method = c.req.method;
      const isSse = isAgentLiveSseRequest(c.req.url, c.req.header('accept'));
      const isAttachment = new URL(c.req.url).pathname.includes('/attachments/');
      if (!isAttachment && (method === 'GET' || method === 'HEAD')) {
        c.header('Cache-Control', 'no-store');
        c.header('X-Accel-Buffering', 'no');
      }
      if (method === 'POST') {
        agentInstanceStreamRegistry.touchActivity(parsed.instanceId, { extendMs: 10 * 60 * 1000 });
      } else if ((method === 'GET' || method === 'HEAD') && isSse) {
        agentInstanceStreamRegistry.addSubscriber(parsed.instanceId);
        c.req.raw.signal.addEventListener(
          'abort',
          () => agentInstanceStreamRegistry.removeSubscriber(parsed.instanceId),
          { once: true },
        );
      } else if (method === 'GET' || method === 'HEAD') {
        agentInstanceStreamRegistry.touchActivity(parsed.instanceId);
      }
    }
    await next();
  };

  return runWithAgentRequestContext(
    {
      instanceId: parsed?.instanceId,
      userId: (() => {
        const token = bearerToken(c);
        if (!token) return undefined;
        try {
          return verifyToken(token).id;
        } catch {
          return undefined;
        }
      })(),
      authorization: c.req.header('authorization'),
      openkmsApiKey: c.req.header(OPENKMS_API_KEY_HEADER),
    },
    run,
  );
});
if (process.env.VERCEL || process.env.OKF_EMBEDDED_FLUE === '1') {
  flueRoutes.use('*', async (c, next) => {
    try {
      await ensureFlueReady();
      await next();
    } catch (error) {
      console.error('[flue] Runtime not ready:', error);
      return c.json({ error: 'Agent runtime is starting. Please retry shortly.' }, 503);
    }
  });
}
flueRoutes.use('*', fixAgentAttachmentResponseHeaders);
flueRoutes.route('/', flue());
app.route('/api', flueRoutes);

registerOpenApi(app);
registerInProcessMcpFetch(app.fetch.bind(app));

export default app;
