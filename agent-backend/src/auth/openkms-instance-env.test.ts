import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOpenKmsEnvForInstance,
  rememberOpenKmsApiKeyForInstance,
  resetOpenKmsInstanceEnvForTests,
} from './openkms-instance-env.ts';
import { OPENKMS_API_KEY_HEADER } from './openkms-headers.ts';

describe('openkms-instance-env', () => {
  it('stores api key per instance for later submissions', () => {
    resetOpenKmsInstanceEnvForTests();
    const request = new Request('https://app.example/agents/kb-qa/user--conv', {
      headers: { [OPENKMS_API_KEY_HEADER]: 'okf_test_instance_key_1234567890' },
    });
    rememberOpenKmsApiKeyForInstance('user--conv', request);

    const env = buildOpenKmsEnvForInstance('user--conv');
    assert.equal(env.OPENKMS_API_KEY, 'okf_test_instance_key_1234567890');
    assert.ok(env.OPENKMS_API_URL);
  });
});
