UPDATE "app_pipeline_configs"
SET
	"description" = 'Parse via Aliyun Document Mind (大模型版): async submit → poll → finalize. Page index uses aliyun-layouts strategy.',
	"command_template" = E'openkms-cli pipeline submit --job-id {job_id}\nopenkms-cli pipeline finalize --job-id {job_id} --page-index-strategy aliyun-layouts',
	"updated_at" = now()
WHERE "pipeline_name" = 'aliyun-docmind-parse';
