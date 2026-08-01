import type { SandboxFactory } from '@flue/runtime';
import { readE2bApiKey } from '../sandboxes/e2b-config.ts';
import { createLazyE2bSandboxFactory } from '../sandboxes/lazy-e2b-sandbox.ts';
import type { SandboxYaml } from './schema.ts';

export function createPlatformE2bSandboxFactory(options: {
  templateId?: string;
  workspaceCwd?: string;
  agentName?: string;
}): SandboxFactory {
  readE2bApiKey();
  return createLazyE2bSandboxFactory(options);
}

export function resolveSandboxFactory(spec: SandboxYaml, agentName?: string): SandboxFactory | undefined {
  if (spec.provider === 'none') return undefined;

  if (spec.provider === 'e2b') {
    return createPlatformE2bSandboxFactory({
      templateId: spec.templateId,
      workspaceCwd: spec.cwd,
      agentName,
    });
  }

  return undefined;
}

export function resolveAgentCwd(spec: SandboxYaml): string | undefined {
  return spec.cwd?.trim() || undefined;
}
