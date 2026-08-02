import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import './load-env.ts';
import { registerModelProviders } from './providers.ts';
import auth from './routes/auth.ts';
import agents from './routes/agents.ts';
import conversations from './routes/conversations.ts';
import admin from './routes/admin/index.ts';
import consoleRoutes from './routes/console/index.ts';
import documentChannels from './routes/document-channels.ts';
import documents from './routes/documents.ts';
import knowledgeBases from './routes/knowledge-bases.ts';
import hybridSearch from './routes/hybrid-search.ts';
import sessionExplorer from './routes/session-explorer.ts';
import internalApi from './routes/internal-api/index.ts';
import { ensureFlueReady } from './flue-vercel-init.ts';
import { agentInstanceStreamRegistry } from './flue/agent-instance-stream-registry.ts';
import { isAgentLiveSseRequest, parseAgentInstancePath } from './flue/agent-instance-path.ts';
import { recoverOrphanedPipelineWorkOnStartup, startPipelinePollScheduler } from './services/pipeline-poller.ts';

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
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5180').split(','),
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.get('/health', (c) => c.json({ ok: true, service: 'agent-backend' }));

app.route('/api/auth', auth);
app.route('/api/agents', agents);
app.route('/api/conversations', conversations);
app.route('/api/admin', admin);
app.route('/api/console', consoleRoutes);
app.route('/api/document-channels', documentChannels);
app.route('/api/documents', documents);
app.route('/api/knowledge-bases', knowledgeBases);
app.route('/api/hybrid-search', hybridSearch);
app.route('/api/session-explorer', sessionExplorer);
app.route('/internal-api', internalApi);

const flueRoutes = new Hono();
flueRoutes.use('*', async (c, next) => {
  const parsed = parseAgentInstancePath(new URL(c.req.url).pathname);
  if (parsed) {
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
