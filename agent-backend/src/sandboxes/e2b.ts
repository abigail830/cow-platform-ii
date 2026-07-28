import { createSandboxSessionEnv, SandboxOperationUnsupportedError } from '@flue/runtime';
import type { FileStat, SandboxApi, SandboxFactory, SessionEnv } from '@flue/runtime';
import type { Sandbox as E2BSandbox } from 'e2b';

class E2BSandboxApi implements SandboxApi {
  constructor(private sandbox: E2BSandbox) {}

  async readFile(path: string): Promise<string> {
    return this.sandbox.files.read(path);
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    return this.sandbox.files.read(path, { format: 'bytes' });
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    if (typeof content === 'string') {
      await this.sandbox.files.write(path, content);
      return;
    }
    const ab = content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    ) as ArrayBuffer;
    await this.sandbox.files.write(path, ab);
  }

  async stat(path: string): Promise<FileStat> {
    const info = await this.sandbox.files.getInfo(path);
    return {
      isFile: info.type === 'file',
      isDirectory: info.type === 'dir',
      isSymbolicLink: typeof info.symlinkTarget === 'string' && info.symlinkTarget.length > 0,
      size: 0,
      mtime: new Date(),
    };
  }

  async readdir(path: string): Promise<string[]> {
    const entries = await this.sandbox.files.list(path);
    return entries.map((e) => e.name);
  }

  async exists(path: string): Promise<boolean> {
    return this.sandbox.files.exists(path);
  }

  async mkdir(path: string): Promise<void> {
    await this.sandbox.files.makeDir(path);
  }

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    const unsupported = [
      options?.recursive ? 'recursive' : undefined,
      options?.force ? 'force' : undefined,
    ].filter((option): option is string => option !== undefined);
    if (unsupported.length > 0) {
      throw new SandboxOperationUnsupportedError({
        operation: 'rm',
        provider: 'E2B',
        options: unsupported,
      });
    }
    await this.sandbox.files.remove(path);
  }

  async exec(
    command: string,
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
      signal?: AbortSignal;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const result = await this.sandbox.commands.run(command, {
      cwd: options?.cwd,
      envs: options?.env,
      timeoutMs: options?.timeout,
    });
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.exitCode ?? 0,
    };
  }
}

export function e2b(sandbox: E2BSandbox): SandboxFactory {
  return {
    async createSessionEnv(): Promise<SessionEnv> {
      const sandboxCwd = '/home/user';
      const api = new E2BSandboxApi(sandbox);
      return createSandboxSessionEnv(api, sandboxCwd);
    },
  };
}
