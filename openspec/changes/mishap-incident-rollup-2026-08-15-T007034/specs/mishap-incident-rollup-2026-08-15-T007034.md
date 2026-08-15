---
title: "mishap-incident-rollup-2026-08-15-T007034 — Mishap-Bundle"
ticket_id: T007034
---

## ADDED Requirements

### Requirement: task test:changed lief fremde Changes mit (origin/main zog während der Chore vor)

The rollup bundle SHALL address the mishap "task test:changed lief fremde Changes mit (origin/main zog während der Chore vor)" (suspicious, tasks/test:changed).

#### Scenario: task test:changed lief fremde Changes mit (origin/main zog während der Chore vor) is covered by the bundle

- **GIVEN** a batch entry "task test:changed lief fremde Changes mit (origin/main zog während der Chore vor)" (suspicious, tasks/test:changed) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Factory-Tick startet leer — verwaiste dirty Worktrees blockieren eigene Guard (worktree_failed ×6)

The rollup bundle SHALL address the mishap "Factory-Tick startet leer — verwaiste dirty Worktrees blockieren eigene Guard (worktree_failed ×6)" (drift, factory).

#### Scenario: Factory-Tick startet leer — verwaiste dirty Worktrees blockieren eigene Guard (worktree_failed ×6) is covered by the bundle

- **GIVEN** a batch entry "Factory-Tick startet leer — verwaiste dirty Worktrees blockieren eigene Guard (worktree_failed ×6)" (drift, factory) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Doku-Drift: ticket_links kind='pr' mit Self-Link trotz "nie für PR-Referenzen"-Regel

The rollup bundle SHALL address the mishap "Doku-Drift: ticket_links kind='pr' mit Self-Link trotz "nie für PR-Referenzen"-Regel" (drift, skills/ticket-ops).

#### Scenario: Doku-Drift: ticket_links kind='pr' mit Self-Link trotz "nie für PR-Referenzen"-Regel is covered by the bundle

- **GIVEN** a batch entry "Doku-Drift: ticket_links kind='pr' mit Self-Link trotz "nie für PR-Referenzen"-Regel" (drift, skills/ticket-ops) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: plan-lint: Partials-Header-Zeile mit tasks.d/-Literal wird als Datenzeile geparst

The rollup bundle SHALL address the mishap "plan-lint: Partials-Header-Zeile mit tasks.d/-Literal wird als Datenzeile geparst" (process, plan-lint).

#### Scenario: plan-lint: Partials-Header-Zeile mit tasks.d/-Literal wird als Datenzeile geparst is covered by the bundle

- **GIVEN** a batch entry "plan-lint: Partials-Header-Zeile mit tasks.d/-Literal wird als Datenzeile geparst" (process, plan-lint) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: D2: depends_on-Kurzformen in Skill-Beispielen führen zu plan-lint-Fehlalarmen

The rollup bundle SHALL address the mishap "D2: depends_on-Kurzformen in Skill-Beispielen führen zu plan-lint-Fehlalarmen" (process, dev-flow-plan docs).

#### Scenario: D2: depends_on-Kurzformen in Skill-Beispielen führen zu plan-lint-Fehlalarmen is covered by the bundle

- **GIVEN** a batch entry "D2: depends_on-Kurzformen in Skill-Beispielen führen zu plan-lint-Fehlalarmen" (process, dev-flow-plan docs) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Rollup-Container-Zyklus: Container wird pro Batch geschlossen + neu angelegt — Doku sagt „wird niemals geschlossen"

The rollup bundle SHALL address the mishap "Rollup-Container-Zyklus: Container wird pro Batch geschlossen + neu angelegt — Doku sagt „wird niemals geschlossen"" (drift, skills/mishap-tracker).

#### Scenario: Rollup-Container-Zyklus: Container wird pro Batch geschlossen + neu angelegt — Doku sagt „wird niemals geschlossen" is covered by the bundle

- **GIVEN** a batch entry "Rollup-Container-Zyklus: Container wird pro Batch geschlossen + neu angelegt — Doku sagt „wird niemals geschlossen"" (drift, skills/mishap-tracker) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Rollup-Pipeline ~1h blockiert: plan-lint P2 auf Batch-Beispielen + Lock-Leak im cleanup_wt-Trap — Selbstheilung erst nach Generator-Fix

The rollup bundle SHALL address the mishap "Rollup-Pipeline ~1h blockiert: plan-lint P2 auf Batch-Beispielen + Lock-Leak im cleanup_wt-Trap — Selbstheilung erst nach Generator-Fix" (suspicious, scripts/factory/mishap-rollup.sh).

#### Scenario: Rollup-Pipeline ~1h blockiert: plan-lint P2 auf Batch-Beispielen + Lock-Leak im cleanup_wt-Trap — Selbstheilung erst nach Generator-Fix is covered by the bundle

- **GIVEN** a batch entry "Rollup-Pipeline ~1h blockiert: plan-lint P2 auf Batch-Beispielen + Lock-Leak im cleanup_wt-Trap — Selbstheilung erst nach Generator-Fix" (suspicious, scripts/factory/mishap-rollup.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Übernommener Worktree stand auf Scratch-Branch — Commits landeten auf falschem Branch

The rollup bundle SHALL address the mishap "Übernommener Worktree stand auf Scratch-Branch — Commits landeten auf falschem Branch" (suspicious, skills/git-workflow).

#### Scenario: Übernommener Worktree stand auf Scratch-Branch — Commits landeten auf falschem Branch is covered by the bundle

- **GIVEN** a batch entry "Übernommener Worktree stand auf Scratch-Branch — Commits landeten auf falschem Branch" (suspicious, skills/git-workflow) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: T007035 done/shipped trotz offenem PR #4640 (BLOCKED) — Workflow-Fix nicht auf main

The rollup bundle SHALL address the mishap "T007035 done/shipped trotz offenem PR #4640 (BLOCKED) — Workflow-Fix nicht auf main" (drift, tickets/merge-closure).

#### Scenario: T007035 done/shipped trotz offenem PR #4640 (BLOCKED) — Workflow-Fix nicht auf main is covered by the bundle

- **GIVEN** a batch entry "T007035 done/shipped trotz offenem PR #4640 (BLOCKED) — Workflow-Fix nicht auf main" (drift, tickets/merge-closure) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: OpenSpec-Archive für manuell gemergte PRs (T006369/T006371) laufen nicht

The rollup bundle SHALL address the mishap "OpenSpec-Archive für manuell gemergte PRs (T006369/T006371) laufen nicht" (drift, scripts/devflow-post-merge-finalize.sh).

#### Scenario: OpenSpec-Archive für manuell gemergte PRs (T006369/T006371) laufen nicht is covered by the bundle

- **GIVEN** a batch entry "OpenSpec-Archive für manuell gemergte PRs (T006369/T006371) laufen nicht" (drift, scripts/devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
