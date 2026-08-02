import './load-env.ts';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { discoverAgentDirectories, loadAgentSpec } from '../src/agent-catalog/discover.ts';
import { agentCatalogRoot, resolveCatalogPath } from '../src/agent-catalog/paths.ts';
import { listKnownToolPacks } from '../src/agent-catalog/tool-packs.ts';
import { isOkfToolPack } from '../src/agent-catalog/tool-pack-schema.ts';
import { closePool } from '../src/db/pool.ts';
import { getModelConfigByName } from '../src/shared/model-config-store.ts';
import { resolveOkfBundleRoot } from '../src/shared/okf-bundle.ts';

const CHAT_AGENT_API_TYPES = new Set(['chat-completions']);

type ValidationIssue = { agentId?: string; message: string };

function validateAgentSync(agentDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let spec;
  try {
    spec = loadAgentSpec(agentDir);
  } catch (error) {
    return [{ message: error instanceof Error ? error.message : String(error) }];
  }

  const skillNames = new Set<string>();
  for (const skillRef of spec.skills) {
    const skillDir = resolveCatalogPath(skillRef, spec.agentDir);
    const skillPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillPath)) {
      issues.push({
        agentId: spec.id,
        message: `Missing SKILL.md for skill reference ${skillRef}`,
      });
      continue;
    }
    const dirName = skillDir.split('/').pop() ?? skillRef;
    if (skillNames.has(dirName)) {
      issues.push({ agentId: spec.id, message: `Duplicate skill directory ${dirName}` });
    }
    skillNames.add(dirName);
  }

  for (const pack of spec.tools.packs) {
    if (!listKnownToolPacks().includes(pack.name)) {
      issues.push({ agentId: spec.id, message: `Unknown tool pack "${pack.name}"` });
      continue;
    }
    if (isOkfToolPack(pack)) {
      try {
        resolveOkfBundleRoot(pack.bundle);
      } catch (error) {
        issues.push({
          agentId: spec.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const mcpNames = new Set<string>();
  for (const server of spec.mcp) {
    if (mcpNames.has(server.name)) {
      issues.push({ agentId: spec.id, message: `Duplicate MCP server name "${server.name}"` });
    }
    mcpNames.add(server.name);
    if (!process.env[server.urlEnv]?.trim()) {
      issues.push({
        agentId: spec.id,
        message: `MCP server "${server.name}" references unset env ${server.urlEnv}`,
      });
    }
  }

  if (spec.sandbox.provider === 'e2b' && !process.env.E2B_API_KEY?.trim()) {
    issues.push({
      agentId: spec.id,
      message: 'sandbox.provider e2b requires E2B_API_KEY',
    });
  }

  if (spec.a2a && spec.a2a.enabled !== false) {
    if (!spec.a2a.skills?.length) {
      issues.push({
        agentId: spec.id,
        message: 'a2a.skills must contain at least one skill when A2A is enabled',
      });
    } else {
      const skillIds = new Set<string>();
      for (const skill of spec.a2a.skills) {
        if (skillIds.has(skill.id)) {
          issues.push({
            agentId: spec.id,
            message: `Duplicate a2a.skills id "${skill.id}"`,
          });
        }
        skillIds.add(skill.id);
      }
    }
  }

  return issues;
}

async function validateAgentModelConfig(spec: {
  id: string;
  model: { configName?: string; profile?: string };
}): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const configName = spec.model.configName?.trim();
  if (!configName) return issues;

  const config = await getModelConfigByName(configName);
  if (!config) {
    issues.push({
      agentId: spec.id,
      message: `model.configName "${configName}" not found in Admin model configs`,
    });
    return issues;
  }

  if (!CHAT_AGENT_API_TYPES.has(config.apiType)) {
    issues.push({
      agentId: spec.id,
      message: `model.configName "${configName}" must use apiType chat-completions (got ${config.apiType})`,
    });
  }

  return issues;
}

async function main() {
  const strictMcp = process.argv.includes('--strict-mcp');
  const catalogRoot = agentCatalogRoot();
  if (!existsSync(catalogRoot)) {
    console.error(`Catalog not found: ${catalogRoot}`);
    process.exit(1);
  }

  const dirs = discoverAgentDirectories(catalogRoot);
  if (dirs.length === 0) {
    console.error('No agents discovered in agent-catalog/');
    process.exit(1);
  }

  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();

  for (const dir of dirs) {
    const specIssues = validateAgentSync(dir);
    for (const issue of specIssues) {
      if (!strictMcp && issue.message.includes('references unset env')) continue;
      issues.push(issue);
    }
    try {
      const spec = loadAgentSpec(dir);
      if (ids.has(spec.id)) issues.push({ message: `Duplicate agent id ${spec.id}` });
      ids.add(spec.id);
      const modelIssues = await validateAgentModelConfig(spec);
      issues.push(...modelIssues);
    } catch (error) {
      issues.push({ message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (issues.length > 0) {
    console.error('Agent catalog validation failed:');
    for (const issue of issues) {
      const prefix = issue.agentId ? `[${issue.agentId}] ` : '';
      console.error(`  - ${prefix}${issue.message}`);
    }
    process.exit(1);
  }

  console.log(`Agent catalog valid (${dirs.length} agent(s)).`);
}

main()
  .then(async () => {
    await closePool();
  })
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
