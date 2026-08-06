export type ParsedDatabaseUrl = {
  type: 'postgres' | 'mysql';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
};

export type ParseDatabaseUrlResult = ParsedDatabaseUrl | { error: string };

const POSTGRES_SCHEMES = new Set(['postgres', 'postgresql']);
const MYSQL_SCHEMES = new Set(['mysql', 'mysql2']);

function inferSsl(url: URL, host: string): boolean {
  const sslmode = url.searchParams.get('sslmode')?.toLowerCase();
  if (sslmode === 'require' || sslmode === 'verify-ca' || sslmode === 'verify-full') return true;
  if (sslmode === 'disable' || sslmode === 'allow') return false;

  const ssl = url.searchParams.get('ssl')?.toLowerCase();
  if (ssl === 'true' || ssl === '1') return true;
  if (ssl === 'false' || ssl === '0') return false;

  const lowerHost = host.toLowerCase();
  if (lowerHost.includes('neon.tech') || lowerHost.includes('supabase.co')) return true;

  return false;
}

/** Parse a postgres/mysql connection URL into form fields (Neon, Vercel Postgres, etc.). */
export function parseDatabaseUrl(raw: string): ParseDatabaseUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'Empty connection URL' };

  let url: URL;
  try {
    url = new URL(trimmed.replace(/^postgresql:/i, 'postgres:'));
  } catch {
    return { error: 'Invalid connection URL' };
  }

  const scheme = url.protocol.replace(':', '').toLowerCase();
  let type: 'postgres' | 'mysql';
  if (POSTGRES_SCHEMES.has(scheme)) type = 'postgres';
  else if (MYSQL_SCHEMES.has(scheme)) type = 'mysql';
  else return { error: `Unsupported scheme "${scheme}"` };

  const host = url.hostname.trim();
  if (!host) return { error: 'Missing host' };

  const port = url.port ? Number(url.port) : type === 'postgres' ? 5432 : 3306;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { error: 'Invalid port' };
  }

  const username = decodeURIComponent(url.username);
  if (!username) return { error: 'Missing username' };

  const password = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0] ?? '');
  if (!database) return { error: 'Missing database name' };

  return {
    type,
    host,
    port,
    username,
    password,
    database,
    ssl: inferSsl(url, host),
  };
}

export function applyParsedDatabaseUrl(
  parsed: ParsedDatabaseUrl,
  expectedType: 'postgres' | 'mysql',
): ParsedDatabaseUrl | { error: string } {
  if (parsed.type !== expectedType) {
    return { error: `URL is for ${parsed.type}, but this form expects ${expectedType}` };
  }
  return parsed;
}
