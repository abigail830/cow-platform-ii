import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import './load-env.ts';
import { registerModelProviders } from './providers.ts';
import auth from './routes/auth.ts';
import userApiKeys from './routes/user-api-keys.ts';
import agents from './routes/agents.ts';
import conversations from './routes/conversations.ts';
import admin from './routes/admin/index.ts';
import consoleRoutes from './routes/console/index.ts';
import documentChannels from './routes/document-channels.ts';
import documents from './routes/documents.ts';
import knowledgeBases from './routes/knowledge-bases.ts';
import hybridSearch from './routes/hybrid-search.ts';
import hybridSearchMcp from './routes/mcp/hybrid-search.ts';
import users from './routes/users.ts';
import sessionExplorer from './routes/session-explorer.ts';
import sessionFiles from './routes/session-files.ts';
import builtinAgentOptions from './routes/builtin-agents.ts';
import internalApi from './routes/internal-api/index.ts';
import { rememberOpenKmsApiKeyForInstance } from './auth/openkms-instance-env.ts';
import { OPENKMS_API_KEY_HEADER } from './auth/openkms-headers.ts';
import { ensureFlueReady } from './flue-vercel-init.ts';
import { runWithAgentRequestContext } from './flue/agent-request-context.ts';
import { agentInstanceStreamRegistry } from './flue/agent-instance-stream-registry.ts';
import { isAgentLiveSseRequest, parseAgentInstancePath } from './flue/agent-instance-path.ts';
import { recoverOrphanedPipelineWorkOnStartup, startPipelinePollScheduler } from './services/pipeline-poller.ts';
import { cleanupExpiredSessionFiles } from './services/session-files-cleanup.ts';

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
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5180').split(','),
    allowHeaders: [
      'Authorization',
      'Content-Type',
      OPENKMS_API_KEY_HEADER,
      'x-flue-instance-id',
      'mcp-session-id',
      'Last-Event-ID',
      'mcp-protocol-version',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.get('/health', (c) => c.json({ ok: true, service: 'agent-backend' }));

app.route('/api/auth', auth);
app.route('/api/user/api-keys', userApiKeys);
app.route('/api/agents', agents);
app.route('/api/agents', sessionFiles);
app.route('/api/conversations', conversations);
app.route('/api/admin', admin);
app.route('/api/console', consoleRoutes);
app.route('/api/document-channels', documentChannels);
app.route('/api/documents', documents);
app.route('/api/knowledge-bases', knowledgeBases);
app.route('/api/hybrid-search', hybridSearch);
app.route('/api/mcp/hybrid-search', hybridSearchMcp);
app.route('/api/users', users);
app.route('/api/session-explorer', sessionExplorer);
app.route('/api/builtin-agents', builtinAgentOptions);
app.route('/internal-api', internalApi);

const flueRoutes = new Hono();
flueRoutes.use('*', async (c, next) => {
  const parsed = parseAgentInstancePath(new URL(c.req.url).pathname);
  const run = async () => {
    if (parsed) {
      rememberOpenKmsApiKeyForInstance(parsed.instanceId, c.req.raw);
      const method = c.req.method;
      const isSse = isAgentLiveSseRequest(c.req.url, c.req.header('accept'));
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
      authorization: c.req.header('authorization'),
      openkmsApiKey: c.req.header(OPENKMS_API_KEY_HEADER),
    },
    run,
  );
});
if (process.env.VERCEL) {
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
flueRoutes.route('/', flue());
app.route('/api', flueRoutes);

export default app;
