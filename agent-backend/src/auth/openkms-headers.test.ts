import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENKMS_API_KEY_HEADER,
  buildOpenKmsSandboxEnv,
  readOpenKmsApiKeyHeader,
  resolveOpenKmsApiUrl,
} from './openkms-headers.ts';

describe('openkms-headers', () => {
  it('readOpenKmsApiKeyHeader reads custom header', () => {
    const request = new Request('https://app.example.com/api/agents/foo', {
      headers: { [OPENKMS_API_KEY_HEADER]: 'okf_testkey1234567890abcdefghij' },
    });
    assert.equal(readOpenKmsApiKeyHeader(request), 'okf_testkey1234567890abcdefghij');
  });

  it('buildOpenKmsSandboxEnv includes api url and optional key', () => {
    const request = new Request('https://app.example.com/api/agents/foo', {
      headers: { [OPENKMS_API_KEY_HEADER]: 'okf_abc' },
    });
    assert.deepEqual(buildOpenKmsSandboxEnv(request), {
      OPENKMS_API_URL: 'https://app.example.com',
      OPENKMS_API_KEY: 'okf_abc',
    });
  });

  it('resolveOpenKmsApiUrl prefers OPENKMS_API_URL env', () => {
    const prev = process.env.OPENKMS_API_URL;
    process.env.OPENKMS_API_URL = 'https://configured.example/';
    try {
      assert.equal(
        resolveOpenKmsApiUrl(new Request('https://ignored.example/x')),
        'https://configured.example',
      );
    } finally {
      if (prev === undefined) delete process.env.OPENKMS_API_URL;
      else process.env.OPENKMS_API_URL = prev;
    }
  });
});
