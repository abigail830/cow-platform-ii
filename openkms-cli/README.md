# openkms-cli

Command-line tools for **document parsing** and **pipeline** steps. The openKMS worker runs this as a subprocess.

## Configuration

Set variables in **`.env`** (this package’s `.env`, then the current directory’s `.env`). Names and defaults are defined in **`openkms_cli/core/settings.py`**. CLI flags override `.env` when you pass them.

**Worker config YAML:** Packaged defaults live in **`workflows/{pipelineName}.yml`**. Admin → Pipelines can store an override in `config_yaml` (empty = use packaged default). Jobs snapshot that override (or null). YAML uses **`model_name`** = the bold name from Admin → Models (e.g. `deepSeek-V4-Flash`); the CLI resolves credentials once per job via **`GET /internal-api/models/cli-params?model_name=…`**. Do not put `api_key` / `base_url` / UUID model ids in YAML.

**Doc-parse YAML knobs:** `page_index.strategy` and `async.poll_interval_seconds` / `max_wait_seconds` are read from workflow YAML by default. CLI flags (`--page-index-strategy`, `--poll-interval`, `--max-wait`) override YAML when passed.

Copy **`openkms-cli/.env.example`** and adjust. For auth against the API, match **`OPENKMS_AUTH_MODE`** with the backend (`oidc` vs `local`).

**Baidu Cloud (`baidu-doc-parse`):** Set **`OPENKMS_BAIDU_CLOUD_API_KEY`**, **`OPENKMS_BAIDU_CLOUD_SECRET_KEY`**, and **`OPENKMS_BAIDU_BOS_BUCKET`**. The CLI uploads to BOS and submits a presigned `file_url` to Baidu’s **paddle-vl-parser** document-parse SaaS API. Install: `pip install -e ".[baidu,pipeline]"`.

**Platform VLM (`paddleocr-doc-parse`):** Set workflow YAML **`model_name`** to a VLM model in Admin → Models (e.g. `paddleocr-vl-1.5`). Credentials resolve via **`cli-params`** — no Baidu keys. Install: `pip install -e ".[parse,pipeline,metadata]"`.

**Adobe PDF Services:** Office formats may be converted to PDF via Adobe Create PDF before Baidu upload. Set **`OPENKMS_ADOBE_CLIENT_ID`** and **`OPENKMS_ADOBE_CLIENT_SECRET`**.

## Install

```bash
cd openkms-cli
pip install -e .                    # CLI only
pip install -e ".[pipeline,baidu,aliyun,metadata]"   # platform pipelines
pip install -e ".[kb]"              # knowledge-base workers
```

Python **≥ 3.10**.

## Tests

```bash
cd openkms-cli
pip install -e ".[dev]"
pytest tests/
```

Covers **workflow YAML** loading, **parser** helpers, and **`parse_result`** schema validation against `tests/fixtures/document_parse_result_minimal.json`.

**Parse result schema:** `schemas/document_parse_result.schema.json` defines the canonical `result.json` shape. Pipelines validate output via `openkms_cli.parse_result.validate_parse_result`.

## Usage

**Parse** (local files → `parsed/{file_hash}/…`):

Supported inputs: **PDF**, images (direct); **Office** (Adobe PDF Services → PDF); **EPUB** on Baidu path only (mutool).

```bash
openkms-cli parse run document.pdf -o ./parsed
openkms-cli parse run document.pdf --method baidu-doc-parse -o ./parsed
```

**Pipeline** — async document jobs (backend creates the job; CLI runs the worker):

```bash
openkms-cli pipeline list
openkms-cli pipeline run-async --job-id <JOB_UUID>
# Optional overrides (default from workflow YAML):
openkms-cli pipeline run-async --job-id <JOB_UUID> --page-index-strategy baidu-layouts
openkms-cli pipeline extract-metadata --job-id <JOB_UUID>   # parsed docs only
```

Knowledge-base workers use **`kb`** subcommands, e.g. `openkms-cli kb rag-index --job-id …`.

**Wiki** — upsert markdown pages and upload assets (requires API auth):

```bash
openkms-cli wiki put --space-id <uuid> --path guides/onboarding --file ./page.md
```

Async doc-parse jobs need S3 credentials in `.env`.

**Metadata extraction:** Configured in workflow YAML (`metadata_extract` section). Bundled into doc-parse pipelines by default; standalone **`metadata-extract`** pipeline runs only extraction on jobs at stage `parsed`. On LLM errors the CLI may warn and still exit successfully after a successful parse so the worker can mark the document completed.

**Module entry:**

```bash
python -m openkms_cli parse run /tmp/doc.pdf -o /tmp/out
```

## Backend integration

Pass paths and overrides as CLI args (or rely on `.env`). Example:

```python
subprocess.run(
    ["openkms-cli", "parse", "run", str(input_path), "--output", str(output_dir)],
    check=True,
)
```

## Extending the CLI

Add a Typer subapp under `openkms_cli/` and register it in **`app.py`**.

## GitHub Actions (remote worker)

This monorepo includes **`.github/workflows/openkms-pipeline.yml`** for running `pipeline run-async` on GitHub-hosted runners. The workflow installs **`pipeline`**, **`parse`** (paddleocr-doc-parse), **`baidu`**, **`aliyun`**, and **`metadata`** extras.

**Repository secrets:** `OPENKMS_API_URL`, `OPENKMS_CLI_BASIC_*`, `AWS_*`, `OPENKMS_DOCMIND_ENDPOINT` (Aliyun), `OPENKMS_BAIDU_*` (Baidu file parser) as needed. Paddle VLM uses **`model_name`** in job workflow YAML + platform Models (no Baidu secrets).
