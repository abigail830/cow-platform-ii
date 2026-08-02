import type { SandboxFactory, SessionEnv } from '@flue/runtime';
// @ts-expect-error — runtime internal bootstrap API (same as flue-vercel-init).
import { Bash, InMemoryFs, bashFactoryToSessionEnv } from '@flue/runtime/internal';
import { buildOpenKmsEnvForInstance } from '../auth/openkms-instance-env.ts';
import { createKbQaHostNodeCommand } from './kb-qa-host-node.ts';
import { buildKbQaWorkspaceFiles, KB_QA_WORKSPACE_CWD, resolveOpenkmsSkillRoot } from './kb-qa-workspace.ts';
import { redactSandboxSecrets } from './sandbox-secret-redact.ts';

function wrapSessionEnvWithSecretRedaction(base: SessionEnv): SessionEnv {
  const baseExec = base.exec.bind(base);
  return {
    ...base,
    exec: async (command, options) => {
      const result = await baseExec(command, options);
      return {
        ...result,
        stdout: redactSandboxSecrets(result.stdout),
        stderr: redactSandboxSecrets(result.stderr),
      };
    },
  };
}

/** Browser/just-bash sandbox with hybrid-search Node scripts preloaded (Playground + flue dev). */
export function createKbQaBrowserSandboxFactory(): SandboxFactory {
  const workspace = buildKbQaWorkspaceFiles();
  const skillRoot = resolveOpenkmsSkillRoot();
  const nodeCommand = createKbQaHostNodeCommand(skillRoot);

  return {
    async createSessionEnv({ id: instanceId }) {
      const openkmsEnv = buildOpenKmsEnvForInstance(instanceId);
      const sessionEnv = await bashFactoryToSessionEnv(
        () =>
          new Bash({
            fs: new InMemoryFs(workspace),
            cwd: KB_QA_WORKSPACE_CWD,
            network: { dangerouslyAllowFullInternetAccess: true },
            customCommands: [nodeCommand],
            env: {
              ...process.env,
              ...openkmsEnv,
            },
          }),
      );
      return wrapSessionEnvWithSecretRedaction(sessionEnv);
    },
  };
}
