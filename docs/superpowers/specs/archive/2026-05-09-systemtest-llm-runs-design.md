---
title: System-Test LLM Runs — Design Spec
domains: [db, website, test, ops]
status: active
pr_number: null
---

# System-Test LLM Runs — Design Spec

> **Date:** 2026-05-09
> **Status:** Spec — pending implementation plan
> **Scope:** Replace the manual `systemtest:cycle` fanout + manual Fragebogen-Auswertung with a parent "Lauf"-entity that bundles all 12 system-tests, gated on at least one **side objective** and at least one **knowledge collection**, walked by an LLM agent that retrieves from selected pgvector collections and auto-fills `coach_notes`.

## 1. Goal

When the user clicks **▶ Lauf starten · 12 Agenten** on `/admin/systemtests/new`, all 12 system-test templates run in parallel as LLM-driven walks, each grounded in (a) one or more user-supplied side objectives that apply to every walk and (b) the user's selected knowledge collections (pgvector retrieval). At the end, the user sees one parent-run page with a compliance matrix, an LLM-generated drift summary, and 12 cards — each carrying the agent's per-template observation. No manual Fragebogen-Auswertung is required to reach a final "reviewed" state for any of the 12 assignments.

## 2. Non-Goals

- Replacing the unified-ticketing `tickets.tickets` schema (still spec-stage). This design ships independently and the two reconcile later via a `tickets.tickets.systemtest_run_id` FK if/when ticketing lands.
- Replacing the existing `task systemtest:analyze` markdown drift report — that remains as the human-readable evidence artifact; the parent-run page just adds an at-a-glance live view on top.
- URL crawling or Nextcloud-document ingestion for custom knowledge collections (v1 supports file upload + pasted text only).
- Multi-brand parallel runs (one run = one brand).
- Cross-run comparison view (would need a `runs` diff page; deferred).
- Replacing the existing dev-only deterministic walker (`tests/e2e/lib/systemtest-runner.ts`); it stays as the offline fallback when no `ANTHROPIC_API_KEY` is available.

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  /admin/systemtests                                                │
│   ├─ list past runs (compliance score, date, brand, drift snippet) │
│   └─ "+ Neuer Lauf" ──► /admin/systemtests/new (4-step wizard)     │
│                              │                                     │
│                              ▼                                     │
│                       POST /api/admin/systemtests/runs             │
│                       ── creates run row + 12 walk rows + 12       │
│                          questionnaire_assignments (status=pending)│
│                              │                                     │
│              ┌───────────────┴───────────────┐                     │
│              ▼                               ▼                     │
│   POST .../runs/<id>/start         📋 Demo-Anweisung kopieren      │
│   (headless API walker)            (CC-prompt with run id)         │
│              │                               │                     │
│              ▼                               ▼                     │
│   in-process on website pod       external Claude Code session     │
│   ── 12 walks in parallel         ── LLM agent drives Playwright   │
│   ── DB-direct writes via         ── MCP, posts via portal HTTP    │
│      questionnaire-db helpers        endpoints with user session   │
│              │                               │                     │
│              └───────────────┬───────────────┘                     │
│                              ▼                                     │
│         per walk · per step:                                       │
│           1. embed(questionText) → top-k chunks from selected      │
│              knowledge.collections                                 │
│           2. Sonnet picks {erfüllt|teilweise|nicht_erfüllt}+details│
│           3. write answer (helper or portal-PUT depending on path) │
│         end of walk:                                               │
│           4. Sonnet drafts agent_observation                       │
│           5. write coach_notes + status='reviewed'                 │
│         end of run:                                                │
│           6. Sonnet drafts drift_summary                           │
│           7. runs.status='completed'                               │
│                              │                                     │
│                              ▼                                     │
│  /admin/systemtests/<runId>                                        │
│   ├─ score · drift_summary · objective chips                       │
│   └─ 12 cards · deep-link → /admin/fragebogen/<assignmentId>       │
└────────────────────────────────────────────────────────────────────┘
```

**Two new schemas in `shared-db`** (sibling to `bachelorprojekt`, `bugs`, `tickets`):

- `systemtest.*` — run/walk plan; mutable, owned by humans + walker.
- `knowledge.*` — pgvector corpus; mutable but owned by ingestion jobs.

**Why two schemas, not one.** Same separation rationale as `tickets.tickets` vs `tickets.pr_events`: workflow data has different lifecycle and ownership than corpus data, and keeping them apart means corpus rebuilds can never corrupt run history.

**Why not extend the proposed `tickets.tickets` schema.** Unified ticketing is spec-stage; building it as a prerequisite would balloon scope. `systemtest.runs` is small and self-contained; reconciliation later is a one-FK migration.

## 4. Data Model

```sql
CREATE SCHEMA IF NOT EXISTS systemtest AUTHORIZATION website;
CREATE SCHEMA IF NOT EXISTS knowledge  AUTHORIZATION website;
CREATE EXTENSION IF NOT EXISTS vector;

-- ── runs ────────────────────────────────────────────────────────────
CREATE TABLE systemtest.runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  brand            TEXT NOT NULL CHECK (brand IN ('mentolder','korczewski')),
  side_objectives  JSONB NOT NULL,
  collection_ids   UUID[] NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','completed','failed','cancelled')),
  compliance_score NUMERIC(4,3),
  drift_summary    TEXT,
  llm_model        TEXT NOT NULL,
  embedding_model  TEXT NOT NULL,
  cost_cents       INT,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  created_by       UUID REFERENCES customers(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT runs_objectives_nonempty
    CHECK (jsonb_typeof(side_objectives) = 'array' AND jsonb_array_length(side_objectives) >= 1),
  CONSTRAINT runs_collections_nonempty
    CHECK (cardinality(collection_ids) >= 1)
);

-- ── per-template walk ───────────────────────────────────────────────
CREATE TABLE systemtest.run_walks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            UUID NOT NULL REFERENCES systemtest.runs(id) ON DELETE CASCADE,
  template_number   INT  NOT NULL CHECK (template_number BETWEEN 1 AND 12),
  template_id       UUID NOT NULL REFERENCES questionnaire_templates(id),
  assignment_id     UUID NOT NULL REFERENCES questionnaire_assignments(id),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  compliance_score  NUMERIC(4,3),
  agent_observation TEXT,
  outcome_json      JSONB,
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  error_message     TEXT,
  UNIQUE (run_id, template_number)
);

-- ── knowledge / pgvector ────────────────────────────────────────────
CREATE TABLE knowledge.collections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  description     TEXT,
  source          TEXT NOT NULL CHECK (source IN
                    ('pr_history','specs_plans','claude_md','bug_tickets','custom')),
  brand           TEXT,
  chunk_count     INT NOT NULL DEFAULT 0,
  last_indexed_at TIMESTAMPTZ,
  created_by      UUID REFERENCES customers(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE knowledge.documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES knowledge.collections(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  source_uri    TEXT,
  raw_text      TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE knowledge.chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES knowledge.documents(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES knowledge.collections(id) ON DELETE CASCADE,
  position      INT  NOT NULL,
  text          TEXT NOT NULL,
  embedding     VECTOR(1024),
  metadata      JSONB DEFAULT '{}'
);

CREATE INDEX chunks_embedding_hnsw ON knowledge.chunks
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_collection     ON knowledge.chunks (collection_id);
```

## 5. Walker Logic

### 5.1 Headless API walker (the only backend impl)

A new Node module `website/src/lib/systemtest-walker.ts` exports:

```ts
export interface WalkArgs {
  templateNumber: number;
  template:        SystemTestTemplate;
  assignmentId:    string;
  sideObjectives:  string[];
  collectionIds:   string[];
  llmModel:        string;
  signal:          AbortSignal;
}
export interface WalkResult {
  perStep: Array<{
    position: number;
    choice: 'erfüllt' | 'teilweise' | 'nicht_erfüllt';
    details: string;
    evidenceChunkIds: string[];
  }>;
  agentObservation: string;
  complianceScore: number;
}
export async function walkHeadless(args: WalkArgs): Promise<WalkResult>;
```

The walker runs **in-process on the website Deployment** so it can reuse the existing `questionnaire-db` helpers (`upsertQAnswer`, `updateQAssignment`) without HTTP/auth overhead. The portal `PUT /api/portal/questionnaires/[id]/answer` endpoint requires a customer session cookie + `customer_id` match, so a backend HTTP walker would not work without bypass plumbing — direct helper calls are simpler and equivalent.

The walker:

1. Reads template steps from the in-process `SYSTEM_TEST_TEMPLATES` array (no DB hop for templates).
2. Iterates steps in order. For each step:
   - **Embed**: calls `embedQuery(text)` — voyage-multilingual-2 → vector(1024).
   - **Retrieve**: `SELECT id, text, ... FROM knowledge.chunks WHERE collection_id = ANY($1::uuid[]) ORDER BY embedding <=> $2 LIMIT 6` — discard rows with cosine score < 0.65.
   - **Decide**: single Sonnet call with the prompt below; expects JSON.
   - **Persist**: `upsertQAnswer({assignmentId, questionId, optionKey, detailsText})` — direct DB helper.
3. After last step:
   - **Submit**: `updateQAssignment(id, { status: 'submitted' })` to mirror the existing wizard-submit transition.
   - **Summarize**: one Sonnet call summarizing all step decisions → 1–3 sentence `agent_observation`.
   - **Auto-review**: `updateQAssignment(id, { status: 'reviewed', coachNotes: agentObservation })`.
4. Returns `WalkResult`; the dispatcher writes `outcome_json` to `systemtest.run_walks`.

### 5.2 Per-step prompt template

```
You are walking System-Test {N}: {templateTitle}, step {position}/{total}.

== Side objectives ==
{sideObjective1}
{sideObjective2}
…

== Step description ==
{questionText}
Test role: {testRole | "—"}
Direct link: {testFunctionUrl | "—"}
agent_notes: {agent_notes | "—"}

== Retrieved context (top 6, threshold 0.65) ==
[CHUNK-1 · {collectionName} · {sourceTitle} · score 0.83]
{chunkText}
…

Decide one: erfüllt | teilweise | nicht_erfüllt
Write a 1-2 sentence "Details" justification. Cite CHUNK-N when grounding a claim.

Reply with JSON only:
{ "choice": "erfüllt" | "teilweise" | "nicht_erfüllt",
  "details": "...",
  "evidence_chunks": ["CHUNK-1","CHUNK-3"] }
```

### 5.3 Failure handling

| Failure | Behavior |
|---|---|
| LLM returns invalid JSON | One retry with "respond with JSON only" reminder. Second failure → `choice='teilweise'`, `details='LLM JSON parse failed: <truncated>'`, continue. |
| Anthropic 429 | Exponential backoff up to 60 s. Persistent failure → mark walk `failed`, run continues with the other 11. |
| Voyage embedding 5xx for a single step | Fall back to no-retrieval prompt for that step; note in details. |
| Retrieval returns 0 chunks | Proceed with no-context prompt (normal, not an error). |
| `runs.cost_cents` exceeds 500 (= $5) between any two steps | Abort walker; mark run `failed` with `error_message='cost cap exceeded'`. |

### 5.4 End-of-run drift summary

After all 12 walks reach a terminal status, the dispatcher makes one final Sonnet call passing all 12 `agent_observation` strings + the side-objective list + the compliance matrix. The 3–5 sentence response is written to `systemtest.runs.drift_summary`. The existing `task systemtest:analyze` markdown report is unchanged and runs in parallel as before.

### 5.5 Demo path (Playwright MCP via Claude Code)

There is **no backend BrowserWalker**. The wizard's "📋 Demo-Anweisung kopieren" button (visible on step 4) calls `POST /api/admin/systemtests/runs` to create the run row, then copies a CC-ready prompt to the clipboard:

```
Drive the system-test walk for run <runId> using the Playwright MCP tools.
Side objectives: <obj1>, <obj2>, …
Collections: <name1>, <name2>, …

For each of the 12 system-test templates: open
https://web.<brand>.de/portal/fragebogen/<assignmentIdN>, walk every step
in the wizard (clicking erfüllt|teilweise|nicht_erfüllt, filling Details,
"Speichern & Weiter") and finally "Testprotokoll absenden". After each
walk, PUT coach_notes + status='reviewed' via
PUT /api/admin/questionnaires/assignments/<assignmentId>
  body: { "status": "reviewed", "coach_notes": "<agent observation>" }

Use mcp__plugin_playwright_playwright__browser_* tools throughout.
```

The user pastes into Claude Code; CC drives Playwright MCP, walks the wizard via the user's session cookie, calls the existing admin endpoint for coach_notes, parent-run page lights up live via SSE. **Zero Playwright code lives in the systemtest fanout for this path** — the demo path piggybacks on the wizard UI, the existing portal endpoints (which work because the browser carries a session), and one existing admin endpoint (`PUT /api/admin/questionnaires/assignments/[id]` already accepts `{status, coach_notes}`).

## 6. UI Surfaces

### 6.1 `/admin/systemtests` — past runs index

Table: name · brand · score · started_at · drift_summary preview (1 line truncated) · status pill. Top-right "+ Neuer Lauf" button → wizard.

### 6.2 `/admin/systemtests/new` — 4-step wizard

Layout B from brainstorming (multi-step, breadcrumb).

| Step | Fields | Gate |
|---|---|---|
| 1 · Stamm | Name (text) · Brand (mentolder \| korczewski) | none |
| 2 · Nebenziele | Ordered list of strings · "+" to add · ↑↓ to reorder · ✕ to remove | Weiter disabled until ≥ 1 |
| 3 · Wissen | Checkbox list of all `knowledge.collections` (built-in shown first, custom below) · "+ Neue Wissensquelle" inline button | Weiter disabled until ≥ 1 selected |
| 4 · Bestätigen | Read-only summary · two buttons: "▶ Lauf starten · 12 Agenten" (headless) and "📋 Demo-Anweisung kopieren" (CC + MCP) | n/a |

Both buttons on step 4 call `POST /api/admin/systemtests/runs`. The first additionally calls `POST /api/admin/systemtests/runs/<id>/start`; the second copies a prompt template (§5.5) to the clipboard and shows a toast: *"Anweisung kopiert. In Claude Code einfügen."*

### 6.3 `/admin/systemtests/<runId>` — parent-run page

Live during a run (SSE `/api/admin/systemtests/runs/<id>/events`), final after.

Layout (top to bottom):
- **Header**: name · meta line (brand · walker source · 12 walks · started_at → finished_at) · big compliance score · status pill.
- **Drift summary card**: brass-bordered box, label "Drift-Zusammenfassung (LLM-generiert)", 3–5 sentence `runs.drift_summary`. Empty until the final Sonnet call lands.
- **Objective chips**: row of pills, one per `side_objective`.
- **12-card grid** (2 columns): per walk → template number · title · score · agent_observation (italic, dashed top border) · count line "5 ✓ · 1 ⚠ · 0 ✗" · "Fragebogen-Detail →" deep-link to `/admin/fragebogen/<assignmentId>`. Border-left color encodes status: sage = 100%, brass = partial, red = failed, slate-blue = running.

### 6.4 `/admin/wissensquellen` — collection management

Built-in collections shown read-only at top (name · source · doc_count · chunk_count · last_indexed_at · "Re-index" button → `task knowledge:reindex`). Custom collections below in editable rows (delete enabled). Top-right "+ Neue Wissensquelle" button.

### 6.5 "+ Neue Wissensquelle" modal

Shared component used by step 3 of the wizard and by `/admin/wissensquellen`. Fields:
- Name (text, required, unique)
- Beschreibung (textarea, optional)
- Marke (mentolder | korczewski | beide)
- Quelle (radio): file upload (.md/.txt/.pdf, multi-file) | pasted text (one large textarea)

On submit: `POST /api/admin/knowledge/collections` (creates collection row), then per uploaded/pasted document: `POST /api/admin/knowledge/collections/[id]/documents`. Inline chunking + embedding for documents producing ≤ 50 chunks; otherwise enqueued for the next CronJob run with status `indexing`.

## 7. Ingestion Pipelines

### 7.1 Embedding model

`voyage-multilingual-2`, 1024 dims. Anthropic's recommended embeddings provider; multilingual matters because the corpus is German + English mixed. Cost ~$0.06/M tokens; full re-index of all four built-in collections ≈ $0.30.

### 7.2 Chunking

~600 input tokens per chunk, 100 token overlap. Markdown corpora split on H2/H3 boundaries first, then by token budget. SQL-row corpora (PR history, bug tickets) treat each row as one document; if `description` exceeds the budget, split.

### 7.3 Ingestion sources

| Source | Trigger | Implementation |
|---|---|---|
| `pr_history` | CronJob, daily 03:00 UTC | `scripts/knowledge/ingest-prs.mjs`: SELECT new rows from `bachelorprojekt.features` WHERE merged_at > collection.last_indexed_at; chunk + embed; upsert. |
| `specs_plans` | CronJob, daily 03:15 UTC | Walk `docs/superpowers/{specs,plans}/*.md`; SHA-256 per file; re-embed only files whose hash changed. |
| `claude_md` | Same job as `specs_plans` | Single file, hash-checked, re-embedded on change. |
| `bug_tickets` | CronJob, hourly | Brand-scoped: one collection per brand. SELECT new/updated rows from `bugs.bug_tickets`. |
| `custom` | UI submit (sync if ≤ 50 chunks; otherwise next cron tick) | `POST /api/admin/knowledge/collections/[id]/documents` accepts `{title, raw_text, source_uri}` or multipart. PDFs through `pdf-parse`; MD/TXT direct. |

CronJobs live in a new `k3d/knowledge-ingest-cronjob.yaml`, gated to Hetzner nodes per CLAUDE.md's CNI partition rule.

### 7.4 pgvector install

The `shared-db` Deployment is **already** running `pgvector/pgvector:0.8.0-pg16` (k3d/shared-db.yaml:103, :133), so no image swap is required. What's missing is the in-database extension itself: `CREATE EXTENSION IF NOT EXISTS vector;` ships as the first statement of a new init/ensure shell-script pair appended to `k3d/website-schema.yaml` (the same ConfigMap that already creates the `bugs` and `bachelorprojekt` schemas via init-/ensure- scripts). Idempotent; survives every `task workspace:deploy` because the ensure script runs on every postgres pod start.

## 8. Operational

### 8.1 Secrets

Two new keys via the existing SealedSecret pattern in `environments/.secrets/<env>.yaml`:

```yaml
anthropic_api_key: "sk-ant-…"
voyage_api_key:    "pa-…"
```

Surface as `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` env vars on:
- the website Deployment (for the wizard + walker dispatcher path)
- the new ingestion CronJobs (Voyage only)

The MCP demo path uses the user's own Claude Code subscription — no key needed for that.

### 8.2 Taskfile entries

```yaml
systemtest:run:
  desc: "Trigger an LLM-driven systemtest run via the API (creates run + dispatches walker)"
  vars:
    ENV:        '{{.ENV | default "mentolder"}}'
    NAME:       '{{.NAME | default "Run vom $(date +%Y-%m-%d_%H%M)"}}'
    OBJECTIVES: '{{.OBJECTIVES}}'   # comma-separated; required, ≥ 1
    COLLECTIONS:'{{.COLLECTIONS | default "pr_history,specs_plans,claude_md,bug_tickets"}}'
  preconditions:
    - sh: '[ -n "{{.OBJECTIVES}}" ]'
      msg: "OBJECTIVES is required (at least one side-objective, comma-separated)"
  cmds:
    - bash scripts/systemtest-run.sh "{{.ENV}}" "{{.NAME}}" "{{.OBJECTIVES}}" "{{.COLLECTIONS}}"

knowledge:reindex:
  desc: "Force re-index of a built-in collection (ENV=mentolder|korczewski, COLLECTION=pr_history|specs_plans|claude_md|bug_tickets)"
  cmds:
    - bash scripts/knowledge/reindex.sh "{{.ENV}}" "{{.COLLECTION}}"
```

The legacy `systemtest:cycle` / `scripts/systemtest-fanout.sh` path stays in-tree as the offline fallback when no `ANTHROPIC_API_KEY` is available; it is no longer the recommended way to walk all 12.

### 8.3 Concurrency

Headless walker spawns all 12 walks in parallel. Anthropic Sonnet at default (Tier 1) supports 50 RPM; ~100 steps × 12 walks × 2 calls (decide + summarize) = ~2 400 calls per run, distributed over ~3 min = ~13 RPS = well under tier-1 budget. If shared with other CC agent traffic, dedicate a separate `ANTHROPIC_API_KEY_SYSTEMTEST` key.

## 9. API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/systemtests/runs` | Create run row + 12 walk rows + 12 questionnaire_assignments (transactional). |
| POST | `/api/admin/systemtests/runs/[id]/start` | Dispatch headless walker. Sets `runs.status='running'`. |
| GET  | `/api/admin/systemtests/runs/[id]` | Read run with eager-loaded walks. |
| GET  | `/api/admin/systemtests/runs/[id]/events` | SSE stream of walk-status + per-step deltas. |
| POST | `/api/admin/knowledge/collections` | Create custom collection. |
| POST | `/api/admin/knowledge/collections/[id]/documents` | Add doc; chunk + embed inline or schedule. |
| DELETE | `/api/admin/knowledge/collections/[id]` | Allowed only when `source='custom'`. |

## 10. Testing

- **Unit (vitest)**: chunking helper boundary cases; embedding-call retry/backoff; walker JSON-parse fallback; retrieval-threshold cutoff; cost-cap abort.
- **E2E (Playwright)**: full headed wizard walk — set objective, pick collections, click "▶ Lauf starten", assert parent-run page renders 12 cards and `runs.status='completed'` within 10 min. Single test, run on demand (skipped in CI when `ANTHROPIC_API_KEY` unset). Lives at `tests/e2e/specs/systemtest-llm-run.spec.ts`.
- **Drift report compatibility**: walker writes `tests/e2e/results/outcomes/systemtest-NN-<env>.json` in the existing `OutcomeFile` shape so `task systemtest:analyze` continues to work unchanged.

## 11. Risks

- **Cost runaway** — a stuck retry loop could blow up. Mitigation: hard per-run cap of $5 enforced between steps; `cost_cents` accumulates from each Anthropic + Voyage response's token-count multiplied by a per-model tariff table held in `website/src/lib/llm-cost.ts`.
- **SSE on Astro** — `/api/admin/systemtests/runs/[id]/events` as Server-Sent Events is doable but Astro's adapter support is patchy. Mitigation: parent-run page falls back to 2-second polling if `EventSource` open fails; spec doesn't mandate which path ships first.
- **Embedding-model drift** — switching models forces full re-index. Mitigation: store `embedding_model` on `knowledge.collections`; refuse retrieval if mismatch.
- **LLM hallucination on auto-eval** — `agent_observation` could state things the evidence doesn't support. Mitigation: prompt forces `evidence_chunks` citations; the deep-link to `/admin/fragebogen/<assignmentId>` lets the user cross-check on demand.
- **Rate-limit contention** — shared Anthropic key with other CC traffic. Mitigation: dedicated `ANTHROPIC_API_KEY_SYSTEMTEST` (added to the SealedSecret if shared key proves unstable in practice).
- **CronJob node-affinity drift** — if ingestion CronJobs land on home workers they fail to reach `bachelorprojekt.features`. Mitigation: hard nodeAffinity to Hetzner nodes per CLAUDE.md.

## 12. File Inventory

**Created:**
- `k3d/knowledge-ingest-cronjob.yaml` — four CronJobs (pinned to Hetzner nodes)
- `website/src/lib/systemtest-walker.ts` — headless walker
- `website/src/lib/systemtest-runs-db.ts` — DB helpers
- `website/src/lib/knowledge-db.ts` — collection/document/chunk helpers
- `website/src/lib/embeddings.ts` — voyage-multilingual-2 client + retry
- `website/src/pages/admin/systemtests/index.astro` — runs index
- `website/src/pages/admin/systemtests/new.astro` — 4-step wizard
- `website/src/pages/admin/systemtests/[id].astro` — parent-run page
- `website/src/pages/admin/wissensquellen.astro` — collection management
- `website/src/pages/api/admin/systemtests/runs/index.ts`
- `website/src/pages/api/admin/systemtests/runs/[id]/index.ts`
- `website/src/pages/api/admin/systemtests/runs/[id]/start.ts`
- `website/src/pages/api/admin/systemtests/runs/[id]/events.ts`
- `website/src/pages/api/admin/knowledge/collections/index.ts`
- `website/src/pages/api/admin/knowledge/collections/[id]/index.ts`
- `website/src/pages/api/admin/knowledge/collections/[id]/documents.ts`
- `website/src/components/admin/SystemtestWizard.svelte`
- `website/src/components/admin/RunCard.svelte`
- `website/src/components/admin/KnowledgeSourceModal.svelte`
- `scripts/systemtest-run.sh`
- `scripts/knowledge/ingest-prs.mjs`
- `scripts/knowledge/ingest-markdown.mjs`
- `scripts/knowledge/ingest-bug-tickets.mjs`
- `scripts/knowledge/reindex.sh`
- `tests/e2e/specs/systemtest-llm-run.spec.ts`
- `environments/.secrets-template.yaml` (additions: `anthropic_api_key`, `voyage_api_key`)

**Modified:**
- `k3d/website-schema.yaml` — adds the `vector` extension + `systemtest.*` and `knowledge.*` schemas as new init-/ensure- script pairs (idempotent, in line with the existing `bugs`/`bachelorprojekt` pattern)
- `Taskfile.yml` — adds `systemtest:run`, `knowledge:reindex`
- `environments/sealed-secrets/<env>.yaml` — adds the two new keys (per env)

**Unchanged but reused:**
- `tests/e2e/lib/systemtest-runner.ts` (deterministic walker, dev fallback)
- `scripts/systemtest-analyze.sh` + drift-report markdown writer
- `/api/portal/questionnaires/[assignmentId]/answer` and `/submit` endpoints
- `/admin/fragebogen/[assignmentId]` review page (becomes deep-link target)
