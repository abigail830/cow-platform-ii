/** Parse `/api/agents/:agentName/:instanceId` (and nested suffixes) from a request pathname. */
export function parseAgentInstancePath(pathname: string): { agentName: string; instanceId: string } | null {
  const match = pathname.match(/\/agents\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  const agentName = match[1]?.trim();
  const instanceId = match[2]?.trim();
  if (!agentName || !instanceId) return null;
  return { agentName, instanceId };
}

export function isAgentLiveSseRequest(url: string, acceptHeader?: string | null): boolean {
  if (url.includes('live=sse')) return true;
  const accept = acceptHeader?.toLowerCase() ?? '';
  return accept.includes('text/event-stream');
}
