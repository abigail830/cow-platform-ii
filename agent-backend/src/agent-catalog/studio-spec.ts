import { eq } from 'drizzle-orm';
import { join } from 'node:path';
import { agentAssetsRoot } from './paths.ts';
import type { LoadedAgentSpec, SandboxYaml } from './schema.ts';
import { a2aYamlSchema, sandboxSchema } from './schema.ts';
import { appModelConfigs, appStudioAgents, db } from '../db/index.ts';

export type StudioAgentRow = typeof appStudioAgents.$inferSelect;

export async function loadStudioAgentRows(): Promise<StudioAgentRow[]> {
  return db.select().from(appStudioAgents);
}

export async function loadStudioAgentRowBySlug(slug: string): Promise<StudioAgentRow | null> {
  const [row] = await db.select().from(appStudioAgents).where(eq(appStudioAgents.slug, slug)).limit(1);
  return row ?? null;
}

export async function studioRowToLoadedSpec(row: StudioAgentRow): Promise<LoadedAgentSpec> {
  const [model] = await db
    .select({ name: appModelConfigs.name })
    .from(appModelConfigs)
    .where(eq(appModelConfigs.id, row.modelConfigId))
    .limit(1);
  if (!model) {
    throw new Error(`Studio agent "${row.slug}" references missing model config`);
  }

  const sandbox = sandboxSchema.parse(row.sandbox ?? { provider: 'none' }) as SandboxYaml;
  const a2a = row.a2a ? a2aYamlSchema.parse(row.a2a) : undefined;

  return {
    id: row.slug,
    displayName: row.displayName,
    description: row.description || row.displayName,
    icon: row.icon ?? undefined,
    model: {
      configName: model.name,
      ...(row.thinkingLevel
        ? {
            thinkingLevel: row.thinkingLevel as NonNullable<
              LoadedAgentSpec['model']['thinkingLevel']
            >,
          }
        : {}),
    },
    prompt: './prompt.md',
    skills: row.skillIds ?? [],
    mcp: [], // resolved per-user at runtime from platformMcpIds / privateMcpIds
    sandbox,
    access: { defaultForRoles: [] },
    ...(a2a ? { a2a } : {}),
    agentDir: join(agentAssetsRoot(), 'agents', '_studio', row.slug),
    instructions: row.instructions,
    source: 'studio',
    studioMeta: {
      id: row.id,
      createdBy: row.createdBy,
      platformMcpIds: row.platformMcpIds ?? [],
      privateMcpIds: row.privateMcpIds ?? [],
      datasourceIds: row.datasourceIds ?? [],
      origin: row.origin,
    },
  };
}
