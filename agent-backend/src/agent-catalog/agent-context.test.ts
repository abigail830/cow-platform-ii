import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { augmentInstructionsWithAgentContext, formatAgentDateTime } from './agent-context.ts';

describe('agent-context', () => {
  const fixed = new Date('2026-08-02T14:30:00.000Z');

  it('formats datetime in a timezone', () => {
    const formatted = formatAgentDateTime(fixed, 'Asia/Shanghai');
    assert.match(formatted, /^2026-08-02 22:30:00$/);
  });

  it('appends temporal block when enabled', () => {
    const result = augmentInstructionsWithAgentContext('Base prompt.', { temporal: true, timezone: 'UTC' }, fixed);
    assert.match(result, /^Base prompt\.\n\n## Temporal context/);
    assert.match(result, /Current date and time \(UTC\): 2026-08-02 14:30:00/);
  });

  it('leaves instructions unchanged when temporal is off', () => {
    assert.equal(augmentInstructionsWithAgentContext('Base prompt.', undefined, fixed), 'Base prompt.');
    assert.equal(
      augmentInstructionsWithAgentContext('Base prompt.', { temporal: false }, fixed),
      'Base prompt.',
    );
  });
});
