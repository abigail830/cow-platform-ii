-- paddleocr-doc-parse: use Baidu Cloud PaddleOCR-VL API (no local paddleocr / VLM).

UPDATE "app_pipeline_configs"
SET
	"description" = 'Parse via Baidu Cloud PaddleOCR-VL API (paddle-vl-parser). Alias of baidu-doc-parse flow.',
	"command_template" = 'openkms-cli pipeline run-async --job-id {job_id} --page-index-strategy baidu-layouts',
	"updated_at" = now()
WHERE "pipeline_name" = 'paddleocr-doc-parse';
--> statement-breakpoint
UPDATE "app_pipeline_jobs"
SET "provider" = 'baidu'
WHERE "provider" = 'paddle';
