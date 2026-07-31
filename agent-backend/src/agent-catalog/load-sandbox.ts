import { Sandbox } from 'e2b';
import type { SandboxFactory } from '@flue/runtime';
import { e2b } from '../sandboxes/e2b.ts';
import type { SandboxYaml } from './schema.ts';

export function resolveSandboxFactory(spec: SandboxYaml): SandboxFactory | undefined {
  if (spec.provider === 'none') return undefined;

  if (spec.provider === 'e2b') {
    const apiKey = process.env.E2B_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('E2B_API_KEY is required when sandbox.provider is e2b');
    }

    return {
      async createSessionEnv(options: { id: string }) {
        const sandbox = await Sandbox.create({
          apiKey,
          ...(spec.templateId ? { template: spec.templateId } : {}),
        });
        return e2b(sandbox).createSessionEnv(options);
      },
    };
  }

  return undefined;
}

export function resolveAgentCwd(spec: SandboxYaml): string | undefined {
  return spec.cwd?.trim() || undefined;
}
