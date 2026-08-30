-- GT ASR judge: mixed-aware WER + CER (reference combined-dataset tokenization).
UPDATE "app_eval_judge_scenarios"
SET
  "dimensions" = $json$[
    {
      "id": "wer",
      "label": "Word Error Rate (WER)",
      "scope": "variant_vs_gt",
      "kind": "wer_score",
      "weight": 1.5,
      "criteria": "Deterministic Word Error Rate (WER) between EXPECTED_OUTPUT (reference) and ACTUAL_OUTPUT (ASR transcript). English words and digits are one token each; each CJK character is one token (supports mixed Chinese/English). Punctuation and spaces are ignored; lower is better."
    },
    {
      "id": "cer",
      "label": "Character Error Rate (CER)",
      "scope": "variant_vs_gt",
      "kind": "cer_score",
      "weight": 1.5,
      "criteria": "Deterministic Character Error Rate (CER) between EXPECTED_OUTPUT (reference) and ACTUAL_OUTPUT (ASR transcript). Compares lowercase alphanumeric and CJK characters only (supports mixed Chinese/English). Punctuation and spaces are ignored; lower is better."
    },
    {
      "id": "semantic_fidelity",
      "label": "Semantic fidelity",
      "scope": "variant_vs_gt",
      "kind": "geval_score",
      "weight": 1.5,
      "criteria": "A human reference transcript is provided as EXPECTED_OUTPUT and an ASR transcript as ACTUAL_OUTPUT. Score how well the ASR output preserves the meaning, facts, and conclusions of the reference. Assign an integer score from 0 to 10 only, using these bands: 0–2 = wrong topic or major factual errors vs reference; 3–4 = same topic but substantial meaning loss or conflicts; 5–6 = partial fidelity with notable omissions or additions; 7–8 = strong fidelity (same meaning, minor ASR wording variance); 9–10 = semantically equivalent aside from wording/punctuation. Explain your score in 1–2 sentences."
    },
    {
      "id": "entity_accuracy",
      "label": "Entity accuracy",
      "scope": "variant_vs_gt",
      "kind": "geval_score",
      "weight": 1.2,
      "criteria": "EXPECTED_OUTPUT is the human reference and ACTUAL_OUTPUT is the ASR transcript. Compare key entities only: proper nouns, numbers, dates, times, phone numbers, order IDs, brand names, and technical terms. Penalize any wrong, missing, or invented entity even when overall meaning seems close. Assign an integer score from 0 to 10 only, using these bands: 0–2 = multiple critical entity errors; 3–4 = at least one critical entity wrong or missing; 5–6 = minor entity issues or ambiguous substitutions; 7–8 = entities mostly correct with small formatting differences; 9–10 = all key entities match. Explain your score in 1–2 sentences."
    },
    {
      "id": "artifact_control",
      "label": "Artifact control",
      "scope": "variant_vs_gt",
      "kind": "geval_score",
      "weight": 1,
      "criteria": "EXPECTED_OUTPUT is the human reference and ACTUAL_OUTPUT is the ASR transcript. Evaluate ASR artifact level in ACTUAL_OUTPUT: excessive repetition, hallucinated phrases, gibberish, or unrelated insertions not supported by the reference meaning. Assign an integer score from 0 to 10 only, using these bands: 0–2 = heavy artifacts; 3–4 = frequent artifacts; 5–6 = moderate; 7–8 = light; 9–10 = clean. Explain your score in 1–2 sentences."
    }
  ]$json$::jsonb,
  "updated_at" = now()
WHERE "scenario_key" = 'asr_pipeline_compare_with_gt';
