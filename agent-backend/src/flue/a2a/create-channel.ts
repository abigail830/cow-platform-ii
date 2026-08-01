import type { AgentRouteHandler } from '@flue/runtime';
import {
  AgentCard,
  CancelTaskRequest,
  GetTaskRequest,
  Message,
  SendMessageRequest,
  Task,
} from '@a2a-js/sdk';
import { A2A_CONTENT_TYPE } from '@a2a-js/sdk';
import {
  defaultServerCallContextBuilder,
  type DefaultRequestHandler,
  type RequestHeaders,
  type User,
} from '@a2a-js/sdk/server';
import type { LoadedAgentSpec } from '../../agent-catalog/schema.ts';
import { loadAllAgentSpecs } from '../../agent-catalog/discover.ts';
import { buildAgentCardForSpec } from './build-agent-card.ts';
import { isA2aEnabledForSpec } from './config.ts';
import { requireA2aAuth } from './auth.ts';
import { getA2aRequestHandler } from './executor.ts';

class A2aServiceUser implements User {
  get isAuthenticated(): boolean {
    return true;
  }
  get userName(): string {
    return 'a2a-service';
  }
}

function buildServerCallContext(c: { req: { raw: Request } }) {
  const headers: RequestHeaders = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return defaultServerCallContextBuilder({
    extensions: undefined,
    user: new A2aServiceUser(),
    headers,
  });
}

function jsonA2a(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Content-Type': A2A_CONTENT_TYPE },
  });
}

function encodeSendMessageResult(result: Message | Task): Record<string, unknown> {
  if ('status' in result && 'artifacts' in result) {
    return { task: Task.toJSON(result) };
  }
  return { message: Message.toJSON(result) };
}

function parseHistoryLength(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^-?\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function createSendMessageHandler(requestHandler: DefaultRequestHandler): AgentRouteHandler {
  return async (c) => {
    const rejected = requireA2aAuth(c);
    if (rejected) return rejected;

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return jsonA2a({ error: { code: 400, message: 'Invalid JSON body.' } }, 400);
    }

    const params = SendMessageRequest.fromJSON({
      tenant: '',
      message: body.message,
      configuration: body.configuration,
      metadata: body.metadata,
    });

    const result = await requestHandler.sendMessage(params, buildServerCallContext(c));
    return jsonA2a(encodeSendMessageResult(result), 200);
  };
}

function createGetTaskHandler(requestHandler: DefaultRequestHandler): AgentRouteHandler {
  return async (c) => {
    const rejected = requireA2aAuth(c);
    if (rejected) return rejected;

    const taskId = c.req.param('taskId') ?? c.req.param('taskIdAction')?.replace(/:cancel$/, '');
    if (!taskId) {
      return jsonA2a({ error: { code: 400, message: 'Missing task ID.' } }, 400);
    }

    const params = GetTaskRequest.fromJSON({
      tenant: '',
      id: taskId,
      historyLength: parseHistoryLength(c.req.query('historyLength')),
    });

    const task = await requestHandler.getTask(params, buildServerCallContext(c));
    return jsonA2a(Task.toJSON(task), 200);
  };
}

function createCancelTaskHandler(requestHandler: DefaultRequestHandler): AgentRouteHandler {
  return async (c) => {
    const rejected = requireA2aAuth(c);
    if (rejected) return rejected;

    const raw = c.req.param('taskIdAction') ?? '';
    if (!raw.endsWith(':cancel')) {
      return jsonA2a({ error: { code: 404, message: 'Not found.' } }, 404);
    }
    const taskId = raw.slice(0, -':cancel'.length);
    if (!taskId) {
      return jsonA2a({ error: { code: 400, message: 'Missing task ID.' } }, 400);
    }

    let metadata: Record<string, unknown> | undefined;
    try {
      const body = await c.req.json();
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        metadata = (body as Record<string, unknown>).metadata as Record<string, unknown> | undefined;
      }
    } catch {
      // empty body is fine
    }

    const params = CancelTaskRequest.fromJSON({ tenant: '', id: taskId, metadata });
    const task = await requestHandler.cancelTask(params, buildServerCallContext(c));
    return jsonA2a(Task.toJSON(task), 200);
  };
}

function unsupportedHandler(operation: string): AgentRouteHandler {
  return async () =>
    jsonA2a(
      {
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: `${operation} is not supported by this agent.`,
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
              reason: 'UNSUPPORTED_OPERATION',
              domain: 'a2a-protocol.org',
            },
          ],
        },
      },
      400,
    );
}

export type A2aChannelExport = {
  channel: {
    routes: Array<{
      method: string;
      path: string;
      handler: AgentRouteHandler;
    }>;
  };
};

export function buildA2aChannelForSpec(spec: LoadedAgentSpec): A2aChannelExport {
  const agentCard = buildAgentCardForSpec(spec);
  const requestHandler = getA2aRequestHandler(spec.id, agentCard);

  const agentCardHandler: AgentRouteHandler = async () => {
    const card = await requestHandler.getAgentCard();
    return Response.json(AgentCard.toJSON(card), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  };

  const sendMessage = createSendMessageHandler(requestHandler);

  return {
    channel: {
      routes: [
        { method: 'GET', path: '/.well-known/agent-card.json', handler: agentCardHandler },
        { method: 'POST', path: '/message:send', handler: sendMessage },
        { method: 'POST', path: '/v1/message:send', handler: sendMessage },
        { method: 'POST', path: '/message:stream', handler: unsupportedHandler('SendStreamingMessage') },
        { method: 'POST', path: '/v1/message:stream', handler: unsupportedHandler('SendStreamingMessage') },
        { method: 'GET', path: '/tasks/:taskId', handler: createGetTaskHandler(requestHandler) },
        { method: 'GET', path: '/v1/tasks/:taskId', handler: createGetTaskHandler(requestHandler) },
        { method: 'GET', path: '/tasks', handler: unsupportedHandler('ListTasks') },
        { method: 'GET', path: '/v1/tasks', handler: unsupportedHandler('ListTasks') },
        {
          method: 'POST',
          path: '/tasks/:taskIdAction',
          handler: createCancelTaskHandler(requestHandler),
        },
        {
          method: 'POST',
          path: '/v1/tasks/:taskIdAction',
          handler: createCancelTaskHandler(requestHandler),
        },
      ],
    },
  };
}

export function buildCatalogA2aChannel(agentId: string): A2aChannelExport {
  const spec = loadAllAgentSpecs().find((entry) => entry.id === agentId);
  if (!spec) {
    throw new Error(`Unknown catalog agent "${agentId}". Run npm run catalog:sync.`);
  }
  if (!isA2aEnabledForSpec(spec)) {
    throw new Error(`Agent "${agentId}" does not have A2A enabled in agent.yaml.`);
  }
  return buildA2aChannelForSpec(spec);
}

export function getCatalogA2aChannelModules(): Record<string, A2aChannelExport> {
  const modules: Record<string, A2aChannelExport> = {};
  for (const spec of loadAllAgentSpecs()) {
    if (!isA2aEnabledForSpec(spec)) continue;
    modules[`${spec.id}-a2a`] = buildA2aChannelForSpec(spec);
  }
  return modules;
}
