import { z } from 'zod';
import { toolPacksSchema } from './tool-pack-schema.ts';

const agentIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be lowercase letters, numbers, and hyphens');

export const mcpServerSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  urlEnv: z.string().min(1),
  transport: z.enum(['streamable-http', 'sse']).default('streamable-http'),
  headersEnv: z.record(z.string(), z.string()).optional(),
  allowTools: z.array(z.string()).optional(),
});

export const sandboxSchema = z.object({
  provider: z.enum(['none', 'e2b']).default('none'),
  cwd: z.string().optional(),
  templateId: z.string().optional(),
});

export const agentYamlSchema = z.object({
  id: agentIdSchema,
  displayName: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1).optional(),
  model: z
    .object({
      configName: z.string().min(1).optional(),
      profile: z.string().min(1).optional(),
    })
    .refine((value) => Boolean(value.configName?.trim() || value.profile?.trim()), {
      message: 'model.configName or model.profile is required',
    }),
  prompt: z.string().default('./prompt.md'),
  skills: z.array(z.string()).default([]),
  tools: z
    .object({
      packs: toolPacksSchema,
    })
    .default({ packs: [] }),
  mcp: z.array(mcpServerSchema).default([]),
  sandbox: sandboxSchema.default({ provider: 'none' }),
  access: z
    .object({
      defaultForRoles: z.array(z.string()).default(['admin']),
    })
    .default({ defaultForRoles: ['admin'] }),
});

export type AgentYaml = z.infer<typeof agentYamlSchema>;
export type McpServerYaml = z.infer<typeof mcpServerSchema>;
export type SandboxYaml = z.infer<typeof sandboxSchema>;

export type LoadedAgentSpec = AgentYaml & {
  agentDir: string;
  instructions: string;
};
