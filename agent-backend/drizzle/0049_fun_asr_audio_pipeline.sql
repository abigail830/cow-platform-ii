INSERT INTO "app_pipeline_configs" (
	"name",
	"description",
	"pipeline_name",
	"command_template",
	"workflow_file",
	"is_enabled",
	"is_system"
)
SELECT
	'Aliyun Fun-ASR Transcribe',
	'Transcribe audio via DashScope Fun-ASR file transcription API (fun-asr).',
	'aliyun-fun-asr-transcribe',
	'openkms-cli audio-pipeline run-async --job-id {job_id}',
	'openkms-audio-transcribe.yml',
	true,
	true
WHERE NOT EXISTS (
	SELECT 1 FROM "app_pipeline_configs" WHERE "pipeline_name" = 'aliyun-fun-asr-transcribe'
);
