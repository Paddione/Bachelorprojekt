---
title: "mishap-incident-rollup-2026-08-18-T012402 — Mishap-Bundle"
ticket_id: T012402
---

## ADDED Requirements

### Requirement: out/ aus flux-render-artifact.sh ist nicht gitignored — dauerhaft untracked im Hauptcheckout

The rollup bundle SHALL address the mishap "out/ aus flux-render-artifact.sh ist nicht gitignored — dauerhaft untracked im Hauptcheckout" (drift, scripts/flux-render-artifact.sh).

#### Scenario: out/ aus flux-render-artifact.sh ist nicht gitignored — dauerhaft untracked im Hauptcheckout is covered by the bundle

- **GIVEN** a batch entry "out/ aus flux-render-artifact.sh ist nicht gitignored — dauerhaft untracked im Hauptcheckout" (drift, scripts/flux-render-artifact.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: DB-Funktion Drift: fn_purge_test_data Marker fehlt

The rollup bundle SHALL address the mishap "DB-Funktion Drift: fn_purge_test_data Marker fehlt" (drift, database/functions).

#### Scenario: DB-Funktion Drift: fn_purge_test_data Marker fehlt is covered by the bundle

- **GIVEN** a batch entry "DB-Funktion Drift: fn_purge_test_data Marker fehlt" (drift, database/functions) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Staler Worktree nach Merge nicht aufgeraeumt

The rollup bundle SHALL address the mishap "Staler Worktree nach Merge nicht aufgeraeumt" (drift, repo/worktrees).

#### Scenario: Staler Worktree nach Merge nicht aufgeraeumt is covered by the bundle

- **GIVEN** a batch entry "Staler Worktree nach Merge nicht aufgeraeumt" (drift, repo/worktrees) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: PR #4766 Konflikte + CI-Failures blockieren Factory

The rollup bundle SHALL address the mishap "PR #4766 Konflikte + CI-Failures blockieren Factory" (degraded, repo/pr).

#### Scenario: PR #4766 Konflikte + CI-Failures blockieren Factory is covered by the bundle

- **GIVEN** a batch entry "PR #4766 Konflikte + CI-Failures blockieren Factory" (degraded, repo/pr) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: DB-Drift: fn_purge_test_data traegt Migration-Marker nicht

The rollup bundle SHALL address the mishap "DB-Drift: fn_purge_test_data traegt Migration-Marker nicht" (drift, db/functions).

#### Scenario: DB-Drift: fn_purge_test_data traegt Migration-Marker nicht is covered by the bundle

- **GIVEN** a batch entry "DB-Drift: fn_purge_test_data traegt Migration-Marker nicht" (drift, db/functions) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: branch-reaper entscheidet nach Ticket-DB-Drop auf einem toten Signal

The rollup bundle SHALL address the mishap "branch-reaper entscheidet nach Ticket-DB-Drop auf einem toten Signal" (degraded, scripts/branch-reaper.sh).

#### Scenario: branch-reaper entscheidet nach Ticket-DB-Drop auf einem toten Signal is covered by the bundle

- **GIVEN** a batch entry "branch-reaper entscheidet nach Ticket-DB-Drop auf einem toten Signal" (degraded, scripts/branch-reaper.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Code-Review-Gate ist wirkungslos: Workflow aktiviert Auto-Merge vor dem Review

The rollup bundle SHALL address the mishap "Code-Review-Gate ist wirkungslos: Workflow aktiviert Auto-Merge vor dem Review" (degraded, .github/workflows/auto-enable-automerge.yml).

#### Scenario: Code-Review-Gate ist wirkungslos: Workflow aktiviert Auto-Merge vor dem Review is covered by the bundle

- **GIVEN** a batch entry "Code-Review-Gate ist wirkungslos: Workflow aktiviert Auto-Merge vor dem Review" (degraded, .github/workflows/auto-enable-automerge.yml) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: post-merge-finalize bricht bei archive-plan ab, wenn der Branch nur im Worktree lebt

The rollup bundle SHALL address the mishap "post-merge-finalize bricht bei archive-plan ab, wenn der Branch nur im Worktree lebt" (degraded, scripts/devflow-post-merge-finalize.sh).

#### Scenario: post-merge-finalize bricht bei archive-plan ab, wenn der Branch nur im Worktree lebt is covered by the bundle

- **GIVEN** a batch entry "post-merge-finalize bricht bei archive-plan ab, wenn der Branch nur im Worktree lebt" (degraded, scripts/devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Pfad-Guard sieht weder OVERVIEW.md noch skill-relative Markdown-Links

The rollup bundle SHALL address the mishap "Pfad-Guard sieht weder OVERVIEW.md noch skill-relative Markdown-Links" (drift, tests/spec/agent-skills/skill-path-references.bats).

#### Scenario: Pfad-Guard sieht weder OVERVIEW.md noch skill-relative Markdown-Links is covered by the bundle

- **GIVEN** a batch entry "Pfad-Guard sieht weder OVERVIEW.md noch skill-relative Markdown-Links" (drift, tests/spec/agent-skills/skill-path-references.bats) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Worktree-Isolationsguard lehnt Redirects und Prozess-Substitution als "too complex" ab

The rollup bundle SHALL address the mishap "Worktree-Isolationsguard lehnt Redirects und Prozess-Substitution als "too complex" ab" (process, harness/worktree-isolation-guard).

#### Scenario: Worktree-Isolationsguard lehnt Redirects und Prozess-Substitution als "too complex" ab is covered by the bundle

- **GIVEN** a batch entry "Worktree-Isolationsguard lehnt Redirects und Prozess-Substitution als "too complex" ab" (process, harness/worktree-isolation-guard) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
