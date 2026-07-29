-- Align Baidu pipeline with async submit → poll → finalize template (same as Aliyun).
-- PageIndex: markdown-headings (Baidu yields markdown; aliyun-layouts is Aliyun-only).
UPDATE "app_pipeline_configs"
SET
	"description" = 'Parse via Baidu Cloud paddle-vl-parser: async submit → poll → finalize. Page index uses markdown-headings strategy.',
	"command_template" = E'openkms-cli pipeline submit --job-id {job_id}\nopenkms-cli pipeline finalize --job-id {job_id} --page-index-strategy markdown-headings',
	"updated_at" = now()
WHERE "pipeline_name" = 'baidu-doc-parse';
