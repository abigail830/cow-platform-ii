import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadAgentSpec } from '../../agent-catalog/discover.ts';
import { agentCatalogRoot } from '../../agent-catalog/paths.ts';
import { join } from 'node:path';
import { a2aChannelName, isA2aEnabledForSpec } from './config.ts';
import { buildAgentCardForSpec } from './build-agent-card.ts';
import { extractTextFromA2aMessage } from './extract-text.ts';
import { Message, Part, Role } from '@a2a-js/sdk';

describe('a2a config', () => {
  it('detects enabled agents from yaml', () => {
    const spec = loadAgentSpec(join(agentCatalogRoot(), 'content-studio'));
    assert.equal(isA2aEnabledForSpec(spec), true);
    assert.equal(a2aChannelName(spec.id), 'content-studio-a2a');
  });
});

describe('buildAgentCardForSpec', () => {
  it('builds a card with HTTP+JSON interface and skills', () => {
    const spec = loadAgentSpec(join(agentCatalogRoot(), 'smart-proposal'));
    const card = buildAgentCardForSpec(spec);
    assert.equal(card.name, spec.displayName);
    assert.ok(card.supportedInterfaces.length >= 1);
    assert.equal(card.supportedInterfaces[0]?.protocolBinding, 'HTTP+JSON');
    assert.ok(card.skills.length >= 1);
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
        Part.fromJSON({ content: { text: 'hello' }, mediaType: 'text/plain' }),
        Part.fromJSON({ content: { text: 'world' }, mediaType: 'text/plain' }),
      ],
      metadata: undefined,
      extensions: [],
      referenceTaskIds: [],
    });
    assert.equal(extractTextFromA2aMessage(message), 'hello\nworld');
  });
});
