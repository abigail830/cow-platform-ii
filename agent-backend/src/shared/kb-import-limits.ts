/** Max markdown bytes accepted inline in a KB item PUT body.
 * Larger docs must pass markdown_s3_key so the server loads from S3 (no silent truncate).
 */
export const KB_IMPORT_MAX_MARKDOWN_BYTES = 4 * 1024 * 1024;

/** Max parsing_result JSON bytes before slimming. */
export const KB_IMPORT_MAX_PARSING_RESULT_BYTES = 4 * 1024 * 1024;
