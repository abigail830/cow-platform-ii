-- paddleocr-doc-parse: platform VLM sync parse (not Baidu file parser SaaS).

UPDATE "app_pipeline_configs"
SET
	"description" = 'Parse via platform VLM (PaddleOCR-VL). Sync parse in CLI run-async; set model_name in workflow YAML.',
	"command_template" = 'openkms-cli pipeline run-async --job-id {job_id} --page-index-strategy markdown-headings',
	"updated_at" = now()
WHERE "pipeline_name" = 'paddleocr-doc-parse';
--> statement-breakpoint
UPDATE "app_pipeline_jobs"
SET "provider" = 'paddle'
WHERE "pipeline_name" = 'paddleocr-doc-parse' AND "provider" = 'baidu';
