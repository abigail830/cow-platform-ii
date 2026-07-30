-- Async pipeline: single run-async command (CLI owns submit + poll + finalize).
UPDATE "app_pipeline_configs"
SET
	"description" = 'Baidu async: CLI run-async (submit → poll → finalize in one process).',
	"command_template" = 'openkms-cli pipeline run-async --job-id {job_id} --page-index-strategy baidu-layouts',
	"updated_at" = now()
WHERE "pipeline_name" = 'baidu-doc-parse';
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
	"description" = 'Aliyun async: CLI run-async (submit → poll → finalize in one process).',
	"command_template" = 'openkms-cli pipeline run-async --job-id {job_id} --page-index-strategy aliyun-layouts',
	"updated_at" = now()
WHERE "pipeline_name" = 'aliyun-docmind-parse';
