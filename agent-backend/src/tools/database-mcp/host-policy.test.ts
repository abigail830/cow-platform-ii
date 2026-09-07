import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowedDatasourceHost } from './host-policy.ts';

test('assertAllowedDatasourceHost blocks loopback and private networks', () => {
  assert.throws(() => assertAllowedDatasourceHost('localhost'), /not allowed/);
  assert.throws(() => assertAllowedDatasourceHost('127.0.0.1'), /not allowed/);
  assert.throws(() => assertAllowedDatasourceHost('10.0.0.5'), /private network/);
  assert.throws(() => assertAllowedDatasourceHost('169.254.169.254'), /not allowed/);
});

test('assertAllowedDatasourceHost allows public hostnames', () => {
  assert.doesNotThrow(() => assertAllowedDatasourceHost('db.example.com'));
});
