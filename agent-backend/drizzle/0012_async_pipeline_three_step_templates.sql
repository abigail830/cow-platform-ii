-- Async cloud pipelines: 3 template steps (submit → finalize → extract-metadata).
-- PageIndex: baidu-layouts (Baidu pages[].layouts) / aliyun-layouts (Aliyun layout API).
UPDATE "app_pipeline_configs"
SET
	"description" = 'Parse via Baidu Cloud paddle-vl-parser: submit → poll → finalize → extract-metadata. Page index uses baidu-layouts.',
	"command_template" = E'openkms-cli pipeline submit --job-id {job_id}\nopenkms-cli pipeline finalize --job-id {job_id} --page-index-strategy baidu-layouts\nopenkms-cli pipeline extract-metadata --job-id {job_id}',
	"updated_at" = now()
WHERE "pipeline_name" = 'baidu-doc-parse';
--> statement-breakpoint
UPDATE "app_pipeline_configs"
SET
	"description" = 'Parse via Aliyun Document Mind (大模型版): submit → poll → finalize → extract-metadata. Page index uses aliyun-layouts.',
	"command_template" = E'openkms-cli pipeline submit --job-id {job_id}\nopenkms-cli pipeline finalize --job-id {job_id} --page-index-strategy aliyun-layouts\nopenkms-cli pipeline extract-metadata --job-id {job_id}',
	"updated_at" = now()
WHERE "pipeline_name" = 'aliyun-docmind-parse';
