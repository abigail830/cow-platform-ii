import { createMiddleware } from 'hono/factory';

function readCliBasicCredentials(): { user: string; password: string } | null {
  const user = process.env.OPENKMS_CLI_BASIC_USER?.trim();
  const password = process.env.OPENKMS_CLI_BASIC_PASSWORD;
  if (!user || !password) return null;
  return { user, password };
}

/** Protect internal worker/CLI APIs with HTTP Basic (OPENKMS_CLI_BASIC_*). */
export const requireCliInternalAuth = createMiddleware(async (c, next) => {
  const expected = readCliBasicCredentials();
  if (!expected) {
    return c.json({ error: 'CLI internal API is not configured' }, 503);
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Basic ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let decoded = '';
  try {
    decoded = atob(authHeader.slice(6));
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const separator = decoded.indexOf(':');
  if (separator < 0) return c.json({ error: 'Unauthorized' }, 401);

  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  if (user !== expected.user || password !== expected.password) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});

export function cliInternalAuthHeader(): string | null {
  const creds = readCliBasicCredentials();
  if (!creds) return null;
  return `Basic ${Buffer.from(`${creds.user}:${creds.password}`).toString('base64')}`;
}
