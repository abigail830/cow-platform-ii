import { FlueProvider } from '@flue/react';
import { createFlueClient } from '@flue/sdk';
import { useMemo, type ReactNode } from 'react';
import { flueApiBaseUrl } from '../api/base.ts';
import { getToken } from '../api/auth.ts';
import { getAgentApiKey, OPENKMS_API_KEY_HEADER } from '../api/agent-api-key.ts';

export function FlueAuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(
    () =>
      createFlueClient({
        baseUrl: flueApiBaseUrl(),
        headers: async (): Promise<Record<string, string>> => {
          const headers: Record<string, string> = {};
          const token = getToken();
          if (token) headers.Authorization = `Bearer ${token}`;
          const agentApiKey = getAgentApiKey();
          if (agentApiKey) headers[OPENKMS_API_KEY_HEADER] = agentApiKey;
          return headers;
        },
        fetch: (input, init) => globalThis.fetch(input, init),
      }),
    [],
  );

  return <FlueProvider client={client}>{children}</FlueProvider>;
}
