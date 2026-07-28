import 'dotenv/config';
import { getPool, closePool } from '../src/db/pool.ts';

/**
 * Drop legacy Flue 0.11 persistence tables so Flue 1.0 beta can recreate schema v4.
 * App tables (app_users, app_conversations, …) are untouched.
 */
const FLUE_TABLES = [
  'flue_event_stream_entries',
  'flue_event_streams',
  'flue_run_registry',
  'flue_runs',
  'flue_agent_dispatch_receipts',
  'flue_agent_session_deletions',
  'flue_agent_stream_chunks',
  'flue_agent_turn_journals',
  'flue_agent_submissions',
  'flue_session_entries',
  'flue_sessions',
  'flue_conversation_stream_batches',
  'flue_conversation_streams',
  'flue_schema_meta',
];

async function main() {
  const pool = getPool();
  console.log('Resetting Flue persistence tables (app tables unchanged)…\n');

  for (const table of FLUE_TABLES) {
    try {
      await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      console.log(`  dropped ${table}`);
    } catch (error) {
      console.warn(`  skip ${table}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log('\nDone. Restart agent-backend — Flue will migrate schema v4 on boot.');
  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
