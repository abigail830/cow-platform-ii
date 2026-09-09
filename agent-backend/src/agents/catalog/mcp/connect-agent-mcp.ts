import type { ToolDefinition } from '@flue/runtime';
import type { LoadedAgentSpec } from '../schema.ts';
import { connectFsAgentDatasources, connectStudioDatasources } from './datasource-mcp.ts';
import { connectStudioPlatformMcp, connectYamlMcpServers } from './platform-mcp.ts';

export async function connectAgentMcpTools(spec: LoadedAgentSpec): Promise<ToolDefinition[]> {
  if (spec.source === 'studio') {
    const [platform, datasources] = await Promise.all([
      connectStudioPlatformMcp(spec),
      connectStudioDatasources(spec),
    ]);
    return [...platform, ...datasources];
  }

  const [yamlTools, datasourceTools] = await Promise.all([
    connectYamlMcpServers(spec),
    connectFsAgentDatasources(spec),
  ]);
  return [...yamlTools.tools, ...datasourceTools];
}
