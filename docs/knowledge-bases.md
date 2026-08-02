# Knowledge bases

Two knowledge base types are supported:

- **PageIndex** — imports parsed document artifacts from object storage into PostgreSQL (`app_kb_items`) for tree-based retrieval.
- **RAG** — chunks `markdown.md` from object storage, embeds via a configured model, and stores vectors in `app_kb_chunks`.

## Data model

| Table | Purpose |
|-------|---------|
| `app_knowledge_bases` | KB name, description, type (`page_index` \| `rag`), `pipeline_id`, RAG settings (`embedding_model_config_id`, `embedding_dimensions`, `chunk_config`, `metadata_keys`) |
| `app_kb_items` | PageIndex only: per-document snapshot (path, metadata, page_index, markdown, parsing_result) |
| `app_kb_chunks` | RAG only: per-chunk content + pgvector embedding |
| `app_kb_import_jobs` | Async import/index job progress; `pipeline_id` snapshot per job |

## Pipeline binding

Creating a knowledge base automatically links `pipeline_id` to the system pipeline in `app_pipeline_configs`:

| KB type | `pipeline_name` | Default command | GHA workflow |
|---------|-----------------|-----------------|--------------|
| `page_index` | `kb-pageindex-import` | `openkms-cli kb pageindex-import --job-id {job_id}` | `openkms-kb-pageindex-import.yml` |
| `rag` | `kb-rag-index` | `openkms-cli kb rag-index --job-id {job_id}` | `openkms-kb-rag-index.yml` |

Import workers read the linked pipeline’s `command_template` and `workflow_file` instead of hard-coded CLI/GHA values.

Env overrides for workflow files: `GITHUB_KB_PAGEINDEX_IMPORT_WORKFLOW`, `GITHUB_KB_RAG_INDEX_WORKFLOW`.

## RAG configuration

RAG knowledge bases require an **embedding model** (Admin → Models, `api_type = embeddings`) before import.

Settings on the RAG detail page:

- `embedding_model_config_id` — required for import
- `embedding_dimensions` — default `1024`
- `chunk_config` — `strategy` (`markdown_header` \| `paragraph` \| `fixed_size`), `chunk_size`, `chunk_overlap`
- `metadata_keys` — document metadata fields copied into each chunk

Changing embedding model, dimensions, or chunk config requires re-indexing affected documents.

## Workers (isolated from document parse)

- CLI args are derived from the linked pipeline `command_template`
- Local: `KB_PAGEINDEX_IMPORT_WORKER=spawn` (default on non-Vercel) — shared runner for PageIndex and RAG KB jobs
- Vercel: `KB_PAGEINDEX_IMPORT_WORKER=github_actions`

Does **not** use `app_pipeline_jobs` or `openkms-pipeline.yml`.

## API

**User**

- `GET/POST /api/knowledge-bases`, `PATCH/DELETE /api/knowledge-bases/:id`
- PageIndex: `GET /api/knowledge-bases/:id/items`, `POST /api/knowledge-bases/:id/import`
- RAG: `GET /api/knowledge-bases/:id/indexed-documents`, `DELETE /api/knowledge-bases/:id/documents/:documentId/chunks`, `POST /api/knowledge-bases/:id/import`

**Internal (CLI)**

- `GET/PATCH /internal-api/kb-import-jobs/:id` (alias of `kb-pageindex-import-jobs`)
- PageIndex: `PUT /internal-api/knowledge-bases/:kbId/items/:documentId`
- RAG: `GET /internal-api/knowledge-bases/:kbId`, `POST /internal-api/knowledge-bases/:kbId/chunks/batch`, `DELETE /internal-api/knowledge-bases/:kbId/documents/:documentId/chunks`
- `GET /internal-api/models/kb-embedding-credentials?knowledge_base_id=`

## Permissions

- `knowledge-management:knowledge-bases:read` / `write`

## Verify

```bash
cd agent-backend
npm run db:migrate
npm test
npm run verify:knowledge-bases   # requires backend on SMOKE_BASE_URL (default localhost:8787)
```

```bash
cd openkms-cli
uv run pytest tests/test_kb_indexer.py
```
