import './load-env.ts';
import { pathToFileURL } from 'node:url';
import { closePool } from '../src/db/pool.ts';
import {
  migrateKnowledgeToCaptures,
  type KnowledgeCaptureMigrationStats,
} from '../src/services/documents/knowledge-capture-migration.ts';

function printStats(stats: KnowledgeCaptureMigrationStats, dryRun: boolean) {
  const prefix = dryRun ? '[dry-run] ' : '';
  console.log(`${prefix}Knowledge capture migration complete:`);
  console.log(`  document channels mapped: ${stats.documentChannelsMapped}`);
  console.log(`  document channels created: ${stats.documentChannelsCreated}`);
  console.log(`  legacy documents migrated: ${stats.legacyDocumentsMigrated}`);
  console.log(`  shadow documents linked: ${stats.shadowDocumentsLinked}`);
  console.log(`  audio captures migrated: ${stats.audioCapturesMigrated}`);
  console.log(`  audio segments migrated: ${stats.audioSegmentsMigrated}`);
  console.log(`  standalone audios migrated: ${stats.standaloneAudiosMigrated}`);
  console.log(`  document pipeline jobs relinked: ${stats.documentPipelineJobsRelinked}`);
  console.log(`  audio pipeline jobs relinked: ${stats.audioPipelineJobsRelinked}`);
  console.log(`  post-process jobs migrated: ${stats.postProcessJobsMigrated}`);
  console.log(`  hotword links copied: ${stats.hotwordLinksCopied}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log('Running knowledge capture migration in dry-run mode (no writes).');
  } else {
    console.log('Running knowledge capture migration…');
  }

  const stats = await migrateKnowledgeToCaptures({ dryRun });
  printStats(stats, dryRun);
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
