UPDATE "app_eval_judge_scenarios"
SET
  "dimensions" = $json$[
    {
      "id": "completeness",
      "label": "Completeness",
      "scope": "variant",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "Evaluate whether this ASR transcript appears complete for a speech recording. Penalize obvious mid-sentence cutoffs, missing endings, or large unexplained gaps. Ignore minor disfluencies that are normal in speech. Use an integer score from 0 to 10 where 0 means clearly incomplete and 10 means appears complete. Explain your score in 1–2 sentences."
    },
    {
      "id": "readability",
      "label": "Readability",
      "scope": "variant",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "Evaluate readability of the transcript: punctuation, sentence boundaries, and paragraph structure appropriate for spoken content. Use an integer score from 0 to 10 where 0 means hard to read / wall of text and 10 means easy to read. Explain your score in 1–2 sentences."
    },
    {
      "id": "artifact_control",
      "label": "Artifact control",
      "scope": "variant",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "Evaluate whether the transcript avoids common ASR artifacts: excessive word repetition, gibberish tokens, unrelated insertions, or broken encoding. Use an integer score from 0 to 10 where 0 means heavy artifacts and 10 means clean output. Explain your score in 1–2 sentences."
    },
    {
      "id": "semantic_agreement",
      "label": "Semantic agreement",
      "scope": "pairwise",
      "kind": "geval_score",
      "weight": 1.5,
      "criteria": "Two ASR transcripts from the same audio are provided as INPUT (variant A) and ACTUAL_OUTPUT (variant B). Score how well they convey the same overall meaning. Use an integer score from 0 to 10 where 0 means they disagree on main content and 10 means they are semantically equivalent aside from wording differences. Explain your score in 1–2 sentences."
    },
    {
      "id": "relative_quality",
      "label": "Relative quality",
      "scope": "pairwise",
      "kind": "geval_winner",
      "weight": 1,
      "criteria": "Two ASR transcripts from the same audio are provided as INPUT (variant A) and ACTUAL_OUTPUT (variant B). Without any ground-truth reference, decide which transcript is overall more useful for a human reviewer. Reply with A, B, or TIE. Explain your decision in 1–2 sentences."
    }
  ]$json$::jsonb,
  "updated_at" = now()
WHERE "scenario_key" = 'asr_pipeline_compare_no_gt';
