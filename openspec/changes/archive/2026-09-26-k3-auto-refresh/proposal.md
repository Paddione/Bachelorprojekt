# Proposal: k3-auto-refresh

## Why

K3 (codebase-memory code graph, 97k nodes / 228k edges) refreshes only by
hand: `task codebase:index` / `codebase:refresh` have no caller — no
scheduler, no CI trigger, no hook installed in this checkout. Agents read a
silently stale graph, and every parallel session that notices drift fires
its own full reindex (2026-08-24: load 54.5, 8 workers, stampede loop).
Epic T900447 (ADR-009) makes the graph the precision layer — a precision
layer needs a freshness contract, not manual snapshots.

## What Changes

- New periodic refresh job `scripts/cbm-refresh-cron.sh` (cron shape after
  `scripts/repo-hygiene-cron.sh`): skip-if-fresh pre-gate via `index_status`
  / `detect_changes`, refresh through the single-flight wrapper, JSON
  metrics on stdout, logs on stderr, cron entry in the header.
- New single-flight wrapper `scripts/mcp/cbm-single-flight.sh`: flock on a
  lockfile in `~/.cache/codebase-memory-mcp/`, serializes all
  script-driven `index_repository` calls per repo path; `mkdir -p`
  fail-safe. Fulfills the SHALL in
  `openspec/specs/agentic-tooling-quality-goals.md:322` (T016447, design
  reused from archived change `2026-09-17-cbm-index-single-flight`).
- `task codebase:index` / `codebase:refresh` route through the wrapper
  (same behavior + serialization, no collision with 1/6 or 2/6).
- New runbook `docs/runbooks/cbm-index-stampede.md` (acute mitigation +
  prevention); `docs/brain/k3-code-graph.md` refreshed (Aug 2026 state is
  stale: persistence, projects, trigger).
- New guard `tests/spec/cbm-stampede-guard.bats` (static checks).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `openspec/specs/brain-k3-code-graph.md`: trigger becomes periodic
  auto-refresh (REQ-k3-02 coverage extended, REQ-k3-05 added).

## Impact

- New: 2 scripts + runbook + guard. Touched: `Taskfile.yml` (2 tasks),
  `docs/brain/k3-code-graph.md`.
- Machine-local only (`~/.cache`, user crontab) — no CI, no cluster, no
  brand runtime change.
- `.githooks/post-merge` untouched: periodic covers all merge paths
  including GitHub squash; the hook stays as-is.
- Known non-goal: binary/npx version drift (v0.9.0 vs 0.10.8) →
  follow-up, not this change.

_Ticket: T900450_
