---
title: spec-junit-shard-*-Artefakte in .gitignore aufnehmen
ticket_id: T006368
domains: [test]
status: done
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# spec-junit-shard-ignore — Implementation Plan (rekonstruiert)

BATS-Läufe erzeugen JUnit-Artefakte als `spec-junit-shard-1..4/report.xml` (untracked);
`.gitignore` kannte nur `junit-report/` (BATS_JUNIT_DIR, T003025) und
`vitest-junit-report/`. Die unignorierten Shard-Artefakte blockierten den
`worktree-clean-check` (Nicht-Allowlist-Filter) und damit Worktree-Removes. Fix:
`spec-junit-shard-*/` in die JUnit-Ignore-Zeile, verankert per BATS-Guard.

Nachhol-Archiv: Original-Change nie archiviert (Kopie im Hauptcheckout verloren).
Rekonstruiert aus PR #4570 (chore, `.gitignore`-Zeile) und PR #4563 (fix, Guard +
Inventar-Artefakte), beide gemergt auf main.

## File Structure

- `.gitignore` — Z. 9: `spec-junit-shard-*/` (JUnit-Ignore-Block, neben `junit-report/` und `vitest-junit-report/`)
- `tests/spec/dev-flow-plan/junit-shard-ignore.bats` — Guard (neu, 31 Zeilen, 2 Tests)
- `docs/code-quality/repo-index.json` — regeneriert (Guard-Test aufgenommen)
- `website/src/data/test-inventory.json` — regeneriert (Guard-Test aufgenommen)

## Task 1 — .gitignore erweitern

- [x] 1. `.gitignore`: `spec-junit-shard-*/` in den JUnit-Block aufgenommen
  (`# bats junit-Reporte (BATS_JUNIT_DIR, [T003025]) — CI-artefakt, nie committen`).
- [x] 2. Positivprobe: `git check-ignore spec-junit-shard-1/report.xml` und
  `spec-junit-shard-4/report.xml` → rc=0 (ignoriert); bestehende Muster
  (`junit-report/`, `vitest-junit-report/`) unverändert wirksam.

## Task 2 — BATS-Guard

- [x] 1. `tests/spec/dev-flow-plan/junit-shard-ignore.bats` angelegt:
  `spec-junit-shard-1/report.xml is ignored by git` und
  `spec-junit-shard-4/report.xml is ignored by git`, je `git check-ignore -q`
  gegen `$REPO_ROOT` (BATS_TEST_DIRNAME-Anker).
- [x] 2. Guard-Suite gelaufen: beide Tests grün (13 ok im worktrees-not-tracked /
  test-inventory-coverage / lockfile-drift Kontext).

## Task 3 — Verifikation

- [x] `task freshness:regenerate` + `task freshness:check` (rc=0) — repo-index.json
  und test-inventory.json committet.
- [x] CI grün (PR #4563).
