---
name: knowledge-reindex
description: Use when re-indexing knowledge collections after source data changes — covers task knowledge:reindex, SOURCE options, embedding model selection, pre-checks for LLM availability, and failure mode handling. Critical: bge-m3 and voyage collections fail closed and must never be mixed.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# knowledge-reindex

Re-index knowledge collections in the mentolder platform.

---

## ⚠️ Embedding model isolation — read this first

The knowledge system uses **two separate embedding spaces** that are never interchangeable:

| Model | Service | Used for |
|---|---|---|
| `bge-m3` | TEI on `llm-gateway-embed:8081` | bge-m3 collections — requires GPU host running |
| `voyage-multilingual-2` | Voyage AI cloud API | voyage collections — requires `VOYAGE_API_KEY` |

**These fail closed.** If TEI is down, `bge-m3` collections return errors — they do not fall back to Voyage. If you see `MixedEmbeddingModelError`, a cross-model query was attempted somewhere; find and fix the collection config, not the query.

Never "fix" a model mismatch by switching which model a collection uses after it has been indexed — all existing vectors would need to be discarded and re-indexed.

---

## Phase 1: Pre-checks

### Check which collections exist and their models

```bash
task workspace:psql ENV=mentolder -- website <<'SQL'
SELECT collection_name, embedding_model, document_count, updated_at::date
FROM knowledge.collections
ORDER BY collection_name;
SQL
```

### Check LLM availability

For `bge-m3` collections:
```bash
# Is the GPU host reachable?
task workspace:logs ENV=mentolder -- llm-router | tail -20

# Direct TEI health check:
kubectl exec -n workspace --context mentolder \
  deployment/llm-gateway -- curl -s http://localhost:8081/health
```

For `voyage-multilingual-2` collections:
```bash
# Voyage uses an API key — check it's present in the SealedSecret
kubectl get secret workspace-secrets -n workspace --context mentolder \
  -o jsonpath='{.data.VOYAGE_API_KEY}' | base64 -d | wc -c
# Should return > 10 (non-empty key)
```

If the required embedding service is unavailable, **do not run reindex** — it will index 0 documents and silently destroy the existing collection content.

---

## Phase 2: Run reindex

```bash
# Reindex specific source type:
task knowledge:reindex ENV=mentolder SOURCE=prs
task knowledge:reindex ENV=mentolder SOURCE=markdown
task knowledge:reindex ENV=mentolder SOURCE=bugs
task knowledge:reindex ENV=mentolder SOURCE=all

# Apply to korczewski if that cluster also has a knowledge service:
task knowledge:reindex ENV=korczewski SOURCE=<source>
```

`SOURCE` values:
| Value | What it indexes |
|---|---|
| `prs` | GitHub PR descriptions and comments |
| `markdown` | Docs and markdown files in the repo |
| `bugs` | Ticket database (tickets.tickets) |
| `all` | All of the above |

---

## Phase 3: Verify

After reindex, check document counts increased (or stayed the same for unchanged sources):

```bash
task workspace:psql ENV=mentolder -- website <<'SQL'
SELECT collection_name, document_count, updated_at
FROM knowledge.collections
ORDER BY updated_at DESC;
SQL
```

Test a retrieval query via the coaching/knowledge assistant UI to confirm results are returning.

---

## Phase 4: Failure handling

### "0 documents indexed"

Cause: TEI or Voyage API was unavailable during index, so the collection was cleared but not repopulated.

```bash
# Immediately stop — do not commit the empty state
# 1. Restore from backup:
task workspace:restore -- website <latest-timestamp>

# 2. Fix the embedding service issue

# 3. Re-run reindex only after the service is healthy
```

### `MixedEmbeddingModelError`

A query is mixing vectors from `bge-m3` and `voyage` collections. This is a code bug — find the query that spans both collections and split it.

### TEI returns 503

GPU host is unreachable or Ollama is not running. SSH to the GPU host and check:
```bash
ssh <gpu-host-ip> "systemctl status ollama || docker ps | grep tei"
```

TEI (Text Embeddings Inference) runs as a Docker container on the GPU host. Restart if needed:
```bash
ssh <gpu-host-ip> "docker restart tei-embed"
```

### `VOYAGE_API_KEY` invalid

Rotate the key in `environments/.secrets/mentolder.yaml`, re-seal, apply:
```bash
task env:seal ENV=mentolder
task secrets:sync
```

---

## Web-Quellen crawlen

Web-crawl collections are NOT re-indexed via `task knowledge:reindex` — they use a separate task.

### From CLI (with port-forward)

```bash
# Find the collection UUID:
task workspace:psql ENV=mentolder -- website <<'SQL'
SELECT id, name, crawl_config->>'startUrl' AS start_url
FROM knowledge.collections
WHERE source = 'web_crawl';
SQL

# Run the crawler:
task knowledge:crawl ENV=mentolder COLLECTION_ID=<uuid>

# Optional overrides:
START_URL=https://other-url.com MAX_PAGES=50 task knowledge:crawl ENV=mentolder COLLECTION_ID=<uuid>
```

### From Admin UI

Navigate to `/admin/wissensquellen` → "Web-Quellen" table → click **"Crawl starten"** next to the collection.

The crawl runs in the background; the collection's `chunk_count` and `last_indexed_at` update when it finishes.

### Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| 0 pages crawled | robots.txt blocks all paths, or URL unreachable | Check robots.txt at `<startUrl>/robots.txt`; verify URL |
| Script exits with "No startUrl configured" | `crawl_config` not set in DB | Use PATCH `/api/admin/knowledge/collections/<id>/crawl-config` or recreate collection |
| Embedding error | VOYAGE_API_KEY missing or TEI down | Check env var / GPU host as per embedding model isolation section above |
| 409 from API | Another crawl already running | Wait for it to finish (check pod logs) |

---

## When to reindex

| Event | Reindex needed? |
|---|---|
| New PRs merged | Yes — `SOURCE=prs` |
| Docs content updated (`k3d/docs-content/`) | Yes — `SOURCE=markdown` |
| New tickets/bugs added | Yes — `SOURCE=bugs` (or auto via CronJob) |
| Coaching book ingested | No — coaching:ingest handles its own embedding |
| Workspace redeployed | No — collections persist in shared-db |
| shared-db restored from backup | Only if collection data was in the restored DB |

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
