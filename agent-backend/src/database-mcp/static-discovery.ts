import { DATABASE_MCP_STATIC_TOOLS, PLATFORM_DATASOURCE_MCP_IDS } from './constants.ts';

export function discoverStaticPlatformMcpTools(platformMcpId: string):
  | { status: 'ok'; tools: Array<{ name: string; description: string }> }
  | null {
  if (!(PLATFORM_DATASOURCE_MCP_IDS as readonly string[]).includes(platformMcpId)) {
    return null;
  }
  return {
    status: 'ok',
    tools: DATABASE_MCP_STATIC_TOOLS.map((tool) => ({ ...tool })),
  };
}
