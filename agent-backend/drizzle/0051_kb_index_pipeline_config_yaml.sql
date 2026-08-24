-- Seed default worker Config YAML for KB index pipelines that the API must parse on Vercel
-- (embedding model_name → model_config_id) before dispatching jobs to GitHub Actions.
-- GHA workers still use openkms-cli/workflows when job.config_yaml is null.
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = $yaml$# Default worker config for kb-rag-index.
# model_name = Models list bold name (app_model_configs.name), api_type=embeddings.
# Credentials via GET /internal-api/models/cli-params?model_name=…
# Do not put api_key / base_url / UUID model ids here.
#
# chunk.strategy — pick ONE of the three presets below (keep only one `chunk:` block active):
#   markdown_header  Split on # / ## / ### headings. No chunk_size / chunk_overlap.
#   paragraph        Split on blank-line paragraphs. Optional size knobs cap huge paragraphs.
#   fixed_size       Sliding window by character count. chunk_size / chunk_overlap required.

model_name: "qwen3-Embedding-8B"
dimensions: 4096

# --- Preset 1 (active): markdown_header ---
chunk:
  strategy: markdown_header

# --- Preset 2: paragraph (uncomment this block; comment out Preset 1) ---
# chunk:
#   strategy: paragraph
#   chunk_size: 8000
#   chunk_overlap: 50

# --- Preset 3: fixed_size (uncomment this block; comment out Preset 1) ---
# chunk:
#   strategy: fixed_size
#   chunk_size: 8000
#   chunk_overlap: 50
$yaml$,
  "updated_at" = NOW()
WHERE "pipeline_name" = 'kb-rag-index'
  AND "is_system" = true
  AND ("config_yaml" IS NULL OR btrim("config_yaml") = '');
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
  "config_yaml" = $yaml$# Default worker config for kb-faq-index.
# model_name = Models list bold name (app_model_configs.name), api_type=embeddings.
# Credentials via GET /internal-api/models/cli-params?model_name=…
# Do not put api_key / base_url / UUID model ids here.

model_name: "qwen3-Embedding-8B"
dimensions: 4096
$yaml$,
  "updated_at" = NOW()
WHERE "pipeline_name" = 'kb-faq-index'
  AND "is_system" = true
  AND ("config_yaml" IS NULL OR btrim("config_yaml") = '');
