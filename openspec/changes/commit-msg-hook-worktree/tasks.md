---
title: commit-msg-Hook worktree-fähig machen
ticket_id: T005567
status: planning
domains: [scripts, test]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# commit-msg-hook-worktree — Implementation Plan

## File Structure

- `.githooks/commit-msg` — Guard-Skript-Auflösung mit Haupt-Checkout-Fallback (`M`)
- `.githooks/pre-commit` — gleiche Auflösung für `$repo_root/scripts/`-Referenzen (`M`)
- `.githooks/pre-push` — gleiche Auflösung für `$repo_root/scripts/`-Referenzen (`M`)
- `tests/spec/githooks-worktree-fallback.bats` — Rot-Grün-Guard (bereits committet) (`M`)

## Partials

### p1 — Hook-Resolver + Tests (Tests-Rolle)

**target_files:** `.githooks/commit-msg`, `.githooks/pre-commit`, `.githooks/pre-push`, `tests/spec/githooks-worktree-fallback.bats`

1. Rot-Beweis: Der bereits committete Test `T005567: der echte commit-msg-Hook traegt den
   Haupt-Checkout-Fallback (Querschnitts-Guard)` läuft mit dem Testrunner bats —
   **expected: FAIL** (Hook referenziert nur den Worktree-`repo_root`):
   ```bash
   ./tests/unit/lib/bats-core/bin/bats tests/spec/githooks-worktree-fallback.bats
   ```
2. `.githooks/commit-msg`: `resolve_guard()`-Helfer (Worktree zuerst, dann Haupt-Checkout via
   `git rev-parse --git-common-dir`/`..`) und alle drei Guard-Aufrufe
   (`check-commit-vs-diff.sh`, `check-fix-ticket-guard.sh`, `validate-commit-msg.sh`) darüber
   auflösen. Bei nicht auffindbarem Skript: klare Fehlermeldung statt stillem Pass.
3. `.githooks/pre-commit` und `.githooks/pre-push`: dieselbe Auflösung für alle
   `"$repo_root/scripts/..."`-Referenzen (gleiche Fehlerklasse, konsistente Härtung).
4. Grün-Nachweis: derselbe bats-Lauf endet mit `ok` für beide T005567-Tests (Status 0).
5. `bash scripts/plan-lint.sh openspec/changes/commit-msg-hook-worktree/tasks.md` → PASS
6. `bash scripts/openspec.sh validate` → PASS
7. `task test:changed; task freshness:regenerate; task freshness:check`
