import { Sandbox, SandboxNotFoundError } from 'e2b';
import type { Sandbox as E2BSandbox } from 'e2b';
import {
  e2bSessionLifecycle,
  readE2bApiKey,
  readE2bSessionTimeoutMs,
} from './e2b-config.ts';
import { resolveE2bTemplateRef } from './e2b-templates.ts';

export type E2bAcquireOptions = {
  instanceId: string;
  templateId?: string;
  workspaceCwd?: string;
  agentName?: string;
};

type ConnectedSandbox = {
  sandbox: E2BSandbox;
  sandboxId: string;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isSandboxMissingError(error: unknown): boolean {
  if (error instanceof SandboxNotFoundError) return true;
  if (error instanceof Error && /not found/i.test(error.message)) return true;
  return false;
}

export type E2bSessionStore = {
  loadSandboxId: (instanceId: string) => Promise<string | null>;
  saveSandboxId: (instanceId: string, sandboxId: string, agentName?: string) => Promise<void>;
  clearSandboxId: (instanceId: string) => Promise<void>;
};

export type E2bSdk = {
  create: typeof Sandbox.create;
  connect: typeof Sandbox.connect;
  pause: typeof Sandbox.pause;
  setTimeout: typeof Sandbox.setTimeout;
};

const defaultSdk: E2bSdk = {
  create: (...args) => Sandbox.create(...args),
  connect: (...args) => Sandbox.connect(...args),
  pause: (...args) => Sandbox.pause(...args),
  setTimeout: (...args) => Sandbox.setTimeout(...args),
};

let defaultStorePromise: Promise<E2bSessionStore> | null = null;

async function getDefaultStore(): Promise<E2bSessionStore> {
  if (!defaultStorePromise) {
    defaultStorePromise = import('./e2b-session-store.ts').then((mod) => ({
      loadSandboxId: mod.loadE2bSandboxId,
      saveSandboxId: mod.saveE2bSandboxId,
      clearSandboxId: mod.clearE2bSandboxId,
    }));
  }
  return defaultStorePromise;
}

function createLazyDefaultStore(): E2bSessionStore {
  return {
    loadSandboxId: async (instanceId) => (await getDefaultStore()).loadSandboxId(instanceId),
    saveSandboxId: async (instanceId, sandboxId, agentName) =>
      (await getDefaultStore()).saveSandboxId(instanceId, sandboxId, agentName),
    clearSandboxId: async (instanceId) => (await getDefaultStore()).clearSandboxId(instanceId),
  };
}

export class E2bSessionManager {
  private readonly store: E2bSessionStore;
  private readonly sdk: E2bSdk;
  private readonly locks = new Map<string, Promise<void>>();
  private readonly materialized = new Set<string>();
  private readonly timeoutExtendedAt = new Map<string, number>();

  constructor(options?: { store?: E2bSessionStore; sdk?: E2bSdk }) {
    this.store = options?.store ?? createLazyDefaultStore();
    this.sdk = options?.sdk ?? defaultSdk;
  }

  async markSubmissionStarted(instanceId: string): Promise<void> {
    await this.withInstanceLock(instanceId, async () => {
      await this.pauseAfterSubmission(instanceId);
    });
  }

  wasMaterialized(instanceId: string): boolean {
    return this.materialized.has(instanceId);
  }

  async acquire(options: E2bAcquireOptions): Promise<E2BSandbox> {
    return this.withInstanceLock(options.instanceId, async () => {
      const apiKey = readE2bApiKey();
      const timeoutMs = readE2bSessionTimeoutMs();
      const connectOpts = {
        apiKey,
        timeoutMs,
        lifecycle: e2bSessionLifecycle(),
      };
      const createOpts = {
        apiKey,
        timeoutMs,
        lifecycle: e2bSessionLifecycle(),
        metadata: {
          instanceId: options.instanceId,
          ...(options.agentName ? { agentName: options.agentName } : {}),
        },
        ...(options.templateId
          ? { template: resolveE2bTemplateRef(options.templateId) }
          : {}),
      };

      const storedId = await this.store.loadSandboxId(options.instanceId);
      let connected: ConnectedSandbox | null = null;

      if (storedId) {
        try {
          const sandbox = await this.sdk.connect(storedId, connectOpts);
          connected = { sandbox, sandboxId: sandbox.sandboxId };
        } catch (error) {
          if (!isSandboxMissingError(error)) throw error;
          await this.store.clearSandboxId(options.instanceId);
        }
      }

      if (!connected) {
        const sandbox = await this.sdk.create(createOpts);
        connected = { sandbox, sandboxId: sandbox.sandboxId };
        await this.store.saveSandboxId(options.instanceId, connected.sandboxId, options.agentName);
      }

      await this.extendTimeout(connected.sandboxId, { force: true });
      await this.ensureWorkspace(connected.sandbox, options.workspaceCwd);

      this.materialized.add(options.instanceId);
      return connected.sandbox;
    });
  }

  async touchTimeout(instanceId: string, sandboxId: string): Promise<void> {
    if (!this.materialized.has(instanceId)) return;
    await this.extendTimeout(sandboxId);
  }

  async pauseAfterSubmission(instanceId: string): Promise<void> {
    if (!this.materialized.has(instanceId)) return;

    const sandboxId = await this.store.loadSandboxId(instanceId);
    this.materialized.delete(instanceId);
    this.timeoutExtendedAt.delete(instanceId);
    if (!sandboxId) return;

    try {
      await this.sdk.pause(sandboxId, {
        apiKey: readE2bApiKey(),
        keepMemory: false,
      });
    } catch (error) {
      if (isSandboxMissingError(error)) {
        await this.store.clearSandboxId(instanceId);
        return;
      }
      console.error('[e2b] pause after submission failed:', {
        instanceId,
        sandboxId,
        error,
      });
    }
  }

  private async extendTimeout(sandboxId: string, options?: { force?: boolean }): Promise<void> {
    const timeoutMs = readE2bSessionTimeoutMs();
    const now = Date.now();
    const last = this.timeoutExtendedAt.get(sandboxId) ?? 0;
    if (!options?.force && now - last < 30_000) return;

    await this.sdk.setTimeout(sandboxId, timeoutMs, { apiKey: readE2bApiKey() });
    this.timeoutExtendedAt.set(sandboxId, now);
  }

  private async ensureWorkspace(sandbox: E2BSandbox, workspaceCwd?: string): Promise<void> {
    const cwd = workspaceCwd?.trim();
    if (!cwd) return;
    await sandbox.commands.run(`mkdir -p ${shellQuote(cwd)}`);
  }

  private async withInstanceLock<T>(instanceId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(instanceId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = previous.then(() => gate);
    this.locks.set(instanceId, current);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(instanceId) === current) {
        this.locks.delete(instanceId);
      }
    }
  }
}

export const e2bSessionManager = new E2bSessionManager();
