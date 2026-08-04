// @ts-nocheck — mirrors Flue-generated server bootstrap; internal types are not exported.
/**
 * Initialize Flue agent runtime on Vercel (no `flue build` server entry).
 * Mirrors loadFlueNodeApplication() persistence + configureFlueRuntime() from @flue/cli.
 */
import {
  Bash,
  InMemoryFs,
  admitDetachedWorkflow,
  assertWorkflowDefinition,
  bashFactoryToSessionEnv,
  configureFlueRuntime,
  createFlueContext,
  createNodeAgentCoordinator,
  createNodeDispatchQueue,
  createRuntimeActivityGate,
  resolveModel,
} from '@flue/runtime/internal';
import type { AgentRouteHandler } from '@flue/runtime';
import { getCatalogFlueAgentModules } from './agent-catalog/boot.ts';
import { getCatalogA2aChannelModules } from './flue/a2a/create-channel.ts';
import db from './db.ts';
import { setPlatformFlueStores } from './flue/platform-flue-stores.ts';
import { runSubmissionGovernanceAtStartup } from './flue/submission-governance.ts';
import { buildOpenKmsSandboxEnv } from './auth/openkms-headers.ts';

type AgentModule = {
  default?: {
    __flueAgentDefinition?: boolean;
    initialize?: (...args: never[]) => unknown;
  };
  route?: AgentRouteHandler;
  attachments?: AgentRouteHandler;
  description?: string;
};

function normalizeBuiltModules(
  agentModules: Record<string, AgentModule>,
  workflowModules: Record<string, { default?: unknown; route?: unknown; runs?: unknown }>,
  channelModules: Record<string, unknown> = {},
) {
  const agents: Array<{
    name: string;
    definition: NonNullable<AgentModule['default']>;
    route?: AgentRouteHandler;
    attachments?: AgentRouteHandler;
    description?: string;
  }> = [];
  const workflows: Array<{
    name: string;
    definition: unknown;
    route?: AgentRouteHandler;
    runs?: AgentRouteHandler;
  }> = [];
  const channelHandlers: Record<string, Record<string, AgentRouteHandler>> = {};

  for (const [name, mod] of Object.entries(agentModules)) {
    if (!mod.default?.__flueAgentDefinition || typeof mod.default.initialize !== 'function') {
      throw new Error(`[flue] Agent "${name}" must default-export defineAgent(...).`);
    }
    if (mod.route !== undefined && typeof mod.route !== 'function') {
      throw new Error(`[flue] Agent "${name}" route export must be middleware.`);
    }
    if (mod.attachments !== undefined && typeof mod.attachments !== 'function') {
      throw new Error(`[flue] Agent "${name}" attachments export must be middleware.`);
    }
    if (
      mod.description !== undefined &&
      (typeof mod.description !== 'string' || mod.description.trim().length === 0)
    ) {
      throw new Error(`[flue] Agent "${name}" description export must be a non-empty string.`);
    }
    const previous = agents.find((agent) => agent.definition === mod.default);
    if (previous) {
      throw new Error(
        `[flue] Agents "${previous.name}" and "${name}" default-export the same agent definition.`,
      );
    }
    const agent = { name, definition: mod.default };
    if (mod.description !== undefined) agent.description = mod.description;
    if (typeof mod.route === 'function') agent.route = mod.route;
    if (typeof mod.attachments === 'function') agent.attachments = mod.attachments;
    agents.push(agent);
  }

  for (const [name, mod] of Object.entries(workflowModules)) {
    assertWorkflowDefinition(mod.default, name);
    if (mod.route !== undefined && typeof mod.route !== 'function') {
      throw new Error(`[flue] Workflow "${name}" route export must be middleware.`);
    }
    if (mod.runs !== undefined && typeof mod.runs !== 'function') {
      throw new Error(`[flue] Workflow "${name}" runs export must be middleware.`);
    }
    const previous = workflows.find((workflow) => workflow.definition === mod.default);
    if (previous) {
      throw new Error(
        `[flue] Workflows "${previous.name}" and "${name}" default-export the same workflow definition.`,
      );
    }
    const workflow = { name, definition: mod.default };
    if (typeof mod.route === 'function') workflow.route = mod.route;
    if (typeof mod.runs === 'function') workflow.runs = mod.runs;
    workflows.push(workflow);
  }

  for (const [name, mod] of Object.entries(channelModules)) {
    const channel = (mod as { channel?: { routes?: Array<{ method?: string; path?: string; handler?: unknown }> } })
      .channel;
    if (!channel || typeof channel !== 'object' || Array.isArray(channel)) {
      throw new Error(`[flue] Channel "${name}" must export a created channel as the named "channel" binding.`);
    }
    if (!Array.isArray(channel.routes) || channel.routes.length === 0) {
      throw new Error(`[flue] Channel "${name}" must declare at least one route.`);
    }
    const routes: Record<string, AgentRouteHandler> = {};
    for (const route of channel.routes) {
      if (!route || typeof route !== 'object' || Array.isArray(route)) {
        throw new Error(`[flue] Channel "${name}" contains an invalid route declaration.`);
      }
      if (typeof route.method !== 'string' || !/^[A-Z]+$/.test(route.method)) {
        throw new Error(`[flue] Channel "${name}" route method must contain only uppercase ASCII letters.`);
      }
      if (
        typeof route.path !== 'string' ||
        route.path.length < 2 ||
        !route.path.startsWith('/') ||
        route.path.startsWith('//') ||
        route.path.includes('?') ||
        route.path.includes('#')
      ) {
        throw new Error(
          `[flue] Channel "${name}" route path must be a non-empty absolute suffix without a query or fragment.`,
        );
      }
      if (route.path.split('/').some((segment) => segment === '.' || segment === '..')) {
        throw new Error(`[flue] Channel "${name}" route path must remain beneath its channel namespace.`);
      }
      if (typeof route.handler !== 'function') {
        throw new Error(`[flue] Channel "${name}" route handler must be callable.`);
      }
      const key = `${route.method} ${route.path}`;
      if (routes[key] !== undefined) {
        throw new Error(`[flue] Channel "${name}" declares duplicate route "${key}".`);
      }
      routes[key] = route.handler as AgentRouteHandler;
    }
    channelHandlers[name] = routes;
  }

  return { agents, workflows, channelHandlers };
}

/** Must stay sync: Flue expects `createDefaultEnv` itself to be a function, not a Promise. */
function createDefaultEnvFactory(request: Request) {
  const openkmsEnv = buildOpenKmsSandboxEnv(request);
  return async function createDefaultEnv() {
    const fs = new InMemoryFs();
    return bashFactoryToSessionEnv(
      () =>
        new Bash({
          fs,
          network: { dangerouslyAllowFullInternetAccess: true },
          env: {
            ...process.env,
            ...openkmsEnv,
          },
        }),
    );
  };
}

let initialized = false;
let initPromise: Promise<void> | undefined;

/** Start Flue init in the background (Vercel cold start). Safe to call multiple times. */
export function startFlueRuntimeInit(): void {
  if (!initPromise) {
    initPromise = runFlueRuntimeInit();
  }
}

/** Await Flue runtime readiness — only needed before agent/workflow Flue routes. */
export async function ensureFlueReady(): Promise<void> {
  startFlueRuntimeInit();
  await initPromise!;
}

export async function initFlueRuntime(): Promise<void> {
  startFlueRuntimeInit();
  await initPromise!;
}

async function runFlueRuntimeInit(): Promise<void> {
  if (initialized) return;

  const catalogModules = getCatalogFlueAgentModules();
  const channelModules = getCatalogA2aChannelModules();
  const { agents, workflows, channelHandlers } = normalizeBuiltModules(
    catalogModules,
    {},
    channelModules,
  );

  const persistence = db as {
    migrate?: () => Promise<void>;
    connect: () =>
      | Promise<{
          executionStore: { submissions: { getSubmission: (...args: never[]) => unknown } };
          runStore: { createRun: (...args: never[]) => unknown; listRuns: (...args: never[]) => unknown };
          eventStreamStore: {
            appendEvent: (...args: never[]) => unknown;
            readEvents: (...args: never[]) => unknown;
          };
          conversationStreamStore: {
            append: (...args: never[]) => unknown;
            acquireProducer: (...args: never[]) => unknown;
          };
          attachmentStore: { put: (...args: never[]) => unknown; get: (...args: never[]) => unknown };
        }>
      | {
          executionStore: { submissions: { getSubmission: (...args: never[]) => unknown } };
          runStore: { createRun: (...args: never[]) => unknown; listRuns: (...args: never[]) => unknown };
          eventStreamStore: {
            appendEvent: (...args: never[]) => unknown;
            readEvents: (...args: never[]) => unknown;
          };
          conversationStreamStore: {
            append: (...args: never[]) => unknown;
            acquireProducer: (...args: never[]) => unknown;
          };
          attachmentStore: { put: (...args: never[]) => unknown; get: (...args: never[]) => unknown };
        };
  };

  if (!persistence || typeof persistence.connect !== 'function') {
    throw new Error('[flue] db.ts must default-export a PersistenceAdapter with a connect() method.');
  }

  let executionStore;
  let runStore;
  let eventStreamStore;
  let conversationStreamStore;
  let attachmentStore;

  try {
    if (persistence.migrate) await persistence.migrate();
    const stores = await persistence.connect();
    if (!stores || typeof stores !== 'object') {
      throw new Error('connect() must return { executionStore, runStore, eventStreamStore }.');
    }
    ({ executionStore, runStore, eventStreamStore, conversationStreamStore, attachmentStore } = stores);
    if (!executionStore || typeof executionStore.submissions?.getSubmission !== 'function') {
      throw new Error('connect() must return an executionStore with submissions.');
    }
    if (!runStore || typeof runStore.createRun !== 'function' || typeof runStore.listRuns !== 'function') {
      throw new Error('connect() must return a runStore.');
    }
    if (
      !eventStreamStore ||
      typeof eventStreamStore.appendEvent !== 'function' ||
      typeof eventStreamStore.readEvents !== 'function'
    ) {
      throw new Error('connect() must return an eventStreamStore.');
    }
    if (
      !conversationStreamStore ||
      typeof conversationStreamStore.append !== 'function' ||
      typeof conversationStreamStore.acquireProducer !== 'function'
    ) {
      throw new Error('connect() must return a conversationStreamStore.');
    }
    if (
      !attachmentStore ||
      typeof attachmentStore.put !== 'function' ||
      typeof attachmentStore.get !== 'function'
    ) {
      throw new Error('connect() must return an attachmentStore.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[flue] Failed to initialize persistence from db.ts: ${message}`, { cause: error });
  }

  setPlatformFlueStores({ attachmentStore, conversationStreamStore });

  const activityGate = createRuntimeActivityGate();

  function createAgentContextForRequest({ id, agentName, request, initialEventIndex, dispatchId }) {
    return createFlueContext({
      id,
      agentName,
      dispatchId,
      initialEventIndex,
      env: process.env,
      req: request,
      agentConfig: { resolveModel },
      createDefaultEnv: createDefaultEnvFactory(request),
      submissionStore: executionStore.submissions,
    });
  }

  function createWorkflowContextForRequest({ runId, request, initialEventIndex }) {
    return createFlueContext({
      id: runId,
      runId,
      initialEventIndex,
      env: process.env,
      req: request,
      agentConfig: { resolveModel },
      createDefaultEnv: createDefaultEnvFactory(request),
      submissionStore: executionStore.submissions,
    });
  }

  const agentCoordinator = createNodeAgentCoordinator({
    submissions: executionStore.submissions,
    agents,
    createContext: createAgentContextForRequest,
    conversationStreamStore,
    attachmentStore,
    activityGate,
  });

  const dispatchQueue = createNodeDispatchQueue(agentCoordinator);

  configureFlueRuntime({
    target: 'node',
    devMode: process.env.FLUE_MODE === 'local',
    temporaryLocalExposure: false,
    agents,
    workflows,
    createAgentAdmission: (agentName, instanceId) =>
      agentCoordinator.createAdmission(agentName, instanceId),
    abortAgentInstance: (agentName, instanceId) =>
      agentCoordinator.abortInstance(agentName, instanceId),
    dispatchQueue,
    activityGate,
    admitWorkflow: ({ workflowName, input }) => {
      const workflow = workflows.find((record) => record.name === workflowName)?.definition;
      if (!workflow) {
        throw new Error('[flue] Internal workflow admission target is not registered.');
      }
      return admitDetachedWorkflow({
        workflowName,
        workflow,
        input,
        request: new Request(
          `https://flue.invalid/_internal/workflows/${encodeURIComponent(workflowName)}`,
          { method: 'POST' },
        ),
        createContext: createWorkflowContextForRequest,
        runStore,
        eventStreamStore,
        activityGate,
      });
    },
    channelHandlers,
    createWorkflowContext: createWorkflowContextForRequest,
    runStore,
    eventStreamStore,
    conversationStreamStore,
    attachmentStore,
  });

  initialized = true;

  void runSubmissionGovernanceAtStartup({
    submissions: executionStore.submissions,
    abortInstance: (agentName, instanceId) => agentCoordinator.abortInstance(agentName, instanceId),
  })
    .then((result) => {
      if (result.aborted > 0) {
        console.info(
          `[flue] Startup submission governance aborted ${result.aborted}/${result.examined} stale submissions`,
        );
      }
    })
    .catch((error) => {
      console.error('[flue] Startup submission governance failed:', error);
    });
}
