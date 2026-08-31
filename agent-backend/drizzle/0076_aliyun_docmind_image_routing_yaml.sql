-- Add image_routing (classify before DocMind) to system aliyun-docmind-parse worker config.
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = $yaml$# Default worker config for aliyun-docmind-parse.
# docmind.llm_enhancement + enhancement_mode: VLM — Aliyun 大模型版 OCR/版面增强（更慢、按页计费更高）。

docmind:
  llm_enhancement: true
  enhancement_mode: VLM

# Image routing: classify printed vs handwritten before DocMind (handwritten/mixed/uncertain → VLM).
image_routing:
  enabled: true
  classify_model_name: "qwen3.7-plus"
  min_printed_confidence: 0.65

# After DocMind (printed images only), quality gate may replace markdown via vision model.
vision_fallback:
  enabled: true
  model_name: "qwen3.7-plus"
  min_text_length: 40
  suspicious_ratio: 0.08
  system_prompt: |
    Transcribe all text in the image verbatim.
    Mark illegible characters as [unclear]. Do not guess or invent content.

page_index:
  strategy: aliyun-layouts

async:
  poll_interval_seconds: 8
  max_wait_seconds: 600

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
WHERE "pipeline_name" = 'aliyun-docmind-parse'
  AND "is_system" = true;
