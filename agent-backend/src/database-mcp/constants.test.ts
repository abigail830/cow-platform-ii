import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATASOURCE_ID_HEADER } from './constants.ts';

test('datasource header constant is lowercase for HTTP', () => {
  assert.equal(DATASOURCE_ID_HEADER, 'x-datasource-id');
});
