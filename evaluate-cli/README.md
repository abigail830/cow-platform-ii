# evaluate-cli

Evaluation workers for the OpenKMS platform. Sibling to [`openkms-cli`](../openkms-cli/).

## Scope

| Command | Phase | Purpose |
|---------|-------|---------|
| `evaluate-cli pipeline run-async` | 2 | ASR transcribe for eval run items (isolated OSS prefix) |
| `evaluate-cli judge run-async` | 3 | deepEval LLM-as-judge (planned) |

`openkms-cli` remains for document/audio library pipelines. **All evaluation-specific workers live here.**

## Setup

```bash
cd evaluate-cli
uv sync --extra dev
cp .env.example .env   # or symlink ../openkms-cli/.env
```

Install `openkms-cli` with pipeline + aliyun extras (ASR + OSS):

```bash
cd ../openkms-cli && uv sync --extra pipeline --extra aliyun
cd ../evaluate-cli && uv sync --extra dev
```

## Usage

```bash
# Local worker (backend dispatches this in dev)
evaluate-cli pipeline run-async --job-id <eval_run_item_uuid>

# Debug steps
evaluate-cli pipeline submit --job-id <uuid>
evaluate-cli pipeline poll --job-id <uuid>
```

Environment variables match `openkms-cli` (`OPENKMS_API_URL`, auth, OSS keys). See `openkms-cli/.env.example`.

## Backend integration

- Internal API: `GET/PATCH /internal-api/eval-pipeline/jobs/:id`
- Backend spawns `evaluate-cli` (env `EVALUATE_CLI_BIN`) or GitHub Actions workflow `evaluate-pipeline.yml`
