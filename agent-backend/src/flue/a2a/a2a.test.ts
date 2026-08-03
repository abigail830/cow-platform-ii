import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { loadAgentSpec } from '../../agent-catalog/discover.ts';
import { agentCatalogRoot } from '../../agent-catalog/paths.ts';
import { a2aChannelName, isA2aEnabledForSpec } from './config.ts';
import { buildAgentCardForSpec } from './build-agent-card.ts';
import { buildAgentA2aPublicInfo } from './public-info.ts';
import { extractTextFromA2aMessage } from './extract-text.ts';
import { Message, Role } from '@a2a-js/sdk';

describe('a2a config', () => {
  it('detects enabled agents from yaml', () => {
    const spec = loadAgentSpec(join(agentCatalogRoot(), 'content-studio'));
    assert.equal(isA2aEnabledForSpec(spec), true);
    assert.equal(a2aChannelName(spec.id), 'content-studio-a2a');
    assert.ok(spec.a2a?.skills?.length);
  });
});

describe('buildAgentCardForSpec', () => {
  it('builds a card with HTTP+JSON interface, streaming, and configured skills', () => {
    const spec = loadAgentSpec(join(agentCatalogRoot(), 'content-studio'));
    const card = buildAgentCardForSpec(spec);
    assert.equal(card.name, spec.displayName);
    assert.equal(card.capabilities?.streaming, true);
    assert.ok(card.supportedInterfaces.length >= 1);
    assert.equal(card.supportedInterfaces[0]?.protocolBinding, 'HTTP+JSON');
    assert.equal(card.skills.length, spec.a2a!.skills.length);
    assert.deepEqual(card.skills[0]?.tags, spec.a2a!.skills[0]!.tags);
    assert.ok(card.defaultOutputModes.includes('application/json'));
  });
});

describe('buildAgentA2aPublicInfo', () => {
  it('exposes channel URLs and configured skills for enabled agents', () => {
    const spec = loadAgentSpec(join(agentCatalogRoot(), 'kb-qa'));
    const info = buildAgentA2aPublicInfo(spec);
    assert.ok(info);
    assert.equal(info.channelName, 'kb-qa-a2a');
    assert.match(info.endpointUrl, /\/api\/channels\/kb-qa-a2a\/v1\/message:send$/);
    assert.match(info.agentCardUrl, /\/api\/channels\/kb-qa-a2a\/\.well-known\/agent-card\.json$/);
    assert.equal(info.skills.length, spec.a2a!.skills.length);
    assert.deepEqual(info.skills[0]?.tags, spec.a2a!.skills[0]!.tags);
  });
});

describe('extractTextFromA2aMessage', () => {
  it('joins text parts', () => {
    const message = Message.fromJSON({
      messageId: 'm1',
      contextId: 'c1',
      taskId: 't1',
      role: Role.ROLE_USER,
      parts: [
        { text: 'hello', mediaType: 'text/plain' },
        { text: 'world', mediaType: 'text/plain' },
      ],
      metadata: undefined,
      extensions: [],
      referenceTaskIds: [],
    });
    assert.equal(extractTextFromA2aMessage(message), 'hello\nworld');
  });
});
