import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDatabaseUrl } from './parse-database-url.ts';

describe('parseDatabaseUrl', () => {
  it('parses Neon-style postgres URL without explicit port', () => {
    const result = parseDatabaseUrl(
      'postgresql://neondb_owner:secret@ep-cool-darkness.us-east-2.aws.neon.tech/neondb?sslmode=require',
    );
    assert.ok(!('error' in result));
    assert.equal(result.type, 'postgres');
    assert.equal(result.host, 'ep-cool-darkness.us-east-2.aws.neon.tech');
    assert.equal(result.port, 5432);
    assert.equal(result.username, 'neondb_owner');
    assert.equal(result.password, 'secret');
    assert.equal(result.database, 'neondb');
    assert.equal(result.ssl, true);
  });

  it('parses mysql URL with explicit port', () => {
    const result = parseDatabaseUrl('mysql://root:pass@db.example.com:3307/app');
    assert.ok(!('error' in result));
    assert.equal(result.type, 'mysql');
    assert.equal(result.port, 3307);
    assert.equal(result.ssl, false);
  });

  it('rejects unsupported schemes', () => {
    const result = parseDatabaseUrl('redis://localhost:6379');
    assert.ok('error' in result);
  });
});
