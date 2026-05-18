---
name: coaching-pipeline
description: Use when ingesting coaching books/PDFs, classifying knowledge chunks, reviewing draft knowledge items, or debugging the coaching content pipeline. Covers task coaching:ingest, task coaching:classify, /admin/knowledge/drafts, and local LLM requirements.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# coaching-pipeline

End-to-end workflow for getting coaching content from source files into the live knowledge base.

---

## Pipeline overview

```
Source file (PDF/EPUB)
    ↓  task coaching:ingest
Chunks stored in pgvector (status: UNCLASSIFIED)
    ↓  task coaching:classify
Chunks classified by LLM (status: DRAFT)
    ↓  /admin/knowledge/drafts review
Chunks promoted to PUBLISHED
    ↓  available to coaching assistant
```

---

## Phase 1: Ingest a source file

```bash
task coaching:ingest -- <file> <slug> [--title="..."] [--author="..."]
```

Examples:
```bash
task coaching:ingest -- /home/patrick/books/my-book.pdf systemic-basics \
  --title="Systemische Grundlagen" --author="Max Mustermann"

task coaching:ingest -- /home/patrick/books/handbook.epub coaching-handbook \
  --title="Coaching Handbuch"
```

**What this does:**
- Splits the source into chunks
- Embeds chunks using the configured embedding model (see below)
- Stores in `coaching.chunks` with `status = 'UNCLASSIFIED'`
- Registers the book in `coaching.books`

**Verify ingestion:**
```bash
task workspace:psql ENV=mentolder -- website <<'SQL'
SELECT slug, title, chunk_count, created_at::date
FROM coaching.books
ORDER BY created_at DESC
LIMIT 10;
SQL
```

---

## Phase 2: Classify chunks

```bash
# Classify by slug:
task coaching:classify -- --slug=<slug>

# Classify all UNCLASSIFIED chunks:
task coaching:classify -- --all
```

**Classification assigns:**
- A topic category
- A confidence score
- A DRAFT status (ready for review)

### LLM requirements for classify

Classification uses a chat-class LLM. Two paths:

**Path A — Cluster llm-router (preferred in prod):**
- Requires `LLM_ENABLED=true` and `LLM_HOST_IP` set in `environments/<env>.yaml`
- The GPU host must be reachable on the `wg-mesh` network
- Models: llama3.2, gemma3 (via Ollama on the GPU host)

**Path B — Anthropic API fallback:**
- Used if `LLM_ENABLED=false` or GPU host is unreachable
- Requires a valid `ANTHROPIC_API_KEY` in the SealedSecret
- Check API key validity: if classify returns `401 Unauthorized` from Claude, the key needs rotation (see memory: `project_anthropic_key_rotation`)

**Path C — Local WSL Ollama (development workaround):**
- Run Ollama locally on WSL2, expose via LiteLLM as Anthropic translator
- See memory: `reference_local_llm_classify_workflow`
- Use when the cluster llm-router path is broken from Hetzner pods

**Embedding model selection** — this is critical:
- `bge-m3` collections use TEI on `llm-gateway-embed:8081`
- `voyage-multilingual-2` collections use Voyage AI directly
- **These never fall back across vector spaces.** A `bge-m3` collection fails closed if TEI is down — do not try to substitute Voyage embeddings. `MixedEmbeddingModelError` is thrown for cross-model queries.

Check which model a collection uses:
```bash
task workspace:psql ENV=mentolder -- website <<'SQL'
SELECT collection_name, embedding_model
FROM knowledge.collections;
SQL
```

---

## Phase 3: Review drafts

Navigate to: `https://web.mentolder.de/admin/knowledge/drafts`

For each draft chunk:
- Read the content and proposed classification
- **Approve** → promotes to `PUBLISHED` (available to coaching assistant)
- **Reject** → marks as `REJECTED` (won't appear in queries)
- **Edit** → correct category or content before publishing

Bulk operations from psql (use carefully):
```bash
task workspace:psql ENV=mentolder -- website <<'SQL'
-- Approve all DRAFT chunks for a specific book slug
UPDATE coaching.chunks
SET status = 'PUBLISHED', reviewed_at = now()
WHERE book_id = (SELECT id FROM coaching.books WHERE slug = '<slug>')
  AND status = 'DRAFT';
SQL
```

---

## Phase 4: Verify availability

After publishing, verify chunks are queryable:

```bash
task workspace:psql ENV=mentolder -- website <<'SQL'
SELECT status, COUNT(*) FROM coaching.chunks
WHERE book_id = (SELECT id FROM coaching.books WHERE slug = '<slug>')
GROUP BY status;
SQL
```

Expected: a mix of `PUBLISHED` chunks, zero `UNCLASSIFIED`.

Test a retrieval query via the coaching assistant at `https://web.mentolder.de/portal/coaching`.

---

## Common issues

| Symptom | Cause | Fix |
|---|---|---|
| `classify` hangs or times out | GPU host unreachable | Check `task workspace:logs ENV=mentolder -- llm-router`; use Path C (local Ollama) |
| `401` from classify | Anthropic API key invalid | Rotate key (see `secret-rotation` skill) |
| `MixedEmbeddingModelError` | Cross-model query attempted | Never mix bge-m3 and voyage collections in same query |
| TEI returns 503 | GPU host not running or overloaded | SSH to GPU host, check Ollama process |
| Chunks stuck at `UNCLASSIFIED` | classify never ran | Run `task coaching:classify -- --slug=<slug>` |
| Drafts page shows 0 items | All classified but not yet in DRAFT | Check `classify` exit code; re-run with `--slug` |
| Ingestion fails with encoding error | PDF has unusual encoding | Try converting to text first with `pdftotext` |

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
