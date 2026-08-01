# Knowledge bases (PageIndex)

PageIndex knowledge bases import parsed document artifacts from object storage into PostgreSQL for agent retrieval (page index trees, markdown, metadata).

RAG-type knowledge bases are created in the UI but import and embedding index are not implemented yet.

## Data model

| Table | Purpose |
|-------|---------|
| `app_knowledge_bases` | KB name, description, type (`page_index` \| `rag`) |
| `app_kb_items` | Per-document snapshot: path, metadata, page_index, markdown, parsing_result |
| `app_kb_import_jobs` | Async import job progress |

## Worker (isolated from document parse)

PageIndex knowledge bases always use the built-in `kb-pageindex-import` pipeline (Pipelines → PageIndex KB Import).

- CLI: `openkms-cli kb pageindex-import --job-id <uuid>`
- Local: `KB_PAGEINDEX_IMPORT_WORKER=spawn` (default on non-Vercel)
- Vercel: `KB_PAGEINDEX_IMPORT_WORKER=github_actions` + workflow `openkms-kb-pageindex-import.yml`
- Env: `GITHUB_KB_PAGEINDEX_IMPORT_WORKFLOW` (default `openkms-kb-pageindex-import.yml`)

Does **not** use `app_pipeline_jobs`, `openkms-pipeline.yml`, or `pipeline run-async`.

## API

- User: `GET/POST /api/knowledge-bases`, `PATCH/DELETE /api/knowledge-bases/:id`, `POST /api/knowledge-bases/:id/import`
- Internal: `GET/PATCH /internal-api/kb-pageindex-import-jobs/:id`
- Internal: `PUT /internal-api/knowledge-bases/:kbId/items/:documentId`

## Permissions

- `knowledge-management:knowledge-bases:read` / `write`
