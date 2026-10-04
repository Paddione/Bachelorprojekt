---
title: "K3 symbol embeddings — durable store, receipt-keyed sync, graph-aware rerank"
ticket_id: T900993
domains: [scripts, brain, tests]
status: active
file_locks: [scripts/mcp/cbm-embed-store.py, scripts/mcp/cbm-embed-sync.py, scripts/mcp/cbm-graph-rerank.py]
shared_changes: true
batch_id: null
parent_feature: null
depends_on_plans: []
---

# k3-embed-store-rerank — Implementation Plan

**Goal:** Lift the proven live demo (2026-10-04: 1,866 graph candidates
embedded with bge-m3 at ~6-7 texts/s and reranked with bge-reranker-v2-m3,
sensible hits on ticket-grill / talk-transcriber / purgeOneFixture) into a
durable, drift-proof layer: (1) a content-hash-keyed embedding store as a
versioned artifact instead of a /tmp checkpoint, (2) incremental
re-embedding keyed to the cbm-freshness receipts so vectors can never
silently drift from the graph (defect D8 arc: #6234/#6235), and (3) a
graph-aware rerank boost using structure the graph already carries (HANDLES,
CALLS/IMPORTS degree, TESTS_FILE) — evaluated against the frozen corpus
held-out set from the T900986-990 P0-min workstream.

## File Structure

- `scripts/mcp/cbm-embed-store.py` — new; content-hash-keyed vector store: artifact `.codebase-memory/embed-index.jsonl` + manifest `embed-manifest.json` (corpus sha256, receipt id, model, dim), load/upsert/diff/prune, stdlib-only
- `scripts/mcp/cbm-embed-sync.py` — new CLI; pulls candidates via `query_graph` (Routes + docstring Functions), diffs against the store by content hash, embeds only deltas via the gateway, prunes stale keys, writes the manifest keyed to the current freshness receipt
- `scripts/mcp/cbm-graph-rerank.py` — new CLI; takes a query + top-K store hits, pulls structural features via `query_graph` (HANDLES, CALLS/IMPORTS degree, TESTS_FILE), applies the boost as a pure function, emits ranked JSON
- `tests/spec/cbm-embed-store.bats` — new; store contract: hash determinism, upsert/diff/prune, manifest integrity, corrupt-artifact fail-closed
- `tests/spec/cbm-graph-rerank.bats` — new; rerank contract: boost is a pure function (no network), HANDLES boost applies, degenerate features degrade to embed order
- `docs/brain/embed-store.md` — new; store format spec, incrementality contract, drift semantics tied to freshness receipts
- `docs/brain/embed-rerank-eval.md` — new; graph-rerank eval against the P0-min held-out set, live-demo baseline numbers
- `docs/brain/k3-code-graph.md` — changed; K1/K3 section notes the symbol-embedding layer and its receipt-keyed drift contract
- `.opencode/skills/code-graph-interpretation/references/embeddings.md` — new; agent guidance for embed+rerank queries (both harness mirrors via existing symlink)

## Tasks

- [x] **1. RED: store contract fails first.** Write `tests/spec/cbm-embed-store.bats`
  exercising the store through `python3 -c` imports of
  `scripts/mcp/cbm-embed-store.py` in a temp dir: (a) identical text yields
  identical content hash, different text does not; (b) upsert writes the
  artifact line-per-vector with key, hash, model, dim, vector; (c)
  `diff_by_hash` returns exactly the keys whose text changed; (d) `prune_stale`
  drops keys absent from the candidate set; (e) the manifest records corpus
  sha256, receipt id, model, dim and a corrupted artifact fails closed with a
  non-zero exit instead of returning partial data. Then run:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/cbm-embed-store.bats
```

  Expected: FAIL — `scripts/mcp/cbm-embed-store.py` does not exist. Record the
  failing output under `.agents/plans/k3-embed-store-rerank/red-gate-output.txt`.

- [x] **2. Implement `scripts/mcp/cbm-embed-store.py`.** Stdlib-only. Key =
  `repo@commit:path:symbol` (same id scheme as the frozen corpus); content
  hash = sha256 over model name + exact embedding input text, so a model bump
  invalidates all vectors by construction. Artifact is append-ordered JSONL
  (`.codebase-memory/embed-index.jsonl`, gitignored via the existing
  `.codebase-memory/` handling), manifest sidecar JSON carries corpus sha256,
  freshness receipt id + timestamp, model, dim, counts. All readers
  fail-closed on malformed lines. Commit as
  `feat(T900993): content-hash-keyed embedding store for K3 symbol layer`.

- [x] **3. RED: sync and rerank contracts fail first.** Write
  `tests/spec/cbm-graph-rerank.bats`: (a) sync's `plan_sync` is a pure
  function over (candidate texts, store contents) returning
  to_embed/to_prune/unchanged — no network in this path, asserted via
  `python3 -c` with fixtures; (b) the rerank boost is a pure function over
  (embed score, structural features) — a HANDLES-matched candidate outranks a
  higher-scoring unboosted one, zero features degrade to embed order; (c)
  manifest without a receipt id fails closed. Then run:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/cbm-graph-rerank.bats
```

  Expected: FAIL — neither script exists yet. Append the failing output to the
  RED evidence file.

- [x] **4. Implement sync and graph rerank.** `cbm-embed-sync.py status|sync`:
  `status` reports store coverage vs current candidates without network;
  `sync` pulls candidates via `query_graph` (Route file paths + docstring
  Functions, client-side row sort for deterministic order), diffs by content
  hash, embeds only deltas via `LLM_EMBED_URL` (default
  `http://localhost:8081/v1/embeddings`, 4-attempt retry with backoff — the
  embed pod 401s transiently, observed 2026-10-04), prunes stale keys, and
  stamps the manifest with the receipt id from
  `cbm-freshness.py status`; refuses to run when freshness is `unknown`
  unless `--allow-stale` is passed explicitly (fail-closed drift contract).
  `cbm-graph-rerank.py` reads top-K store hits, fetches per-candidate
  features via one `query_graph` call per feature kind, and applies the pure
  boost (HANDLES match +, log-degree of CALLS/IMPORTS +, TESTS_FILE +).
  Commit as
  `feat(T900993): receipt-keyed embed sync and graph-aware rerank`.

- [ ] **5. Evaluate against the frozen corpus and document.** Run the sync on
  the live graph (port-forward `svc/llm-gateway-embed`), then evaluate
  embed-only vs graph-reranked retrieval on the P0-min held-out set from
  `docs/brain/embed-index.json` (auth/callback, billing/create-invoice,
  brett/bot) plus three SDLC decision queries; write
  `docs/brain/embed-rerank-eval.md` with the numbers and the demo baseline.
  Write `docs/brain/embed-store.md` (format, incrementality, drift
  semantics), update `docs/brain/k3-code-graph.md` (symbol-embedding layer +
  receipt-keyed drift contract in the K1/K3 section), and add the skill
  reference for agent usage. Commit as
  `docs(T900993): embed store format and graph-rerank eval`.

- [ ] **6. Final verification.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/cbm-embed-store.bats
tests/unit/lib/bats-core/bin/bats tests/spec/cbm-graph-rerank.bats
bash scripts/plan-lint.sh .agents/plans/k3-embed-store-rerank/tasks.md
task test:changed; task freshness:regenerate; task freshness:check;
```

## Appendix A4/A5 — cron embed-sync hook + K1 markdown coverage (2026-10-04)

Combined task A4 (K3 cron hook) + A5 (K1 markdown coverage + red-run
diagnosis), implemented on branch `feature/k3-symbol-embed-rerank-T900993`.

- A4: `scripts/cbm-refresh-cron.sh` invokes the K3 symbol embed sync after a
  successful refresh (after `WRAP_EXIT==0`, before emitting `refreshed`):
  `python3 "$HERE/mcp/cbm-embed-sync.py" sync --repo "$REPO" --project
  "$PROJECT" --timeout "$TIMEOUT"`, output to stderr so stdout stays a single
  JSON line. Non-fatal by construction: a sync failure only logs a WARNING
  and the `refreshed` status stands. `--dry-run` exits at `would-refresh`
  before the hook, so it never syncs. `CBM_EMBED_SYNC` overrides the CLI
  path as a test seam (default is the in-repo script). Covered by
  `tests/spec/cbm-refresh-cron-A4.bats` (3 tests, green).
- A5a: `findMarkdownFiles()` in `scripts/knowledge/ingest-markdown.mjs` now
  reads flat `*.md` from `docs/superpowers/specs`, `docs/adr`,
  `docs/runbooks`, `docs/brain`, plus staged `.agents/plans/*/*.md` and root
  `CLAUDE.md`. Flat per dir is deliberate: it mirrors the k1-embed-job
  selective trigger so script and trigger cannot drift apart silently
  (`docs/brain` has no subdirs as of 2026-10-04). Collection description
  updated to name the new sources. Counts on 2026-10-04: specs 154, adr 12,
  runbooks 28, brain 8, staged plans 54, CLAUDE.md 1 — total 257 files (was
  209, +48). `node --check` green.
- A5b: `.github/workflows/k1-embed.yml` needs no change. The push path
  filter (line 15) and the diff calc (line 52) both match `**.md`, which
  covers `docs/superpowers/specs/*.md`.
- A5c red-run diagnosis: `k1-embed` runs 37173156181 (PR 6234, 3m40s) and
  37167568013 (cloud-env, 3m10s) both fail in the `Launch embed job` step —
  the fail-fast poll sees the in-cluster Job `Failed` condition. The Job
  pods/logs are gone: `k3d/k1-embed-job.yaml` sets
  `ttlSecondsAfterFinished: 3600`, so per-pod evidence expires one hour
  after finish. Root cause of the container failure is therefore unknown
  with reason (no logs, no describe output). Correlation recorded, not a
  verdict: both diffs triggered the selective full-markdown path
  (`ingest-markdown.mjs` over all files via the embed gateway) — 6234 via
  `.agents/plans/*/*.md`, cloud-env via `docs/runbooks/cloud-env-devmesh.md`
  — and failed within ~3 min, i.e. fast-fail rather than the 90-min budget
  timeout documented in the workflow comments. Candidates consistent with a
  fast fail are the transient embed-gateway 401s observed 2026-10-04, the 1Gi
  container memory limit during a full ingest, or a DB-secret connectivity
  fault; none is confirmable post-TTL.
- TTL proposal (not applied, infra change out of scope): raise
  `ttlSecondsAfterFinished` from 3600 to 86400 in `k3d/k1-embed-job.yaml`
  so the next red run keeps `kubectl logs`/`describe` evidence for a day, or
  ship the embed-container logs to a persistent artifact on failure.
- Remaining uncertainty: the job selective trigger (`case` on diff paths)
  matches `.agents/plans/*.md|docs/adr/*.md|docs/runbooks/*.md` but not
  `docs/brain/*.md` or `docs/superpowers/specs/*.md` — edits confined to
  those two dirs complete green as `keine indexierten Pfade` without
  re-ingesting. `docs/superpowers/references` (e.g. gotchas-footguns) and
  `docs/superpowers/plans` are ingested by neither the script nor the
  trigger. Both gaps are left for a follow-up decision, not changed here.
