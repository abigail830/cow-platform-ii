import { Hono } from 'hono';
import agents from './agents.ts';
import sessionFiles from './session-files.ts';
import conversations from './conversations.ts';
import sessionExplorer from './session-explorer.ts';
import studio from './studio/index.ts';

const agentRoutes = new Hono();

agentRoutes.route('/', agents);
agentRoutes.route('/', sessionFiles);
agentRoutes.route('/conversations', conversations);
agentRoutes.route('/session-explorer', sessionExplorer);
agentRoutes.route('/studio', studio);

export default agentRoutes;
