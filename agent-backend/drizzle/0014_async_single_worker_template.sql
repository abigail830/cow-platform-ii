-- Async pipeline: single worker command template (submit is fixed; worker runs finalize + page index + metadata).
UPDATE "app_pipeline_configs"
SET
	"description" = 'Baidu async: submit (fixed) → poll → finalize worker (parse + page index + metadata).',
	"command_template" = 'openkms-cli pipeline finalize --job-id {job_id} --page-index-strategy baidu-layouts',
	"updated_at" = now()
WHERE "pipeline_name" = 'baidu-doc-parse';
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
	"description" = 'Aliyun async: submit (fixed) → poll → finalize worker (parse + page index + metadata).',
	"command_template" = 'openkms-cli pipeline finalize --job-id {job_id} --page-index-strategy aliyun-layouts',
	"updated_at" = now()
WHERE "pipeline_name" = 'aliyun-docmind-parse';
