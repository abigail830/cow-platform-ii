# openkms-cli

Command-line tools for **document parsing** and **pipeline** steps. The openKMS worker runs this as a subprocess.

## Configuration

Set variables in **`.env`** (this package’s `.env`, then the current directory’s `.env`). Names and defaults are defined in **`openkms_cli/settings.py`** — each env var is explicit there. CLI flags override `.env` when you pass them.

Copy **`openkms-cli/.env.example`** and adjust. For auth against the API, match **`OPENKMS_AUTH_MODE`** with the backend (`oidc` vs `local`).

**Embeddings (kb-index):** With **`OPENKMS_API_URL`** and the same auth as other CLI calls, **`kb-index`** calls **`GET {OPENKMS_API_URL}/internal-api/models/kb-embedding-credentials?knowledge_base_id=…`** (same pattern as **`document-parse-defaults`**) and receives **`base_url`**, **`model_name`**, and **`api_key`**. There are **no** `--embedding-model-*` CLI flags. Optional **`OPENKMS_EMBEDDING_MODEL_*`** in this `.env` override those values when needed.

**Baidu Cloud (baidu-doc-parse / paddleocr-doc-parse):** Set **`OPENKMS_BAIDU_CLOUD_API_KEY`**, **`OPENKMS_BAIDU_CLOUD_SECRET_KEY`**, and **`OPENKMS_BAIDU_BOS_BUCKET`**. The CLI uploads to BOS, submits a **presigned `file_url`** to **paddle-vl-parser** (Baidu Cloud API — no local `paddleocr`). `paddleocr-doc-parse` is a deprecated alias of the same flow. Install: `pip install -e ".[baidu,pipeline]"`.

**Adobe PDF Services:** Office formats (**DOC/DOCX/PPT/PPTX/XLS/XLSX/TXT/RTF**) may be converted to PDF via **Adobe Create PDF** before Baidu upload. Set **`OPENKMS_ADOBE_CLIENT_ID`** and **`OPENKMS_ADOBE_CLIENT_SECRET`**.

## Install

```bash
cd openkms-cli
pip install -e .                    # CLI only
pip install -e ".[pipeline,baidu,aliyun,metadata]"   # platform pipelines
pip install -e ".[kb]"              # + knowledge-base indexing
```

Python **≥ 3.10**.

## Tests

```bash
cd openkms-cli
pip install -e ".[dev]"
pytest tests/
```

Covers **`backend_defaults`** merge / fetch behavior (mocked HTTP), **`parser`** restructuring plus small layout helpers (no Paddle install required), and **`parse_result`** schema validation against `tests/fixtures/document_parse_result_minimal.json`.

**Parse result schema:** `schemas/document_parse_result.schema.json` defines the canonical `result.json` shape. Pipelines validate output via `openkms_cli.parse_result.validate_parse_result`.

## Usage

**Parse** (local files → `parsed/{file_hash}/…`):

Supported inputs: **PDF**, **PNG/JPG/JPEG/WEBP/GIF/BMP/TIFF** (direct); **DOC/DOCX/PPT/PPTX/XLS/XLSX/TXT/RTF** (Adobe PDF Services → PDF, needs **`OPENKMS_ADOBE_*`** credentials). **EPUB** is not supported on paddle — use **`baidu-doc-parse`** (Baidu accepts EPUB natively; CLI converts EPUB via **mutool** only for Baidu upload).

```bash
openkms-cli parse run document.pdf -o ./parsed
openkms-cli parse run ./inputs/ -o ./parsed

# Baidu Cloud (no local VLM; needs OPENKMS_BAIDU_CLOUD_* in .env):
openkms-cli parse run document.pdf --method baidu-doc-parse -o ./parsed
```

**Pipeline** — list names, then run:

```bash
openkms-cli pipeline list
# Index a knowledge base (linked channel documents + linked wiki spaces).
# Set OPENKMS_API_URL and auth in openkms-cli/.env (see openkms_cli/settings.py).
openkms-cli pipeline run --pipeline-name kb-index --knowledge-base-id <KB_UUID> --api-url http://127.0.0.1:8102
```

Wiki content is pulled only for **wiki spaces already linked** to that KB (`GET /api/knowledge-bases/{id}/wiki-spaces`). Re-run the same command after adding or removing links.

```bash
openkms-cli pipeline run --input ./doc.pdf --s3-prefix <prefix>
# Baidu Cloud (no local VLM): stages on BOS presigned file_url, polls Baidu API
openkms-cli pipeline run --pipeline-name baidu-doc-parse --input ./doc.pdf --s3-prefix <prefix>
```

**Wiki** — upsert markdown pages and upload assets (requires API auth: OIDC client credentials or local HTTP Basic, same as pipeline metadata sync):

```bash
openkms-cli wiki put --space-id <uuid> --path guides/onboarding --file ./page.md
openkms-cli wiki sync --space-id <uuid> --dir ./my-wiki-root
openkms-cli wiki upload-file --space-id <uuid> --file ./diagram.png
```

Doc-parse pipelines need S3 credentials in `.env` unless you use **`--skip-upload`** with a local **`--input`** file.

**Pipeline + channel metadata extraction:** If `--extract-metadata` runs and the extraction LLM returns an error (e.g. HTTP 502), the CLI prints a warning and **still exits successfully** after a successful parse so the worker can mark the document completed; use **Extract** in the UI when the model is available.

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

This repository includes **`.github/workflows/openkms-pipeline.yml`** for running `pipeline run-async` on GitHub-hosted runners (alternative to the backend spawning a local subprocess).

**Manual test:** GitHub → Actions → OpenKMS Pipeline → Run workflow → enter `job_id` from `app_pipeline_jobs`.

**Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| `OPENKMS_API_URL` | Public backend URL (not localhost) |
| `OPENKMS_CLI_BASIC_USER` / `OPENKMS_CLI_BASIC_PASSWORD` | Internal API auth |
| `AWS_*` | S3 / OSS for document artifacts |
| `OPENKMS_DOCMIND_ENDPOINT` | Aliyun Document Mind |

**Caching:** `uv` package cache + `.venv` cache keyed on `uv.lock`. First run installs deps (~1–3 min); later runs typically finish install in under a minute when the lockfile is unchanged.

**Backend trigger (later):** `POST https://api.github.com/repos/abigail830/openkms-cli/actions/workflows/openkms-pipeline.yml/dispatches` with `inputs.job_id`.
