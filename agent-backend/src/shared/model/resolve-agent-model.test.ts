import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CATALOG_MODEL_PROFILE, LEGACY_MODEL_PROFILES, resolveModel } from './models.ts';
import { isLegacyModelProfile, resolveAgentModel, resolveAgentProfileName } from './resolve-agent-model.ts';

test('resolveAgentProfileName defaults to glm-4.7-flash', () => {
  assert.equal(resolveAgentProfileName({}), DEFAULT_CATALOG_MODEL_PROFILE);
  assert.equal(resolveAgentProfileName({ profile: 'openai' }), 'openai');
});

test('isLegacyModelProfile distinguishes env profiles from catalog names', () => {
  assert.equal(isLegacyModelProfile('azure-openai'), true);
  assert.equal(isLegacyModelProfile(DEFAULT_CATALOG_MODEL_PROFILE), false);
  assert.equal(LEGACY_MODEL_PROFILES.has('azure-openai'), true);
});

test('resolveAgentModel falls back to legacy profile when configName is absent', async () => {
  const model = await resolveAgentModel({ profile: 'openai' });
  assert.equal(model, resolveModel('openai'));
});
