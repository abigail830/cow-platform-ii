import { defineAgent } from '@flue/runtime';
import { agentAccessRoute } from '../auth/agent-route.ts';
import { resolveModel } from '../shared/models.ts';
import { okfTools } from '../shared/okf-tools.ts';

export const route = agentAccessRoute('generic-okf');

export default defineAgent(() => ({
  model: resolveModel(),
  instructions: `You are an OKF knowledge explorer. Use the OKF tools to read, search, and list concepts from the configured bundle. Cite concept ids in answers. Do not invent facts not present in the bundle.`,
  tools: okfTools,
}));
