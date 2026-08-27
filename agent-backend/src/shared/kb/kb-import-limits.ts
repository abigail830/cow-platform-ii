/** Max markdown bytes accepted inline in a KB item PUT body.
 * Larger docs pass markdown_s3_key. Local/workers may load that key from OSS;
 * Vercel must not GET OSS — it skips the body and records markdown_s3_skipped_serverless.
 */
export const KB_IMPORT_MAX_MARKDOWN_BYTES = 4 * 1024 * 1024;

/** Max parsing_result JSON bytes before slimming. */
export const KB_IMPORT_MAX_PARSING_RESULT_BYTES = 4 * 1024 * 1024;
