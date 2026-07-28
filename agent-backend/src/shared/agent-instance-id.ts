/** Escape `@` so instance ids are safe in URL paths behind strict gateways. */
export function encodeUserIdForInstanceId(userId: string): string {
  return userId.trim().replace(/@/g, '_at_') || 'anonymous';
}

/** Flue agent instance ids are `{userId}--{sessionId}`. */
export function toAgentInstanceId(userId: string, sessionId: string): string {
  return `${encodeUserIdForInstanceId(userId)}--${sessionId}`;
}

export function parseSessionIdFromAgentInstanceId(instanceId: string): string | null {
  const separator = instanceId.indexOf('--');
  if (separator < 0) return null;
  return instanceId.slice(separator + 2).trim() || null;
}

/** Resolve app conversation id from a Flue instance id (legacy bare UUID still works). */
export function conversationIdFromInstanceId(instanceId: string): string {
  return parseSessionIdFromAgentInstanceId(instanceId) ?? instanceId;
}
