import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E2bSessionManager } from './e2b-session-manager.ts';

type SandboxRecord = {
  sandboxId: string;
  paused: boolean;
  timeoutMs: number;
  alive: boolean;
};

function createMockSdk(records: Map<string, SandboxRecord>) {
  let nextId = 1;
  return {
    create: async (opts: { timeoutMs?: number }) => {
      const sandboxId = `sbx-${nextId++}`;
      records.set(sandboxId, {
        sandboxId,
        paused: false,
        timeoutMs: opts.timeoutMs ?? 0,
        alive: true,
      });
      return { sandboxId, commands: { run: async () => ({}) } };
    },
    connect: async (sandboxId: string, opts: { timeoutMs?: number }) => {
      const record = records.get(sandboxId);
      if (!record?.alive) {
        const error = new Error(`Sandbox ${sandboxId} not found`);
        error.name = 'SandboxNotFoundError';
        throw error;
      }
      record.timeoutMs = opts.timeoutMs ?? record.timeoutMs;
      record.paused = false;
      return { sandboxId, commands: { run: async () => ({}) } };
    },
    pause: async (sandboxId: string) => {
      const record = records.get(sandboxId);
      if (record) record.paused = true;
      return true;
    },
    setTimeout: async (sandboxId: string, timeoutMs: number) => {
      const record = records.get(sandboxId);
      if (record) record.timeoutMs = timeoutMs;
    },
  };
}

test('acquire creates sandbox on first use and persists id', async () => {
  const records = new Map<string, SandboxRecord>();
  const saved = new Map<string, string>();
  const manager = new E2bSessionManager({
    sdk: createMockSdk(records),
    store: {
      loadSandboxId: async (instanceId) => saved.get(instanceId) ?? null,
      saveSandboxId: async (instanceId, sandboxId) => {
        saved.set(instanceId, sandboxId);
      },
      clearSandboxId: async (instanceId) => {
        saved.delete(instanceId);
      },
    },
  });

  process.env.E2B_API_KEY = 'test-key';
  process.env.E2B_SESSION_TIMEOUT_MS = '300000';

  const sandbox = await manager.acquire({ instanceId: 'user--conv-1' });
  assert.equal(sandbox.sandboxId, 'sbx-1');
  assert.equal(saved.get('user--conv-1'), 'sbx-1');
  assert.ok(manager.wasMaterialized('user--conv-1'));
});

test('acquire reconnects to stored sandbox and refreshes timeout', async () => {
  const records = new Map<string, SandboxRecord>();
  records.set('sbx-existing', {
    sandboxId: 'sbx-existing',
    paused: true,
    timeoutMs: 60_000,
    alive: true,
  });

  const manager = new E2bSessionManager({
    sdk: createMockSdk(records),
    store: {
      loadSandboxId: async () => 'sbx-existing',
      saveSandboxId: async () => {},
      clearSandboxId: async () => {},
    },
  });

  process.env.E2B_API_KEY = 'test-key';
  process.env.E2B_SESSION_TIMEOUT_MS = '300000';

  const sandbox = await manager.acquire({ instanceId: 'user--conv-2' });
  assert.equal(sandbox.sandboxId, 'sbx-existing');
  assert.equal(records.get('sbx-existing')?.timeoutMs, 300_000);
  assert.equal(records.get('sbx-existing')?.paused, false);
});

test('acquire recreates when stored sandbox is gone', async () => {
  const records = new Map<string, SandboxRecord>();
  const saved = new Map<string, string>([['user--conv-3', 'sbx-dead']]);

  const manager = new E2bSessionManager({
    sdk: createMockSdk(records),
    store: {
      loadSandboxId: async (instanceId) => saved.get(instanceId) ?? null,
      saveSandboxId: async (instanceId, sandboxId) => {
        saved.set(instanceId, sandboxId);
      },
      clearSandboxId: async (instanceId) => {
        saved.delete(instanceId);
      },
    },
  });

  process.env.E2B_API_KEY = 'test-key';
  process.env.E2B_SESSION_TIMEOUT_MS = '300000';

  const sandbox = await manager.acquire({ instanceId: 'user--conv-3' });
  assert.equal(sandbox.sandboxId, 'sbx-1');
  assert.equal(saved.get('user--conv-3'), 'sbx-1');
});

test('markSubmissionStarted pauses a materialized sandbox before the next turn', async () => {
  const records = new Map<string, SandboxRecord>();
  records.set('sbx-1', {
    sandboxId: 'sbx-1',
    paused: false,
    timeoutMs: 300_000,
    alive: true,
  });

  const manager = new E2bSessionManager({
    sdk: createMockSdk(records),
    store: {
      loadSandboxId: async () => 'sbx-1',
      saveSandboxId: async () => {},
      clearSandboxId: async () => {},
    },
  });

  process.env.E2B_API_KEY = 'test-key';

  await manager.acquire({ instanceId: 'user--conv-5' });
  await manager.markSubmissionStarted('user--conv-5');
  assert.equal(records.get('sbx-1')?.paused, true);
  assert.equal(manager.wasMaterialized('user--conv-5'), false);
});

test('touchTimeout extends lease without pausing during an active turn', async () => {
  const records = new Map<string, SandboxRecord>();
  records.set('sbx-1', {
    sandboxId: 'sbx-1',
    paused: false,
    timeoutMs: 300_000,
    alive: true,
  });

  const manager = new E2bSessionManager({
    sdk: createMockSdk(records),
    store: {
      loadSandboxId: async () => 'sbx-1',
      saveSandboxId: async () => {},
      clearSandboxId: async () => {},
    },
  });

  process.env.E2B_API_KEY = 'test-key';

  await manager.acquire({ instanceId: 'user--conv-4' });
  await manager.touchTimeout('user--conv-4', 'sbx-1');
  assert.equal(records.get('sbx-1')?.paused, false);
  assert.ok(manager.wasMaterialized('user--conv-4'));
});
