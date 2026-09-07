const FORBIDDEN_PATTERN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|EXECUTE|MERGE|REPLACE|INTO\s+OUTFILE|LOAD\s+DATA)\b/i;

const ALLOWED_START =
  /^(SELECT|WITH|SHOW|EXPLAIN|DESCRIBE|DESC)\b/i;

export function assertReadOnlySql(sql: string): void {
  const trimmed = sql.trim();
  if (!trimmed) throw new Error('SQL is required');
  if (trimmed.includes(';')) {
    throw new Error('Multiple SQL statements are not allowed');
  }
  if (!ALLOWED_START.test(trimmed)) {
    throw new Error('Only read-only queries (SELECT, WITH, SHOW, EXPLAIN, DESCRIBE) are allowed');
  }
  if (FORBIDDEN_PATTERN.test(trimmed)) {
    throw new Error('Write or DDL statements are not allowed');
  }
}
