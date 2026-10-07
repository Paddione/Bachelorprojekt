---
title: "K3 health monitoring and index-failover semantics (defects D5/D6)"
ticket_id: T002430
domains: [scripts, brain, tests]
status: active
file_locks: [scripts/health-goals-check.sh, docs/runbooks/cbm-index-stampede.md, docs/brain/k3-code-graph.md]
shared_changes: true
batch_id: null
parent_feature: T002430
depends_on_plans: []
---

# k3-health-monitoring — Implementation Plan

**Goal:** Close defects D5 and D6 from `docs/brain/k3-code-graph.md`. D6: K3
has no health goals at all — the historical graph.db.zst check was already
removed from `scripts/health-goals-check.sh` (upstream), and nothing replaced
it: no freshness, project-presence or index-size row exists, so K3 health is
effectively unmonitored. D5: no defined behavior when the index or the refresh
path fails. This plan adds real K3 health goals driven by the freshness
receipts (`scripts/mcp/cbm-freshness.py`) and documents the failover contract
for index outages.

## File Structure

- `scripts/health-goals-check.sh` — changed; new `G-K3*` row/target family replacing the graph.db.zst check
- `tests/spec/cbm-health-goals.bats` — new BATS suite for the new rows
- `docs/runbooks/cbm-index-stampede.md` — changed; failover semantics section (single-flight timeout, failed receipt, missing CLI, recovery)
- `docs/brain/k3-code-graph.md` — changed; D5/D6 defect rows updated

## Tasks

- [ ] **1. RED: health goal fails first.** Add BATS coverage asserting a new
  `G-K3FRESH` row exists and reports fail-closed: with a stubbed
  `cbm-freshness.py` returning `unknown`, the row reports NOT green
  (`target`-Zeile: gelb/OPEN, niemals falsch-gruen) — der Script-Exit bleibt
  gate-getrieben, damit lokale/CI-Laeufe durch einen Betriebszustand nicht
  brechen. Run against the current tree:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/cbm-health-goals.bats
```

  Expected: FAIL — the row does not exist yet. Record the failure in the ticket.

- [ ] **2. Implement the K3 health rows.** The retired graph.db.zst check is
  already gone upstream; add the missing K3 goals next to the existing rows:
  `G-K3FRESH` — freshness verdict from
  `python3 scripts/mcp/cbm-freshness.py status` must be `fresh` on a clean
  checkout (warnings allowed for `dirty=true`, never for `unknown`);
  `G-K3PROJ` — indexed project `home-patrick-Bachelorprojekt` present with
  node/edge counts above zero via `index_status`. Failed probes report failure,
  not green. Keep the row shape identical to the existing `G-IF*` rows so the
  website health rendering needs no changes. Known helper defects documented in
  the T900990 eval report must be fixed in `scripts/mcp/cbm-freshness.py` as
  part of this task, or `G-K3FRESH` can never leave `unknown`:
  (a) `detect_changes` is invoked without `--format json`, so the helper parses
  human-readable text (`probe-malformed`); (b) worktree `repo_path` is
  canonicalized to the main-checkout git root, so graph identity never matches
  a worktree checkout (`root-mismatch`).

- [ ] **3. Document failover semantics (D5).** In the runbook: what happens on
  CLI missing, probe timeout, failed refresh under the single-flight lock, and
  externally replaced graph database; explicit recovery steps (re-establish
  initial receipt, when `refresh_allowed` flips). Update the D5/D6 rows in
  `docs/brain/k3-code-graph.md`. Commit as
  `fix(T002430): monitor K3 freshness and document index failover`.

- [ ] **4. Final verification.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/cbm-health-goals.bats
bash scripts/plan-lint.sh .agents/plans/k3-health-monitoring/tasks.md
task test:changed; task freshness:regenerate; task freshness:check;
```
