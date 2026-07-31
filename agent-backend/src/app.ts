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
import internalApi from './routes/internal-api/index.ts';
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
app.route('/internal-api', internalApi);
app.route('/api', flue());

export default app;
