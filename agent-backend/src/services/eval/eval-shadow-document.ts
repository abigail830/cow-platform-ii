export const EVAL_SHADOW_DOCUMENT_CHANNEL_NAME = 'Evaluation (datasets)';

/** Legacy shadow rows in app_documents (pre-0074). New eval jobs do not create these. */
export function isEvalShadowDocument(metadata: Record<string, unknown> | null | undefined): boolean {
  return Boolean(metadata && metadata.eval_shadow === true);
}
