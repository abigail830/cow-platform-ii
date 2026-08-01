import type { SessionEnv } from '@flue/runtime';

export type E2bSessionPublishContext = {
  instanceId: string;
  agentName: string;
};

const publishContextByEnv = new WeakMap<SessionEnv, E2bSessionPublishContext>();
const publishContextByInstanceId = new Map<string, E2bSessionPublishContext>();

export function bindE2bSessionPublishContext(env: SessionEnv, context: E2bSessionPublishContext): void {
  publishContextByEnv.set(env, context);
  publishContextByInstanceId.set(context.instanceId, context);
}

export function getE2bSessionPublishContext(env: SessionEnv): E2bSessionPublishContext | undefined {
  return publishContextByEnv.get(env);
}

export function getE2bSessionPublishContextByInstanceId(
  instanceId: string,
): E2bSessionPublishContext | undefined {
  return publishContextByInstanceId.get(instanceId);
}

export function resetE2bSessionPublishContextForTests(): void {
  publishContextByInstanceId.clear();
}
