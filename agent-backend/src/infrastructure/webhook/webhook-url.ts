const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'metadata.google.internal']);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** Reject non-https and loopback / RFC1918 / link-local / metadata targets. */
export function assertSafeWebhookUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('webhook_url is required');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('webhook_url is invalid');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('webhook_url must be https');
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost')) {
    throw new Error('webhook_url host is not allowed');
  }
  if (isPrivateIpv4(host) || host.startsWith('fd') || host.startsWith('fe80')) {
    throw new Error('webhook_url host is not allowed');
  }
  return parsed.toString();
}
