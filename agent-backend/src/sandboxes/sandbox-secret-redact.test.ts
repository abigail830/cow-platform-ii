import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactSandboxSecrets } from './sandbox-secret-redact.ts';

describe('redactSandboxSecrets', () => {
  it('redacts okf API keys', () => {
    const input = 'Authorization: Bearer okf_abc123def456ghi789';
    assert.equal(redactSandboxSecrets(input), 'Authorization: Bearer okf_[REDACTED]');
  });

  it('redacts OPENKMS_API_KEY assignments but not probe shorthand', () => {
    assert.equal(
      redactSandboxSecrets('OPENKMS_API_KEY=okf_secretvalue123456'),
      'OPENKMS_API_KEY=[REDACTED]',
    );
    assert.equal(redactSandboxSecrets('OPENKMS_API_KEY=set'), 'OPENKMS_API_KEY=set');
  });

  it('redacts keys embedded in curl output', () => {
    const input = 'curl -H "Authorization: Bearer okf_livekey_abcdefghijklmnop"';
    assert.match(redactSandboxSecrets(input), /okf_\[REDACTED\]/);
    assert.doesNotMatch(redactSandboxSecrets(input), /okf_livekey/);
  });
});
