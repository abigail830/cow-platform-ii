# openkms-skill

Portable agent skills for querying OpenKMS / OKF knowledge bases.

## Auth

| Variable | Description |
|----------|-------------|
| `OPENKMS_API_URL` | Backend base URL (e.g. `http://127.0.0.1:8787`) |
| `OPENKMS_API_KEY` | Personal API key (`okf_…`) from **Settings → API keys** |

Host-specific injection (environment, platform sandbox, or UI-stored key) is described in each skill's `reference/auth.md`.

Scripts are **Node** (`.mjs`, Node 18+). Python is not used.

## Skills

| Skill | Path | Description |
|-------|------|-------------|
| hybrid-search | [hybrid-search/](hybrid-search/) | Cross-KB dense + BM25 + RRF hybrid retrieval |

## Using outside the OKF platform

1. Set `OPENKMS_API_URL` and `OPENKMS_API_KEY` in the host environment.
2. Install the skill directory per your agent host's skill mechanism.
3. From the skill root, run `node scripts/list_knowledge_bases.mjs` and `node scripts/hybrid_search.mjs`.
