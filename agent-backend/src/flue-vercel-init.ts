// @ts-nocheck — mirrors Flue-generated server bootstrap; internal types are not exported.
/**
 * Initialize Flue agent runtime on Vercel (no `flue build` server entry).
 * Mirrors the generated block in dist/server.mjs without calling serve().
 */
import {
  Bash,
  InMemoryFs,
  bashFactoryToSessionEnv,
  configureFlueRuntime,
  createFlueContext,
  createNodeAgentCoordinator,
  createNodeDispatchQueue,
  resolveModel,
} from '@flue/runtime/internal';
import type { AgentRouteHandler } from '@flue/runtime';
import * as genericOkf from './agents/generic-okf.ts';
import * as smartProposal from './agents/smart-proposal.ts';
import db from './db.ts';

const RUNTIME_VERSION = '1.0.0-beta.9';
const packagedSkills: Record<string, unknown> = {};
const skills: Record<string, unknown> = {};
const systemPrompt = '';

type AgentModule = {
  default?: {
    __flueAgentDefinition?: boolean;
    initialize?: (...args: never[]) => unknown;
  };
  route?: AgentRouteHandler;
};

type FluePersistence = typeof db & {
  migrate?: () => Promise<void>;
  connect: () => {
    sessions: { save: (...args: never[]) => unknown };
    submissions: { getSubmission: (...args: never[]) => unknown };
  };
  connectRunStore: () => unknown;
  connectRunRegistry: () => unknown;
  connectEventStreamStore: () => {
    appendEvent: (...args: never[]) => unknown;
    readEvents: (...args: never[]) => unknown;
  };
};

function normalizeBuiltModules(
  agentModules: Record<string, AgentModule>,
  workflowModules: Record<string, { run?: unknown; route?: unknown }>,
) {
  const manifest: {
    agents: Array<{ name: string; transports: Record<string, boolean>; created: boolean }>;
    workflows: Array<{ name: string; transports: Record<string, boolean> }>;
  } = { agents: [], workflows: [] };
  const createdAgents: Record<string, NonNullable<AgentModule['default']>> = {};
  const dispatchAgentNames = new Map<NonNullable<AgentModule['default']>, string>();
  const workflowHandlers: Record<string, unknown> = {};
  const agentRouteMiddleware: Record<string, AgentRouteHandler> = {};
  const workflowRouteMiddleware: Record<string, AgentRouteHandler> = {};

  for (const [name, mod] of Object.entries(agentModules)) {
    if (!mod.default?.__flueAgentDefinition || typeof mod.default.initialize !== 'function') {
      throw new Error(`[flue] Agent "${name}" must default-export defineAgent(...).`);
    }
    if (mod.route !== undefined && typeof mod.route !== 'function') {
      throw new Error(`[flue] Agent "${name}" route export must be middleware.`);
    }
    const transports: Record<string, boolean> = {};
    if (typeof mod.route === 'function') transports.http = true;
    manifest.agents.push({ name, transports, created: true });
    createdAgents[name] = mod.default;
    const previous = dispatchAgentNames.get(mod.default);
    if (previous !== undefined) {
      throw new Error(`[flue] Agents "${previous}" and "${name}" share the same agent definition.`);
    }
    dispatchAgentNames.set(mod.default, name);
    if (typeof mod.route === 'function') agentRouteMiddleware[name] = mod.route;
  }

  for (const [name, mod] of Object.entries(workflowModules)) {
    if (typeof mod.run !== 'function') {
      throw new Error(`[flue] Workflow "${name}" must export run.`);
    }
    const transports: Record<string, boolean> = {};
    if (typeof mod.route === 'function') transports.http = true;
    manifest.workflows.push({ name, transports });
    if (transports.http) workflowHandlers[name] = mod.run;
    if (typeof mod.route === 'function') workflowRouteMiddleware[name] = mod.route as AgentRouteHandler;
  }

  return {
    manifest,
    createdAgents,
    dispatchAgentNames,
    workflowHandlers,
    agentRouteMiddleware,
    workflowRouteMiddleware,
  };
}

async function createDefaultEnv() {
  const fs = new InMemoryFs();
  return bashFactoryToSessionEnv(
    () =>
      new Bash({
        fs,
        network: { dangerouslyAllowFullInternetAccess: true },
      }),
  );
}

let initialized = false;

export async function initFlueRuntime(): Promise<void> {
  if (initialized) return;

  const {
    manifest,
    createdAgents,
    dispatchAgentNames,
    workflowHandlers,
    agentRouteMiddleware,
    workflowRouteMiddleware,
  } = normalizeBuiltModules(
    {
      'generic-okf': genericOkf,
      'smart-proposal': smartProposal,
    },
    {},
  );

  const persistence = db as FluePersistence;
  if (!persistence || typeof persistence.connect !== 'function') {
    throw new Error('[flue] db.ts must default-export a PersistenceAdapter with connect().');
  }

  if (persistence.migrate) await persistence.migrate();
  const executionStore = persistence.connect();
  if (
    !executionStore?.sessions?.save ||
    !executionStore?.submissions?.getSubmission
  ) {
    throw new Error('[flue] connect() must return AgentExecutionStore with sessions and submissions.');
  }

  const runStore = persistence.connectRunStore();
  const runRegistry = persistence.connectRunRegistry();
  if (typeof persistence.connectEventStreamStore !== 'function') {
    throw new Error('[flue] connectEventStreamStore() must be defined on the PersistenceAdapter.');
  }
  const eventStreamStore = persistence.connectEventStreamStore();
  if (!eventStreamStore?.appendEvent || !eventStreamStore?.readEvents) {
    throw new Error('[flue] connectEventStreamStore() must return EventStreamStore.');
  }

  function createContextForRequest(
    id: string,
    runId: string,
    payload: unknown,
    req: Request,
    initialEventIndex?: number,
    dispatchId?: string,
  ) {
    return createFlueContext({
      id,
      runId,
      dispatchId,
      payload,
      initialEventIndex,
      env: process.env,
      req,
      agentConfig: {
        systemPrompt,
        skills,
        packagedSkills,
        model: undefined,
        resolveModel,
      },
      createDefaultEnv,
      defaultStore: executionStore.sessions,
      submissionStore: executionStore.submissions,
    });
  }

  const agentCoordinator = createNodeAgentCoordinator({
    submissions: executionStore.submissions,
    agents: createdAgents,
    createContext: createContextForRequest,
    eventStreamStore,
  });

  const dispatchQueue = createNodeDispatchQueue(agentCoordinator);
  const createAdmission = Object.fromEntries(
    Object.keys(createdAgents).map((name) => [
      name,
      (instanceId: string) => agentCoordinator.createAdmission(name, instanceId),
    ]),
  );

  configureFlueRuntime({
    target: 'node',
    devMode: process.env.FLUE_MODE === 'local',
    runtimeVersion: RUNTIME_VERSION,
    manifest,
    createAdmission,
    dispatchQueue,
    resolveDispatchAgentName: (agent) => dispatchAgentNames.get(agent),
    workflowHandlers,
    agentRouteMiddleware,
    workflowRouteMiddleware,
    createContext: createContextForRequest,
    runStore,
    runRegistry,
    eventStreamStore,
  });

  void agentCoordinator.reconcileSubmissions().catch((error) => {
    console.error('[flue] Startup submission reconciliation failed:', error);
  });

  initialized = true;
}
