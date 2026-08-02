import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { defineCommand, type Command } from 'just-bash';
import { KB_QA_WORKSPACE_CWD, resolveOpenkmsSkillRoot } from './kb-qa-workspace.ts';

const SKILLS_VFS_PREFIX = `${KB_QA_WORKSPACE_CWD}/skills/`;

function normalizeVfsPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return `/${stack.join('/')}`;
}

function resolveHostScriptPath(scriptArg: string, cwd: string, skillRoot: string): string | null {
  if (!scriptArg || scriptArg.startsWith('-')) return null;

  const vfsAbsolute = scriptArg.startsWith('/')
    ? scriptArg
    : normalizeVfsPath(`${cwd.replace(/\/$/, '')}/${scriptArg}`);

  if (!vfsAbsolute.startsWith(SKILLS_VFS_PREFIX)) return null;

  return join(skillRoot, vfsAbsolute.slice(SKILLS_VFS_PREFIX.length));
}

function envMapToRecord(env: Map<string, string>): Record<string, string> {
  return Object.fromEntries(env.entries());
}

function runHostNode(
  argv: string[],
  cwd: string,
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argv, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

/** Bridge `node` in the just-bash vfs to the host Node runtime for hybrid-search scripts. */
export function createKbQaHostNodeCommand(skillRoot = resolveOpenkmsSkillRoot()): Command {
  return defineCommand(
    'node',
    async (args, ctx) => {
      const env = envMapToRecord(ctx.env);
      const scriptArg = args[0];

      if (!scriptArg || scriptArg.startsWith('-')) {
        return runHostNode(args, skillRoot, env);
      }

      const hostScript = resolveHostScriptPath(scriptArg, ctx.cwd, skillRoot);
      if (!hostScript) {
        return {
          stdout: '',
          stderr: `node: cannot run "${scriptArg}" (only hybrid-search skill scripts are available)\n`,
          exitCode: 1,
        };
      }

      return runHostNode([hostScript, ...args.slice(1)], dirname(hostScript), env);
    },
    { trusted: true },
  );
}
