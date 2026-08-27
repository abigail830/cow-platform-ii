-- ASR pipeline compare: explicit 0–10 score bands per dimension (no ground truth).
UPDATE "app_eval_judge_scenarios"
SET
  "dimensions" = $json$[
    {
      "id": "completeness",
      "label": "Completeness",
      "scope": "variant",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "Evaluate whether this ASR transcript covers the full speech recording. Penalize mid-sentence cutoffs, missing endings, or large unexplained gaps. Ignore normal disfluencies (um, repeats). Assign an integer score from 0 to 10 only, using these bands: 0–2 = severely incomplete (large missing portions or abrupt loss of main content); 3–4 = noticeably incomplete (clear cutoffs or missing closing content); 5–6 = mostly complete (minor gaps, core narrative present); 7–8 = largely complete (full arc with small omissions only); 9–10 = complete (covers the recording start-to-finish). Explain your score in 1–2 sentences."
    },
    {
      "id": "readability",
      "label": "Readability",
      "scope": "variant",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "Evaluate transcript readability for a human reviewer: punctuation, sentence boundaries, and paragraph breaks appropriate for spoken content. Assign an integer score from 0 to 10 only, using these bands: 0–2 = unreadable wall of text; 3–4 = poor (minimal punctuation, run-on sentences dominate); 5–6 = fair (some structure but inconsistent breaks); 7–8 = good (clear sentences, reasonable paragraphs); 9–10 = excellent (easy to read as natural speech). Explain your score in 1–2 sentences."
    },
    {
      "id": "artifact_control",
      "label": "Artifact control",
      "scope": "variant",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "Evaluate ASR artifact level: excessive word repetition, hallucinated phrases, gibberish tokens, unrelated insertions, or encoding/symbol corruption. Assign an integer score from 0 to 10 only, using these bands: 0–2 = heavy artifacts throughout; 3–4 = frequent distracting artifacts; 5–6 = moderate artifacts (occasional loops or odd tokens); 7–8 = light artifacts (rare minor glitches); 9–10 = clean output. Explain your score in 1–2 sentences."
    },
    {
      "id": "semantic_agreement",
      "label": "Semantic agreement",
      "scope": "pairwise",
      "kind": "geval_score",
      "weight": 1.5,
      "criteria": "Two ASR transcripts of the same audio are provided as INPUT (variant A) and ACTUAL_OUTPUT (variant B). Score how well they convey the same overall meaning, facts, and conclusions. Assign an integer score from 0 to 10 only, using these bands: 0–2 = disagree on main content or facts; 3–4 = same topic but substantial semantic differences; 5–6 = partial agreement with notable omissions or conflicts; 7–8 = strong agreement (same meaning, minor ASR wording variance); 9–10 = semantically equivalent aside from wording/punctuation. Explain your score in 1–2 sentences."
    },
    {
      "id": "relative_quality",
      "label": "Relative quality",
      "scope": "pairwise",
      "kind": "geval_winner",
      "weight": 1,
      "criteria": "Two ASR transcripts of the same audio are provided as INPUT (variant A) and ACTUAL_OUTPUT (variant B). Without ground truth, decide which transcript is more useful for a human reviewer, weighing completeness, readability, artifact level, and factual clarity. Reply with exactly one of: A, B, or TIE. Use TIE only when overall usefulness is genuinely equal. Explain your decision in 1–2 sentences."
    }
  ]$json$::jsonb,
  "updated_at" = now()
WHERE "scenario_key" = 'asr_pipeline_compare_no_gt';
