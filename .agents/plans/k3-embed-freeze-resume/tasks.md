---
title: "Resume K3 embed freeze workstream T900986-990"
ticket_id: T900986
domains: [brain, scripts, tests]
status: superseded
file_locks: [docs/brain/corpus-freeze.json, docs/brain/handled-by-map.json, tests/spec/p0min-freeze-embed.bats]
shared_changes: true
batch_id: null
parent_feature: null
depends_on_plans: []
---

# k3-embed-freeze-resume — Implementation Plan

> **SUPERSEDED 2026-10-04 before execution.** The premise below was wrong: it
> was derived from a stale local checkout (branch `chore/cloud-env-devmesh`,
> ancestry predating the freeze) and a stale local `main` ref. The T900986–990
> workstream had already been executed and landed upstream via PRs
> #6218 (plan), #6219 (p1 freeze), #6220 (p2 handled-by), #6221 (p3 embed pin)
> and #6224 (first full embedding run, T900990). The plan is kept as the
> verification record; no execution was performed against landed work.

## Outcome (verification, 2026-10-04)

Verified against `origin/main @ efd2443c8` (detached git-crypt-filtered
checkout; encrypted secrets untouched):

- All six declared outputs exist on origin/main: `corpus-freeze.json`,
  `slice-taxonomy.md`, `handled-by-map.json`, `route-handledby-sample.md`,
  `embed-eval-report.md`, `tests/spec/p0min-freeze-embed.bats`; `tasks.d/`
  contains all three partial briefs.
- `tests/unit/lib/bats-core/bin/bats tests/spec/p0min-freeze-embed.bats`:
  **8/8 green** (G0 349 routes @8fed539b; G1 349/349 handled-by rows; G2 pin
  bge-m3 Q8_0 1024d + corpus sha256 `d8b03c59…`; FSD zero-FP; 3 held-out
  retrieval checks).
- `scripts/plan-intel.sh`-era lint on the landed plan: `plan-lint.sh` PASS
  (0 hard, 2 warn — task-count corridor).
- Embedding run record `docs/brain/embed-index.json` pins model `bge-m3` to
  the same corpus sha256 (`d8b03c59…`), `frozen_at_commit`, candidate_count
  and held-out set.

Known nuance: `embed-eval-report.md` still carries its p3-time header
"STAGED, pipeline not yet run" although the run record exists (#6224) — a
doc-staleness fix, not a gate failure.

Successor work continues in `.agents/plans/k3-k1-reconciliation/` (D8) and
`.agents/plans/k3-health-monitoring/` (D5/D6).

---

## Original plan (premise falsified — kept for the record)

**Goal:** The T900986–T900990 workstream (p0min-freeze-embed) is stalled at plan
stage: `.agents/plans/p0min-freeze-embed/tasks.d` is an empty file although the
plan manifest references three partial briefs, the five stacked branches are
23–29 commits ahead of main and unmerged, and none of the declared outputs
(corpus freeze, handled-by map, embed eval report) exist. This plan authors the
missing partials, executes the freeze/embed gates, and lands the stack — closing
the K3 route-coverage gap (462 routes vs 69 HANDLED_BY edges) and giving the
code graph a frozen evaluation corpus for all later quality work.

## File Structure

- `.agents/plans/p0min-freeze-embed/tasks.d/p1-freeze.md` — new partial brief (impl)
- `.agents/plans/p0min-freeze-embed/tasks.d/p2-handledby.md` — new partial brief (impl)
- `.agents/plans/p0min-freeze-embed/tasks.d/p3-embed.md` — new partial brief (tests)
- `docs/brain/corpus-freeze.json` — new; every route as `repo@commit:path:symbol`
- `docs/brain/slice-taxonomy.md` — new; slice taxonomy for the frozen corpus
- `docs/brain/handled-by-map.json` — new; route → handler mapping closing the coverage gap
- `docs/brain/route-handledby-sample.md` — new; human-readable sample of the map
- `docs/brain/embed-eval-report.md` — new; bge-m3 pinned to the corpus hash, held-out retrieval results
- `tests/spec/p0min-freeze-embed.bats` — new; gates G0 (freeze), G1 (handled-by), G2 (embed)

## Tasks

- [ ] **1. RED: freeze/spec test fails first.** Write `tests/spec/p0min-freeze-embed.bats`
  with three gates: G0 asserts `docs/brain/corpus-freeze.json` parses and covers every
  route recorded by `docs/generated/graph.json`; G1 asserts every route in the freeze
  has a HANDLED_BY entry in `docs/brain/handled-by-map.json`; G2 asserts the embed eval
  report references the corpus hash and held-out hit-rate thresholds. Then run:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/p0min-freeze-embed.bats
```

  Expected: FAIL — none of the three output files exist yet. Record the failing output in
  the workstream ticket before implementing.

- [ ] **2. Author the missing partial briefs.** Fill
  `.agents/plans/p0min-freeze-embed/tasks.d/p1-freeze.md`, `p2-handledby.md` and
  `p3-embed.md` so the existing manifest table (roles impl/impl/tests, deps p1 and
  p1+p2, min_tier 27b-local/27b-local/4b-local) becomes executable; each brief lists
  its exact target files, fixture strategy and done criteria, staying under the
  7000-token partial budget.

- [ ] **3. Execute p1+p2: freeze and map.** Produce `corpus-freeze.json` with a corpus
  hash over the route set, `slice-taxonomy.md`, `handled-by-map.json` and
  `route-handledby-sample.md` from the current graph build
  (`scripts/build-graph.mjs` output). Every mapped handler must resolve to a real
  symbol in the graph; unresolved routes are listed explicitly, never guessed.

- [ ] **4. Execute p3: embed gate green.** Pin bge-m3 to the frozen corpus hash, run
  the held-out retrieval checks, write `embed-eval-report.md`; make
  `tests/spec/p0min-freeze-embed.bats` pass all three gates. Commit on the stacked
  branches as `feat(T900986): freeze K3 route corpus and handled-by map`.

- [ ] **5. Rebase and land the stack.** Rebase feature/T900986 → T900990 onto main in
  stack order, run the stack gates per branch, and open sequenced PRs; the parent
  owns ticket transitions and merges. On conflict, the freeze outputs regenerate from
  the rebased graph build — never hand-patched.

- [ ] **6. Final verification.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/p0min-freeze-embed.bats
bash scripts/plan-lint.sh .agents/plans/p0min-freeze-embed/tasks.md
task test:changed; task freshness:regenerate; task freshness:check;
```
