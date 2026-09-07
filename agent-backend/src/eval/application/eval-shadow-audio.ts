export const EVAL_SHADOW_CHANNEL_NAME = 'Evaluation (datasets)';

/** Legacy shadow rows in app_audios (pre-0077). New eval jobs do not create these. */
export function isEvalShadowAudio(metadata: Record<string, unknown> | null | undefined): boolean {
  return Boolean(metadata && metadata.eval_shadow === true);
}
