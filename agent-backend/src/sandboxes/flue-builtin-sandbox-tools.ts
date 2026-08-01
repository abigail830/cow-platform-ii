import type { SessionEnv } from '@flue/runtime';
import type { SessionToolFactoryOptions } from '@flue/runtime';
// @flue/runtime does not export createTools; load from the runtime bundle chunk (version-locked).
import { y as createFlueBuiltinSandboxTools } from '../../node_modules/@flue/runtime/dist/skill-package-B-Co0HMC.mjs';

type FlueAgentTool = ReturnType<typeof createFlueBuiltinSandboxTools>[number];

export function createDefaultSandboxTools(
  env: SessionEnv,
  options: SessionToolFactoryOptions,
): FlueAgentTool[] {
  return createFlueBuiltinSandboxTools(env, { subagents: options.subagents });
}
