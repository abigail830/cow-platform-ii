export function encodeUserIdForInstanceId(userId: string): string {
  return userId.trim().replace(/@/g, '_at_') || 'anonymous';
}

export function toAgentInstanceId(userId: string, sessionId: string): string {
  return `${encodeUserIdForInstanceId(userId)}--${sessionId}`;
}
