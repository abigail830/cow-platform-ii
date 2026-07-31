import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToolPackRef, toolPacksSchema } from './tool-pack-schema.ts';
import { parseOkfBundleRef } from '../shared/okf-bundle-ref.ts';

test('parseOkfBundleRef recognizes ${ENV} refs', () => {
  assert.deepEqual(parseOkfBundleRef('${OKF_BUNDLE_PATH}'), {
    kind: 'env',
    envVar: 'OKF_BUNDLE_PATH',
  });
});

test('parseOkfBundleRef treats unbraced values as literal paths', () => {
  assert.deepEqual(parseOkfBundleRef('../my-bundle'), {
    kind: 'path',
    path: '../my-bundle',
  });
});

test('normalizeToolPackRef defaults okf shorthand to ${OKF_BUNDLE_PATH}', () => {
  assert.deepEqual(normalizeToolPackRef('okf'), {
    name: 'okf',
    bundle: { kind: 'env', envVar: 'OKF_BUNDLE_PATH' },
  });
});

test('toolPacksSchema parses explicit okf bundle env ref', () => {
  assert.deepEqual(
    toolPacksSchema.parse([{ name: 'okf', bundle: '${OTHER_BUNDLE_PATH}' }])[0],
    { name: 'okf', bundle: { kind: 'env', envVar: 'OTHER_BUNDLE_PATH' } },
  );
});
