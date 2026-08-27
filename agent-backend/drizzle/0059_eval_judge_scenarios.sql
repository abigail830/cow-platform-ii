CREATE TABLE IF NOT EXISTS "app_eval_judge_scenarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scenario_key" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "requires_ground_truth" boolean DEFAULT false NOT NULL,
  "min_variants" integer DEFAULT 2 NOT NULL,
  "dimensions" jsonb NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "app_eval_judge_scenarios_scenario_key_unique" UNIQUE("scenario_key")
);

CREATE INDEX IF NOT EXISTS "idx_eval_judge_scenarios_enabled"
  ON "app_eval_judge_scenarios" ("is_enabled", "scenario_key");

INSERT INTO "app_eval_judge_scenarios" (
  "scenario_key",
  "label",
  "description",
  "requires_ground_truth",
  "min_variants",
  "dimensions",
  "is_system",
  "is_enabled"
)
SELECT
  'asr_pipeline_compare_no_gt',
  'ASR pipeline compare (no ground truth)',
  'Reference-free LLM-as-judge dimensions for comparing two or more ASR transcripts on the same audio.',
  false,
  2,
  $json$[
    {
      "id": "completeness",
      "label": "Completeness",
      "scope": "variant",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "Evaluate whether this ASR transcript appears complete for a speech recording. Penalize obvious mid-sentence cutoffs, missing endings, or large unexplained gaps. Ignore minor disfluencies that are normal in speech. Score from 0 (clearly incomplete) to 1 (appears complete)."
    },
    {
      "id": "readability",
      "label": "Readability",
      "scope": "variant",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "Evaluate readability of the transcript: punctuation, sentence boundaries, and paragraph structure appropriate for spoken content. Score from 0 (hard to read / wall of text) to 1 (easy to read)."
    },
    {
      "id": "artifact_control",
      "label": "Artifact control",
      "scope": "variant",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "Evaluate whether the transcript avoids common ASR artifacts: excessive word repetition, gibberish tokens, unrelated insertions, or broken encoding. Score from 0 (heavy artifacts) to 1 (clean output)."
    },
    {
      "id": "semantic_agreement",
      "label": "Semantic agreement",
      "scope": "pairwise",
      "kind": "geval_score",
      "weight": 1.5,
      "criteria": "Two ASR transcripts from the same audio are provided as INPUT (variant A) and ACTUAL_OUTPUT (variant B). Score how well they convey the same overall meaning. Score 0 if they disagree on main content, 1 if they are semantically equivalent aside from wording differences."
    },
    {
      "id": "relative_quality",
      "label": "Relative quality",
      "scope": "pairwise",
      "kind": "geval_winner",
      "weight": 1,
      "criteria": "Two ASR transcripts from the same audio are provided as INPUT (variant A) and ACTUAL_OUTPUT (variant B). Without any ground-truth reference, decide which transcript is overall more useful for a human reviewer. Reply with A, B, or TIE plus brief justification."
    }
  ]$json$::jsonb,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "app_eval_judge_scenarios" WHERE "scenario_key" = 'asr_pipeline_compare_no_gt'
);

UPDATE "app_pipeline_configs"
SET "config_yaml" = $yaml$# Default worker config for eval Full-mode compare/judge (DeepEval GEval).
# model_name = Models list bold name (app_model_configs.name), api_type=chat-completions.
# scenario_id = Judge Dimensions scenario key (Admin → Judge Dimensions).
# Credentials via GET /internal-api/models/cli-params?model_name=…

model_name: "deepSeek-V4-Flash"
scenario_id: "asr_pipeline_compare_no_gt"
$yaml$
WHERE "pipeline_name" = 'eval-judge-compare';
