/**
 * Packaged pipeline worker YAML on disk — **local dev / Admin "Reset to default" only**.
 * Vercel runtime and KB import paths read `app_pipeline_configs.config_yaml` from the DB.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function candidateWorkflowDirs(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fromEnv = process.env.PIPELINE_WORKFLOWS_PATH?.trim();
  return [
    ...(fromEnv ? [path.resolve(fromEnv)] : []),
    // agent-backend/src/shared → ../.. = agent-backend root
    path.resolve(here, '..', '..', 'pipeline-workflows'),
    // agent-backend/dist/shared → ../../.. = agent-backend root
    path.resolve(here, '..', '..', '..', 'pipeline-workflows'),
    // cwd-relative (dev from agent-backend/)
    path.resolve(process.cwd(), 'pipeline-workflows'),
  ];
}

function pipelineWorkflowsDir(): string | null {
  for (const dir of candidateWorkflowDirs()) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

/** Load packaged default worker YAML for a pipeline_name (null if missing). */
export function readCliPackagedDefaultConfigYaml(pipelineName: string): string | null {
  const name = pipelineName.trim();
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return null;
  }
  const dir = pipelineWorkflowsDir();
  if (!dir) return null;
  const filePath = path.join(dir, `${name}.yml`);
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}
