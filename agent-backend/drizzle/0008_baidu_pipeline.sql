INSERT INTO "app_pipeline_configs" (
	"name",
	"description",
	"pipeline_name",
	"command_template",
	"is_enabled"
)
SELECT
	'Baidu Document Parse',
	'Parse documents via Baidu Cloud paddle-vl-parser API (no local LibreOffice/VLM). Requires Baidu API keys and BOS staging bucket in backend env.',
	'baidu-doc-parse',
	'openkms-cli pipeline run --pipeline-name baidu-doc-parse --input {input} --s3-prefix {s3_prefix} --document-id {document_id} --api-url {api_url}{extraction_args}',
	true
WHERE NOT EXISTS (
	SELECT 1 FROM "app_pipeline_configs" WHERE "pipeline_name" = 'baidu-doc-parse'
);
