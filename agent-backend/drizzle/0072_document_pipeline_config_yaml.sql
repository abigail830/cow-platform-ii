-- Seed default worker Config YAML for system document-parse pipelines (Admin + job snapshots on Vercel).
-- Platform canonical source is DB; GHA workers use job.config_yaml snapshot (fallback: openkms-cli/workflows/).
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = $yaml$# Default worker config for aliyun-docmind-parse.
# docmind.llm_enhancement + enhancement_mode: VLM — Aliyun 大模型版 OCR/版面增强（更慢、按页计费更高）。

docmind:
  llm_enhancement: true
  enhancement_mode: VLM

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
  AND "is_system" = true
  AND ("config_yaml" IS NULL OR btrim("config_yaml") = '');
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = $yaml$# Default worker config for baidu-doc-parse (CLI packaged default).
# model_name = Models list bold name (app_model_configs.name), not provider id / UUID.

page_index:
  strategy: baidu-layouts

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
WHERE "pipeline_name" = 'baidu-doc-parse'
  AND "is_system" = true
  AND ("config_yaml" IS NULL OR btrim("config_yaml") = '');
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = $yaml$# Default worker config for paddleocr-doc-parse (platform VLM; async job, one run-async worker pass).
# model_name = Models list bold name (app_model_configs.name), api_type must be vlm.

model_name: "paddleocr-vl-1.5"

page_index:
  strategy: markdown-headings

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
WHERE "pipeline_name" = 'paddleocr-doc-parse'
  AND "is_system" = true
  AND ("config_yaml" IS NULL OR btrim("config_yaml") = '');
