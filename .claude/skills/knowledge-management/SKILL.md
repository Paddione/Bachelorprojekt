---
name: knowledge-management
description: Unified runbook for knowledge base ingestion (coaching content, PDFs, epubs), indexing pipelines (PRs, docs, bugs), embedding model isolation rules (TEI vs Voyage), and crawler management.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# knowledge-management

This runbook covers knowledge base ingestion, database indexing, and LLM configuration for the Bachelorprojekt search and assistant services.

---

## ⚠️ Embedding Model Isolation (Vector Spaces)

The system uses **two separate vector embedding spaces** that are completely incompatible. Under no circumstances should they be mixed or query candidates fall back to the wrong service:

| Model | Provider | Used for | Deployment Details |
|---|---|---|---|
| `bge-m3` | Text Embeddings Inference (TEI) | In-cluster `bge-m3` collections | Runs on GPU host (`llm-gateway-embed:8081`) |
| `voyage-multilingual-2` | Voyage AI Cloud API | In-cluster `voyage` collections | Requires `VOYAGE_API_KEY` |

**Failure Mode:** If TEI is down, `bge-m3` collections will throw errors. If you see `MixedEmbeddingModelError`, a cross-model query was attempted. Verify the collection configurations in the database:
```bash
task workspace:psql ENV=mentolder -- website -c "SELECT collection_name, embedding_model FROM knowledge.collections;"
```

---

## Phase 1 — Coaching Content Ingestion Pipeline

Ingest specialized coaching texts (PDFs, EPUBs) into pgvector chunks.

```
Source File (PDF/EPUB) ──► task coaching:ingest ──► chunks in pgvector (UNCLASSIFIED)
                                                      │
PUBLISHED chunk ◄── Approved ◄── Admin Drafts UI ◄── task coaching:classify (DRAFT)
```

### Step 1.1: Ingestion
```bash
task coaching:ingest -- <file_path> <slug> [--title="..."] [--author="..."]
```
Verify chunks are created:
```bash
task workspace:psql ENV=mentolder -- website -c "SELECT slug, chunk_count FROM coaching.books ORDER BY created_at DESC LIMIT 5;"
```

### Step 1.2: Classification
Assign topics and confidence scores to chunks:
```bash
# Classify a specific book
task coaching:classify -- --slug=<slug>

# Classify all UNCLASSIFIED chunks
task coaching:classify -- --all
```
*Requires either in-cluster `llm-router` reachable on wg-mesh (llama3.2/gemma3) or `ANTHROPIC_API_KEY` fallback.*

### Step 1.3: Draft Approval
Open `https://web.mentolder.de/admin/knowledge/drafts` to review chunks, select approved categories, and promote them to `PUBLISHED`.
To bulk approve via SQL:
```sql
UPDATE coaching.chunks SET status = 'PUBLISHED', reviewed_at = now() WHERE book_id = (SELECT id FROM coaching.books WHERE slug = '<slug>') AND status = 'DRAFT';
```

---

## Phase 2 — General Knowledge & Git Repository Reindexing

Index repository documentation, GitHub PRs, and platform bug reports.

### Step 2.1: Pre-checks
Ensure the embedding backend for the target collection is reachable:
* **TEI (bge-m3):** Check GPU host health and logs:
  ```bash
  kubectl exec -n workspace --context fleet -c llm-gateway -- curl -s http://localhost:8081/health
  ```
* **Voyage AI:** Verify api key length is valid:
  ```bash
  kubectl get secret workspace-secrets -n workspace --context fleet -o jsonpath='{.data.VOYAGE_API_KEY}' | base64 -d | wc -c
  ```

### Step 2.2: Execute Reindex
```bash
task knowledge:reindex ENV=mentolder SOURCE=<source>
```
*`SOURCE` can be: `prs` (GitHub interactions), `markdown` (docs/markd directory files), `bugs` (tickets database), or `all`.*

### Step 2.3: Verification
Check that document counts are populated:
```sql
SELECT collection_name, document_count, updated_at FROM knowledge.collections ORDER BY updated_at DESC;
```

---

## Phase 3 — Web Source Crawling

Web-crawl collections are crawling configurations stored in the database.

### Step 3.1: Run via CLI
Find collection UUIDs:
```sql
SELECT id, name, crawl_config->>'startUrl' FROM knowledge.collections WHERE source = 'web_crawl';
```
Run crawler:
```bash
task knowledge:crawl ENV=mentolder COLLECTION_ID=<uuid>
```

### Step 3.2: Run via Admin UI
Go to `/admin/wissensquellen` → "Web-Quellen" → click **"Crawl starten"**.

---

## Troubleshooting & Common Blockers

| Symptom | Cause | Fix |
|---|---|---|
| `knowledge:reindex` indexes 0 docs | Embedding API down during indexing. Collection cleared! | 1. **Stop:** Do not commit empty state. <br>2. Restore DB from backup: `task workspace:restore -- website <timestamp>` <br>3. Fix the embedding endpoint before retrying. |
| TEI returns 503 / classify hangs | GPU box unreachable or Ollama service stopped | SSH to GPU host and restart docker image: `docker restart tei-embed` |
| `MixedEmbeddingModelError` | Query tried searching across models | Check code: split the query so it targets only one collection type. |

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits cleanly.
