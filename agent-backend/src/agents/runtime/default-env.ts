import { Bash, InMemoryFs, bashFactoryToSessionEnv } from '@flue/runtime/internal';
import { buildOpenKmsSandboxEnv } from '../../auth/openkms-headers.ts';

/** Must stay sync: Flue expects `createDefaultEnv` itself to be a function, not a Promise. */
export function createDefaultEnvFactory(request: Request) {
  const openkmsEnv = buildOpenKmsSandboxEnv(request);
  return async function createDefaultEnv() {
    const fs = new InMemoryFs();
    return bashFactoryToSessionEnv(
      () =>
        new Bash({
          fs,
          network: { dangerouslyAllowFullInternetAccess: true },
          env: {
            ...process.env,
            ...openkmsEnv,
          },
        }),
    );
  };
}
