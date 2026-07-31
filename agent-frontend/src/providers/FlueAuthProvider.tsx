import { FlueProvider } from '@flue/react';
import { createFlueClient } from '@flue/sdk';
import { useMemo, type ReactNode } from 'react';
import { flueApiBaseUrl } from '../api/base.ts';
import { getToken } from '../api/auth.ts';

export function FlueAuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(
    () =>
      createFlueClient({
        baseUrl: flueApiBaseUrl(),
        headers: async (): Promise<Record<string, string>> => {
          const token = getToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        fetch: (input, init) => globalThis.fetch(input, init),
      }),
    [],
  );

  return <FlueProvider client={client}>{children}</FlueProvider>;
}
