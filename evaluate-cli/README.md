# evaluate-cli

Evaluation workers for the OpenKMS platform. Sibling to [`openkms-cli`](../openkms-cli/).

## Scope

| Command | Phase | Purpose |
|---------|-------|---------|
| *(transcribe)* | 1 | **Uses `openkms-cli audio-pipeline`** — see `agent-backend/src/services/eval-audio-bridge.ts` |
| `evaluate-cli judge run-async` | 3 | deepEval LLM-as-judge (planned) |

Eval run **transcription** reuses the same audio pipeline worker (fun-asr / qwen3 configs) as the audio library. `evaluate-cli` is for **evaluation** (compare, judge), not ASR.

## Setup

```bash
cd evaluate-cli
uv sync --extra dev --extra pipeline --extra aliyun
cp .env.example .env   # or symlink ../openkms-cli/.env
```

## Backend integration

- Transcribe: `app_audio_pipeline_jobs` with `eval_run_item_id` → GHA `openkms-audio-transcribe.yml`
- Compare: `eval-run-compare.ts` (backend, `full` run mode)
- Legacy internal API `/internal-api/eval-pipeline/jobs` — deprecated for transcribe; kept for compatibility
