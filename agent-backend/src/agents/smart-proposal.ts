import { defineAgent } from '@flue/runtime';
import { agentAccessRoute } from '../auth/agent-route.ts';
import { resolveModel } from '../shared/models.ts';
import { okfTools } from '../shared/okf-tools.ts';
import { SMART_PROPOSAL_INSTRUCTIONS_TEXT } from '../shared/smart-proposal-instructions.ts';

export const route = agentAccessRoute('smart-proposal');

export default defineAgent(() => ({
  model: resolveModel(),
  instructions: SMART_PROPOSAL_INSTRUCTIONS_TEXT,
  tools: okfTools,
}));
