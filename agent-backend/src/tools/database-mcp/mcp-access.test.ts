import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATASOURCE_ID_HEADER } from './constants.ts';
import { resolveDatabaseMcpAccess } from './mcp-access.ts';
import type { UserDatasource } from './types.ts';

const postgresSource: UserDatasource = {
  id: 'ds-1',
  createdBy: 'user-a',
  name: 'analytics',
  displayTitle: null,
  type: 'postgres',
  host: 'db.example.com',
  port: 5432,
  username: 'reader',
  database: 'app',
  password: 'secret',
  ssl: true,
  readonly: true,
  maxRows: 100,
  statementTimeoutMs: 30_000,
};

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/mcp/postgres', { headers });
}

test('resolveDatabaseMcpAccess rejects unauthenticated requests', async () => {
  const result = await resolveDatabaseMcpAccess(requestWithHeaders({}), 'postgres', {
    resolveUser: async () => null,
    getSource: async () => postgresSource,
  });
  assert.equal(result.kind, 'unauthorized');
});

test('resolveDatabaseMcpAccess requires datasource header', async () => {
  const result = await resolveDatabaseMcpAccess(requestWithHeaders({}), 'postgres', {
    resolveUser: async () => ({ id: 'user-a' }),
    getSource: async () => postgresSource,
  });
  assert.equal(result.kind, 'missing_datasource_id');
});

test('resolveDatabaseMcpAccess enforces owner scope', async () => {
  const result = await resolveDatabaseMcpAccess(
    requestWithHeaders({ [DATASOURCE_ID_HEADER]: 'ds-other' }),
    'postgres',
    {
      resolveUser: async () => ({ id: 'user-b' }),
      getSource: async () => null,
    },
  );
  assert.equal(result.kind, 'not_found');
});

test('resolveDatabaseMcpAccess rejects engine mismatch', async () => {
  const result = await resolveDatabaseMcpAccess(
    requestWithHeaders({ [DATASOURCE_ID_HEADER]: 'ds-1' }),
    'mysql',
    {
      resolveUser: async () => ({ id: 'user-a' }),
      getSource: async () => postgresSource,
    },
  );
  assert.deepEqual(result, {
    kind: 'type_mismatch',
    expected: 'mysql',
    actual: 'postgres',
  });
});

test('resolveDatabaseMcpAccess allows owned datasource', async () => {
  const result = await resolveDatabaseMcpAccess(
    requestWithHeaders({ [DATASOURCE_ID_HEADER]: 'ds-1' }),
    'postgres',
    {
      resolveUser: async () => ({ id: 'user-a' }),
      getSource: async (id, userId) =>
        id === 'ds-1' && userId === 'user-a' ? postgresSource : null,
    },
  );
  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') {
    assert.equal(result.source.id, 'ds-1');
    assert.equal(result.user.id, 'user-a');
  }
});
