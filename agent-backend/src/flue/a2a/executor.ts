import { randomUUID } from 'node:crypto';
import {
  AgentEvent,
  DefaultExecutionEventBus,
  DefaultRequestHandler,
  InMemoryTaskStore,
  RequestContext,
  type AgentExecutor,
  type ExecutionEventBus,
} from '@a2a-js/sdk/server';
import {
  Artifact,
  Message,
  Part,
  Role,
  TaskState,
  type Message as A2aMessage,
  type Task,
} from '@a2a-js/sdk';
import { extractTextFromA2aMessage } from './extract-text.ts';
import { invokeFlueAgentViaPrompt } from './invoke-agent.ts';

const activeAborts = new Map<string, AbortController>();

export function createFlueA2aExecutor(agentName: string): AgentExecutor {
  return {
    async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
      const { taskId, contextId } = requestContext;
      const userText = extractTextFromA2aMessage(requestContext.userMessage);
      if (!userText) {
        throw new Error('A2A message must include at least one text part.');
      }

      const abortController = new AbortController();
      activeAborts.set(taskId, abortController);

      const now = new Date().toISOString();
      const submittedTask: Task = {
        id: taskId,
        contextId,
        status: {
          state: TaskState.TASK_STATE_SUBMITTED,
          message: undefined,
          timestamp: now,
        },
        artifacts: [],
        history: [requestContext.userMessage],
        metadata: undefined,
      };
      eventBus.publish(AgentEvent.task(submittedTask));
      eventBus.publish(
        AgentEvent.statusUpdate({
          taskId,
          contextId,
          status: {
            state: TaskState.TASK_STATE_WORKING,
            message: undefined,
            timestamp: new Date().toISOString(),
          },
          metadata: undefined,
        }),
      );

      try {
        const result = await invokeFlueAgentViaPrompt({
          agentName,
          conversationId: contextId,
          message: userText,
        });

        if (abortController.signal.aborted) {
          publishCanceled(eventBus, taskId, contextId);
          return;
        }

        const agentMessage = buildAgentTextMessage({
          contextId,
          taskId,
          text: result.text || '(no text response)',
        });
        eventBus.publish(AgentEvent.message(agentMessage));

        for (const published of result.artifacts) {
          const artifact: Artifact = {
            artifactId: randomUUID(),
            name: published.filename,
            description: published.filename,
            parts: [
              Part.fromJSON({
                content: {
                  data: {
                    downloadUrl: published.downloadUrl,
                    filename: published.filename,
                  },
                },
                mediaType: 'application/json',
                filename: published.filename,
              }),
            ],
            metadata: { source: 'publish_artifact' },
            extensions: [],
          };
          eventBus.publish(
            AgentEvent.artifactUpdate({
              taskId,
              contextId,
              artifact,
              append: false,
              lastChunk: true,
              metadata: undefined,
            }),
          );
        }

        eventBus.publish(
          AgentEvent.statusUpdate({
            taskId,
            contextId,
            status: {
              state: TaskState.TASK_STATE_COMPLETED,
              message: agentMessage,
              timestamp: new Date().toISOString(),
            },
            metadata: undefined,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        eventBus.publish(
          AgentEvent.statusUpdate({
            taskId,
            contextId,
            status: {
              state: TaskState.TASK_STATE_FAILED,
              message: buildAgentTextMessage({ contextId, taskId, text: message }),
              timestamp: new Date().toISOString(),
            },
            metadata: undefined,
          }),
        );
      } finally {
        activeAborts.delete(taskId);
      }
    },

    async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
      const controller = activeAborts.get(taskId);
      controller?.abort();
      publishCanceled(eventBus, taskId, 'unknown');
    },
  };
}

function publishCanceled(eventBus: ExecutionEventBus, taskId: string, contextId: string): void {
  eventBus.publish(
    AgentEvent.statusUpdate({
      taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_CANCELED,
        message: undefined,
        timestamp: new Date().toISOString(),
      },
      metadata: undefined,
    }),
  );
}

function buildAgentTextMessage(input: {
  contextId: string;
  taskId: string;
  text: string;
}): A2aMessage {
  return Message.fromJSON({
    messageId: randomUUID(),
    contextId: input.contextId,
    taskId: input.taskId,
    role: Role.ROLE_AGENT,
    parts: [
      Part.fromJSON({
        content: { text: input.text },
        mediaType: 'text/plain',
      }),
    ],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  });
}

const requestHandlers = new Map<string, DefaultRequestHandler>();

export function getA2aRequestHandler(
  agentName: string,
  agentCard: ReturnType<typeof import('./build-agent-card.ts').buildAgentCardForSpec>,
): DefaultRequestHandler {
  const existing = requestHandlers.get(agentName);
  if (existing) return existing;

  const handler = new DefaultRequestHandler(
    agentCard,
    new InMemoryTaskStore(),
    createFlueA2aExecutor(agentName),
  );
  requestHandlers.set(agentName, handler);
  return handler;
}

export function resetA2aRequestHandlersForTests(): void {
  requestHandlers.clear();
  activeAborts.clear();
}

export function createIsolatedA2aRequestHandler(
  agentName: string,
  agentCard: ReturnType<typeof import('./build-agent-card.ts').buildAgentCardForSpec>,
): DefaultRequestHandler {
  return new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), createFlueA2aExecutor(agentName));
}

// Ensure bus can be constructed in tests without importing unused symbol warnings.
void DefaultExecutionEventBus;
