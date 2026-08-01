import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DRIZZLE_DIR = join(import.meta.dirname, '..', 'drizzle');
const JOURNAL_PATH = join(DRIZZLE_DIR, 'meta', '_journal.json');

type Journal = {
  entries: Array<{ tag: string }>;
};

/** Ensure every numbered SQL file is registered in drizzle/meta/_journal.json. */
export function validateMigrations(): void {
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as Journal;
  const journalTags = new Set(journal.entries.map((entry) => entry.tag));

  const sqlTags = readdirSync(DRIZZLE_DIR)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .map((name) => name.replace(/\.sql$/, ''));

  const missingFromJournal = sqlTags.filter((tag) => !journalTags.has(tag));
  const missingSql = [...journalTags].filter(
    (tag) => /^\d{4}_/.test(tag) && !sqlTags.includes(tag),
  );

  const problems: string[] = [];
  if (missingFromJournal.length > 0) {
    problems.push(
      `SQL files not registered in drizzle/meta/_journal.json: ${missingFromJournal.join(', ')}`,
    );
  }
  if (missingSql.length > 0) {
    problems.push(`Journal entries missing SQL files: ${missingSql.join(', ')}`);
  }

  if (problems.length > 0) {
    throw new Error(
      [
        'Drizzle migration metadata is inconsistent.',
        ...problems,
        'Fix: run `npm run db:generate` after schema changes, commit both the .sql and journal updates, then `npm run db:migrate`.',
        'Do not apply schema changes directly to the database.',
      ].join('\n'),
    );
  }
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) {
  validateMigrations();
  console.log('Drizzle migration metadata OK.');
}
