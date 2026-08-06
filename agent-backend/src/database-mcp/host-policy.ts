const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** Reject hosts that could target cloud metadata or loopback from Vercel. */
export function assertAllowedDatasourceHost(host: string): void {
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) throw new Error('Database host is required');
  if (BLOCKED_HOSTNAMES.has(trimmed)) {
    throw new Error(`Database host "${host}" is not allowed`);
  }
  if (trimmed === '::1' || trimmed.startsWith('fe80:') || trimmed.startsWith('fc00:')) {
    throw new Error(`Database host "${host}" is not allowed`);
  }
  if (isPrivateIpv4(trimmed)) {
    throw new Error(`Database host "${host}" is not allowed (private network)`);
  }
}
