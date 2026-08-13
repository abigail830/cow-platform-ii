import assert from 'node:assert/strict';
import test from 'node:test';

const databaseUrl = process.env.DATABASE_URL;

test(
  'getBuiltinAgentUsageStats returns null for unknown agent',
  { skip: !databaseUrl },
  async () => {
    const { getBuiltinAgentUsageStats } = await import('./agent-stats.ts');
    const stats = await getBuiltinAgentUsageStats('00000000-0000-0000-0000-000000000000');
    assert.equal(stats, null);
  },
);
