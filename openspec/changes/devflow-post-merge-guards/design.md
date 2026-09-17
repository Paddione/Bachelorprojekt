---
ticket_id: null
plan_ref: null
status: active
date: 2026-09-17
---

# Design: devflow-post-merge-guards (T900096)

## Kontext

`scripts/devflow-post-merge-finalize.sh` (811 Zeilen) finalisiert gemergte
Ticket-PRs: Ticket-`done`, Plan-Archiv, OpenSpec-Archiv + Archiv-PR (Schritt 8),
Lock-Release, Worktree-Remove, Branch-Delete (Schritt 10, lokal + via
`scripts/branch-reaper.sh` remote). SSOT: `openspec/specs/agent-skills.md`
(Z. 1204–1631). Absicherung: `tests/spec/agent-skills/post-merge-finalize-guards.bats`
(Source-Grep-PRÜFMODUS, dokumentierte DB-Ausnahme), `finalize-hardening.bats`,
`archive-staged-scope.bats`, `tests/spec/ci-cd/branch-reaper*.bats`.

## Ausgangslage auf dem übernommenen Branch

`fix/devflow-post-merge-guards-T900096` (fremde Session, Lock frei,
User-Entscheid: übernehmen + korrigieren) enthält einen Commit mit zwei Hunks:

1. Reaper-Ancestor-Guard (`merge-base --is-ancestor` remote/main) — korrekt,
   wird per Spec + Test festgeschrieben.
2. Befund-2-„Fix" via `git checkout -- .` + `git clean -fd` nach `checkout -B` —
   destruktiv (verwirft fremde uncommittete Arbeit, z. B. aktuell untracktes
   `openspec/changes/batch-win-tooling/`), widerspricht dem Ticket
   („ausschließlich Archiv-Pfade committen **oder abbrechen**"). Wird durch
   Dirty-Tree-Abbruch ersetzt.

Offen außerdem: lokaler `branch -D` (`finalize.sh:776`) ohne
Ungemergt-Prüfung — der eigentliche Befund-1-Vektor.

## Entscheidung

- Befund 2: **fail-closed Abbruch** (kein Stash, kein Discard, kein
  Scope-Narrowing der `docs/*`-Allowlist — die bleibt zweites Netz via
  `archive_assert_staged_scope`). Begründung: Stash versteckt fremde Arbeit in
  einem fremden Lauf; Discard vernichtet; Allowlist-Narrowing bricht legitime
  Archiv-Commits. Abbruch mit FATAL + Pfadliste ist deterministisch und
  operator-seitig auflösbar.
- Befund 1 lokal: `git log origin/main..<branch>`-Leere nach Fetch (alternativ
  `merge-base --is-ancestor`); bei Treffern `mark_warn` + Skip statt Delete.
  Konsistent zum übernommenen Reaper-Guard (gleiche Semantik, andere Ebene).
- Tests: neuer File `tests/spec/agent-skills/post-merge-finalize-t900096.bats`
  im Guards-Stil; Reaper-Ancestor als Runtime-Test prüfen (Sandbox), sonst
  Source-Grep mit Anker.

## Nicht-Ziele

- Kein Umbau der Archiv-Sektion, kein Touch an `branch-reaper`-Allowlist-Logik,
  keine Änderung am Fremd-Commit (Korrektur als neue Commits, Historie bleibt).
