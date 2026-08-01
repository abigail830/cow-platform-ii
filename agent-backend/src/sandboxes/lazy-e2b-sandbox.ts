import { createSandboxSessionEnv } from '@flue/runtime';
import type { FileStat, SandboxApi, SandboxFactory, SessionEnv } from '@flue/runtime';
import type { Sandbox as E2BSandbox } from 'e2b';
import { createPublishArtifactAgentTool } from '../shared/publish-artifact-tools.ts';
import { E2BSandboxApi } from './e2b.ts';
import type { E2bAcquireOptions } from './e2b-session-manager.ts';
import { e2bSessionManager } from './e2b-session-manager.ts';
import {
  bindE2bSessionPublishContext,
  getE2bSessionPublishContext,
  getE2bSessionPublishContextByInstanceId,
} from './e2b-session-publish-context.ts';
import { createDefaultSandboxTools } from './flue-builtin-sandbox-tools.ts';

const E2B_BASE_CWD = '/home/user';

export type LazyE2bSandboxOptions = E2bAcquireOptions;

function isSandboxStaleError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /not running anymore/i.test(error.message) || /not found/i.test(error.message);
}

class LazyE2bSandboxApi implements SandboxApi {
  private delegate?: E2BSandboxApi;
  private sandbox?: E2BSandbox;
  private acquirePromise?: Promise<void>;

  constructor(private readonly options: LazyE2bSandboxOptions) {}

  private resetConnection(): void {
    this.delegate = undefined;
    this.sandbox = undefined;
    this.acquirePromise = undefined;
  }

  private async ensure(): Promise<E2BSandboxApi> {
    if (this.delegate && !e2bSessionManager.wasMaterialized(this.options.instanceId)) {
      this.resetConnection();
    }
    if (this.delegate) return this.delegate;
    if (!this.acquirePromise) {
      this.acquirePromise = (async () => {
        const sandbox = await e2bSessionManager.acquire(this.options);
        this.sandbox = sandbox;
        this.delegate = new E2BSandboxApi(sandbox);
      })();
    }
    await this.acquirePromise;
    return this.delegate!;
  }

  private async touch(): Promise<void> {
    if (!this.sandbox) return;
    await e2bSessionManager.touchTimeout(this.options.instanceId, this.sandbox.sandboxId);
  }

  private async withReconnect<T>(operation: (api: E2BSandboxApi) => Promise<T>): Promise<T> {
    const api = await this.ensure();
    try {
      return await operation(api);
    } catch (error) {
      if (!isSandboxStaleError(error)) throw error;
      this.resetConnection();
      const retryApi = await this.ensure();
      return operation(retryApi);
    }
  }

  async readFile(path: string): Promise<string> {
    return this.withReconnect(async (api) => {
      await this.touch();
      return api.readFile(path);
    });
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    return this.withReconnect(async (api) => {
      await this.touch();
      return api.readFileBuffer(path);
    });
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    return this.withReconnect(async (api) => {
      await this.touch();
      return api.writeFile(path, content);
    });
  }

  async stat(path: string): Promise<FileStat> {
    return this.withReconnect(async (api) => {
      await this.touch();
      return api.stat(path);
    });
  }

  async readdir(path: string): Promise<string[]> {
    if (!this.delegate) return [];
    return this.withReconnect(async (api) => {
      await this.touch();
      return api.readdir(path);
    });
  }

  async exists(path: string): Promise<boolean> {
    if (!this.delegate) return false;
    return this.withReconnect(async (api) => {
      await this.touch();
      return api.exists(path);
    });
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    return this.withReconnect(async (api) => {
      await this.touch();
      return api.mkdir(path, options);
    });
  }

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    return this.withReconnect(async (api) => {
      await this.touch();
      return api.rm(path, options);
    });
  }

  async exec(
    command: string,
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
      signal?: AbortSignal;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.withReconnect(async (api) => {
      await this.touch();
      return api.exec(command, options);
    });
  }
}

export function createLazyE2bSandboxFactory(options: {
  templateId?: string;
  workspaceCwd?: string;
  agentName?: string;
}): SandboxFactory {
  const agentName = options.agentName?.trim() || 'agent';
  const sessionCwd = options.workspaceCwd?.trim() || E2B_BASE_CWD;
  let bindingInstanceId: string | undefined;

  return {
    async createSessionEnv({ id: instanceId }): Promise<SessionEnv> {
      bindingInstanceId = instanceId;
      await e2bSessionManager.markSubmissionStarted(instanceId);
      const api = new LazyE2bSandboxApi({
        instanceId,
        templateId: options.templateId,
        workspaceCwd: options.workspaceCwd,
        agentName: options.agentName,
      });
      const env = await createSandboxSessionEnv(api, sessionCwd);
      bindE2bSessionPublishContext(env, { instanceId, agentName });
      return env;
    },
    tools: (env, factoryOptions) => {
      let sessionContext = getE2bSessionPublishContext(env);
      if (!sessionContext && bindingInstanceId) {
        sessionContext = getE2bSessionPublishContextByInstanceId(bindingInstanceId);
        if (sessionContext) bindE2bSessionPublishContext(env, sessionContext);
      }
      if (!sessionContext) {
        throw new Error('[e2b] Missing publish context for sandbox session env');
      }
      bindingInstanceId = undefined;

      const builtinTools = createDefaultSandboxTools(env, factoryOptions);
      const publishTool = createPublishArtifactAgentTool({
        env,
        instanceId: sessionContext.instanceId,
        agentName: sessionContext.agentName,
      });

      return [...builtinTools, publishTool];
    },
  };
}
