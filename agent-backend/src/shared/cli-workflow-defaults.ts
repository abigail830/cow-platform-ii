import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function candidateWorkflowDirs(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    // agent-backend/src/shared → ../../.. = repo root
    path.resolve(here, '..', '..', '..', 'openkms-cli', 'workflows'),
    // agent-backend/dist/shared → ../../../.. = repo root
    path.resolve(here, '..', '..', '..', '..', 'openkms-cli', 'workflows'),
    // cwd-relative (dev from agent-backend/)
    path.resolve(process.cwd(), '..', 'openkms-cli', 'workflows'),
    path.resolve(process.cwd(), 'openkms-cli', 'workflows'),
  ];
}

function openkmsCliWorkflowsDir(): string | null {
  for (const dir of candidateWorkflowDirs()) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

/** Load packaged CLI default worker YAML for a pipeline_name (null if missing). */
export function readCliPackagedDefaultConfigYaml(pipelineName: string): string | null {
  const name = pipelineName.trim();
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return null;
  }
  const dir = openkmsCliWorkflowsDir();
  if (!dir) return null;
  const filePath = path.join(dir, `${name}.yml`);
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}
