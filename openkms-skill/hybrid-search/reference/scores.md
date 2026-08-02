# Retrieval scores

Each result may include `debug` with intermediate scores:

| Field | Meaning |
|-------|---------|
| `dense_score` | Vector similarity (embedding recall) |
| `lexical_score` | BM25 lexical match |
| `rrf_score` | Reciprocal rank fusion combined rank score |
| `score` (top-level) | Final score after rerank (orange in UI); primary sort key |

When rerank is disabled, top-level `score` follows RRF ordering.
