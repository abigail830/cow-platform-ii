type PgErrorLike = { code?: string; message?: string };

export function formatEvalDatasetDbError(error: unknown): string {
  if (!(error instanceof Error)) return 'Database error';

  const cause = error.cause as PgErrorLike | undefined;
  const pgCode = cause?.code;
  if (pgCode === '23505') return 'This file is already in the dataset';
  if (pgCode === '23503') return 'Upload could not be saved (invalid user reference)';
  if (pgCode === '42P01') return 'Evaluation dataset tables are missing; run database migrations';

  if (error.message.startsWith('Failed query:')) {
    return cause?.message ?? 'Database error while saving file';
  }

  return error.message;
}
