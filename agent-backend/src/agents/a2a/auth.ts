import type { Context } from 'hono';
import { bearerToken } from '../../auth/jwt.ts';
import { readA2aApiKey } from './config.ts';

export function a2aUnauthorizedResponse(): Response {
  return Response.json(
    {
      error: {
        code: 401,
        status: 'UNAUTHENTICATED',
        message: 'Unauthorized',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'UNAUTHENTICATED',
            domain: 'a2a-protocol.org',
          },
        ],
      },
    },
    { status: 401, headers: { 'Content-Type': 'application/a2a+json' } },
  );
}

export function a2aNotConfiguredResponse(): Response {
  return Response.json(
    {
      error: {
        code: 503,
        status: 'UNAVAILABLE',
        message: 'A2A API key is not configured on this server.',
        details: [],
      },
    },
    { status: 503, headers: { 'Content-Type': 'application/a2a+json' } },
  );
}

/** Returns a rejection Response, or undefined when the request may proceed. */
export function requireA2aAuth(c: Context): Response | undefined {
  const expected = readA2aApiKey();
  if (!expected) return a2aNotConfiguredResponse();

  const token = bearerToken(c);
  if (!token || token !== expected) return a2aUnauthorizedResponse();
  return undefined;
}
