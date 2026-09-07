import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertReadOnlySql } from './sql-guard.ts';

test('assertReadOnlySql allows SELECT', () => {
  assert.doesNotThrow(() => assertReadOnlySql('SELECT 1'));
  assert.doesNotThrow(() => assertReadOnlySql('WITH cte AS (SELECT 1) SELECT * FROM cte'));
});

test('assertReadOnlySql rejects writes and multi-statement', () => {
  assert.throws(() => assertReadOnlySql('DELETE FROM users'), /read-only/i);
  assert.throws(() => assertReadOnlySql('SELECT 1; DROP TABLE users'), /Multiple SQL/);
  assert.throws(() => assertReadOnlySql('INSERT INTO t VALUES (1)'), /read-only/i);
});
