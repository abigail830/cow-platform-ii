#!/usr/bin/env tsx
/**
 * Legacy one-time migration (documents/audio → unified document captures).
 * Data migration should already be applied; this script is kept as a no-op guard.
 */
console.info(
  'Knowledge capture migration is complete. Legacy audio tables are removed — no action needed.',
);
process.exit(0);
