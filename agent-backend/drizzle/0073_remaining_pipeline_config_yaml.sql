-- Seed remaining system pipeline config_yaml (DB canonical; agent-backend/pipeline-workflows removed).
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = $yaml$# Default worker config for aliyun-qwen-audio-transcribe pipeline.
# model_name = Models list bold name (app_model_configs.name), api_type=audio-asr.
# Credentials via GET /internal-api/models/cli-params?model_name=…

model_name: "qwen-audio-3.0-asr-flash-filetrans"

asr:
  enable_diarization: true
  # context_prompt: |
  #   Meeting about product planning. Participants: Alice, Bob.
$yaml$,
  "updated_at" = NOW()
WHERE "pipeline_name" = 'aliyun-qwen-audio-transcribe'
  AND "is_system" = true
  AND ("config_yaml" IS NULL OR btrim("config_yaml") = '');
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = $yaml$# Default worker config for aliyun-fun-asr-transcribe pipeline.
# model_name = Models list bold name (app_model_configs.name), api_type=audio-asr.
# Credentials via GET /internal-api/models/cli-params?model_name=…

model_name: "fun-asr"

asr:
  enable_diarization: true
  # language_hints: ["zh"]   # Fun-ASR supports only one hint
  # speaker_count: 3         # requires enable_diarization: true
$yaml$,
  "updated_at" = NOW()
WHERE "pipeline_name" = 'aliyun-fun-asr-transcribe'
  AND "is_system" = true
  AND ("config_yaml" IS NULL OR btrim("config_yaml") = '');
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = $yaml$# Default worker config for audio-capture-post-process pipeline.
# model_name = Models list bold name (app_model_configs.name), api_type=chat-completions.
# Credentials via GET /internal-api/models/cli-params?model_name=…
#
# segment_topics / classify / extract default to mode: llm (prompts below).
# Set mode: rules only for offline/debug without model access.

model_name: "deepSeek-V4-Flash"
temperature: 0.2

post_process:
  enable_merge_turns: true

  segment_topics:
    enabled: true
    mode: llm
    window_minutes: 12
    llm:
      system_prompt: |
        You segment a meeting transcript into coherent topics for knowledge extraction.
        Each topic must use only turn_id values from the input.
        Titles: concise (<= 12 words). Summaries: 1-2 sentences capturing the gist, not verbatim quotes.
        Prefer fewer, broader topics over many tiny fragments.
      user_prompt_template: |
        Capture: {title}
        Brief: {brief}

        Turn window ({window_index}/{window_count}):
        {turns_json}

        Return JSON only:
        {"topics":[{"title":"...","summary":"...","turn_ids":["s0_t001"]}]}

  chapters:
    enabled: true
    mode: one_per_topic

  classify:
    mode: llm
    confidence_threshold: 0.7
    recording_modes:
      - multi_party_discussion
      - structured_interview
      - presentation_qa
      - site_field_capture
      - solo_voice_note
      - general
    content_facets:
      - solution_design
      - progress_status
      - commercial_terms
      - risk_issue
      - decision_action
      - general_discussion
    llm:
      system_prompt: |
        You classify a meeting/audio capture for downstream knowledge extraction.
        Pick exactly one recording_mode from the allowed list.
        Respect the user-selected recording_mode hint when plausible.
        For each topic, assign one or more content_facets from the allowed list.
        Set needs_review=true when confidence < confidence_threshold.
      user_prompt_template: |
        Capture title: {title}
        Brief: {brief}
        Participants hint: {participants_hint}
        User-selected recording_mode hint: {recording_mode_hint}
        Audience metadata: {audience}
        Confidence threshold: {confidence_threshold}

        Allowed recording_mode values:
        {recording_modes}

        Allowed content_facets (multi-select per topic):
        {content_facets}

        Topics (summaries):
        {topics_json}

        Return JSON only:
        {
          "recording_mode": "...",
          "audience": "{audience}",
          "confidence": 0.0,
          "needs_review": false,
          "content_facets_by_topic": [
            {"topic_id": "topic_01", "content_facets": ["general_discussion"]}
          ]
        }

  extract:
    mode: llm
    llm:
      system_prompt: |
        You extract structured knowledge from one topic in a meeting/audio capture.
        Write concise factual bullets — NEVER paste long verbatim transcript spans.
        key_points: 3-6 distilled insights (decisions, facts, conclusions).
        action_items: explicit commitments only; include owner if stated.
        open_questions: unresolved questions explicitly raised.
        Use the same language as the source (Chinese or English).
      user_prompt_template: |
        Capture: {title}
        Recording mode: {recording_mode}
        Audience: {audience}

        Topic: {topic_title}
        Topic summary: {topic_summary}
        Relevant turns:
        {turns_text}

        Return JSON only:
        {
          "key_points": ["..."],
          "action_items": ["..."],
          "open_questions": ["..."]
        }

  synthesize_summary:
    enabled: true
    mode: llm
    llm:
      system_prompt: |
        You write a concise meeting summary document in Markdown for internal knowledge.
        Use the same language as the source material (Chinese or English).
        Structure: title (#), optional metadata bullets, short executive overview,
        then ## sections per topic with clear narrative prose (not raw transcript quotes).
        End with ## Action items and ## Open questions sections when applicable.
        Do not invent facts beyond the provided extractions.
      user_prompt_template: |
        Capture title: {title}
        Brief: {brief}
        Participants: {participants_hint}
        Recording mode: {recording_mode}
        Audience: {audience}

        Structured extractions (JSON):
        {extractions_json}

        Topic outlines (JSON):
        {topics_json}

        Write the full summary.md content only (Markdown, no code fences).

  enable_segment_topics: true
  enable_chapters: true
  enable_llm_structure: true
$yaml$,
  "updated_at" = NOW()
WHERE "pipeline_name" = 'audio-capture-post-process'
  AND "is_system" = true
  AND ("config_yaml" IS NULL OR btrim("config_yaml") = '');
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = $yaml$# Default worker config for metadata-extract (standalone metadata-only pipeline).
# Run on documents that are already parsed (job stage=parsed).
# model_name = Models list bold name (app_model_configs.name), api_type=chat-completions.
# Credentials via GET /internal-api/models/cli-params?model_name=…

metadata_extract:
  enabled: true
  model_name: "deepSeek-V4-Flash"
  temperature: 0.2
  system_prompt: |
    Extract metadata from the document content. Use null for unknown values.
  user_prompt_template: |
    Document:
    ---
    {markdown}
    ---

    Extract metadata from the above document.
  output_schema:
    type: object
    properties:
      abstract:
        type: string
        description: "One-sentence summary of the document's main content"
      author:
        type: string
        description: Primary author name
      publish_date:
        type: string
        format: date
        description: Publication date in YYYY-MM-DD format
      source:
        type: string
        description: Journal, conference, or publisher name
      tags:
        type: array
        items:
          type: string
        description: Keywords or tags
      categories:
        type: array
        items:
          type: string
        description: Subject categories
    required: []
$yaml$,
  "updated_at" = NOW()
WHERE "pipeline_name" = 'metadata-extract'
  AND "is_system" = true
  AND ("config_yaml" IS NULL OR btrim("config_yaml") = '');
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = $yaml$# Default worker config for kb-pageindex-import.

version: 1
$yaml$,
  "updated_at" = NOW()
WHERE "pipeline_name" = 'kb-pageindex-import'
  AND "is_system" = true
  AND ("config_yaml" IS NULL OR btrim("config_yaml") = '');
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = $yaml$# Default worker config for kb-faq-extract.
# model_name = Models list bold name (app_model_configs.name).

model_name: "deepSeek-V4-Flash"
temperature: 0.2
system_prompt: |
  You extract FAQ pairs from documents. Respond with valid JSON only.
user_prompt_template: |
  Extract FAQ question-and-answer pairs from the document markdown below. The source may be a proposal, report, or manual — infer useful Q&A a reader might ask (scope, pricing, timeline, deliverables, requirements). Return a JSON array of objects with "question" and "answer" fields. Include at least 3 pairs when the document has enough substance.

  Document: {document_name}

  {markdown}
$yaml$,
  "updated_at" = NOW()
WHERE "pipeline_name" = 'kb-faq-extract'
  AND "is_system" = true
  AND ("config_yaml" IS NULL OR btrim("config_yaml") = '');
