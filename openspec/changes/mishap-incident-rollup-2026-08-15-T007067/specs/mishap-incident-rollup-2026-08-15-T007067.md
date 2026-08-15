---
title: "mishap-incident-rollup-2026-08-15-T007067 — Mishap-Bundle"
ticket_id: T007067
---

## ADDED Requirements

### Requirement: worktree-create.sh legt bei Fremdbranch im Hauptcheckout Worktree auf falschem Branch an

The rollup bundle SHALL address the mishap "worktree-create.sh legt bei Fremdbranch im Hauptcheckout Worktree auf falschem Branch an" (suspicious, scripts/worktree-create.sh).

#### Scenario: worktree-create.sh legt bei Fremdbranch im Hauptcheckout Worktree auf falschem Branch an is covered by the bundle

- **GIVEN** a batch entry "worktree-create.sh legt bei Fremdbranch im Hauptcheckout Worktree auf falschem Branch an" (suspicious, scripts/worktree-create.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Post-Merge-Finalize ueberspringt OpenSpec-Archiv still bei fremdem Hauptcheckout-Branch

The rollup bundle SHALL address the mishap "Post-Merge-Finalize ueberspringt OpenSpec-Archiv still bei fremdem Hauptcheckout-Branch" (suspicious, scripts/devflow-post-merge-finalize.sh).

#### Scenario: Post-Merge-Finalize ueberspringt OpenSpec-Archiv still bei fremdem Hauptcheckout-Branch is covered by the bundle

- **GIVEN** a batch entry "Post-Merge-Finalize ueberspringt OpenSpec-Archiv still bei fremdem Hauptcheckout-Branch" (suspicious, scripts/devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Post-Merge-Push auf gemergten Branch verliert Commits (2. Vorkommen, k3-messung.sh)

The rollup bundle SHALL address the mishap "Post-Merge-Push auf gemergten Branch verliert Commits (2. Vorkommen, k3-messung.sh)" (drift, repo/git-workflow).

#### Scenario: Post-Merge-Push auf gemergten Branch verliert Commits (2. Vorkommen, k3-messung.sh) is covered by the bundle

- **GIVEN** a batch entry "Post-Merge-Push auf gemergten Branch verliert Commits (2. Vorkommen, k3-messung.sh)" (drift, repo/git-workflow) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: branch-reaper meldet "Archiv-Tag konnte nicht gepusht werden", Tag liegt aber auf origin

The rollup bundle SHALL address the mishap "branch-reaper meldet "Archiv-Tag konnte nicht gepusht werden", Tag liegt aber auf origin" (suspicious, scripts/branch-reaper.sh).

#### Scenario: branch-reaper meldet "Archiv-Tag konnte nicht gepusht werden", Tag liegt aber auf origin is covered by the bundle

- **GIVEN** a batch entry "branch-reaper meldet "Archiv-Tag konnte nicht gepusht werden", Tag liegt aber auf origin" (suspicious, scripts/branch-reaper.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Plan-Code-Fehler (bad substitution, -z-Default) erst im BATS-Lauf sichtbar

The rollup bundle SHALL address the mishap "Plan-Code-Fehler (bad substitution, -z-Default) erst im BATS-Lauf sichtbar" (process, dev-flow-plan).

#### Scenario: Plan-Code-Fehler (bad substitution, -z-Default) erst im BATS-Lauf sichtbar is covered by the bundle

- **GIVEN** a batch entry "Plan-Code-Fehler (bad substitution, -z-Default) erst im BATS-Lauf sichtbar" (process, dev-flow-plan) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: plan-qa-check bewertet Index+Partials-Pläne als FAIL (liest tasks.d/ nicht)

The rollup bundle SHALL address the mishap "plan-qa-check bewertet Index+Partials-Pläne als FAIL (liest tasks.d/ nicht)" (degraded, scripts/plan-qa-check.sh).

#### Scenario: plan-qa-check bewertet Index+Partials-Pläne als FAIL (liest tasks.d/ nicht) is covered by the bundle

- **GIVEN** a batch entry "plan-qa-check bewertet Index+Partials-Pläne als FAIL (liest tasks.d/ nicht)" (degraded, scripts/plan-qa-check.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: post-commit-embed hängt bei belegtem Port 15432 und lässt git commit scheinbar fehlschlagen

The rollup bundle SHALL address the mishap "post-commit-embed hängt bei belegtem Port 15432 und lässt git commit scheinbar fehlschlagen" (degraded, .githooks/post-commit-embed).

#### Scenario: post-commit-embed hängt bei belegtem Port 15432 und lässt git commit scheinbar fehlschlagen is covered by the bundle

- **GIVEN** a batch entry "post-commit-embed hängt bei belegtem Port 15432 und lässt git commit scheinbar fehlschlagen" (degraded, .githooks/post-commit-embed) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: dev-flow-plan-Doku drifted von plan-lint/agent-lock-Kontrakten (Rollen-Literal, Claim-Flags)

The rollup bundle SHALL address the mishap "dev-flow-plan-Doku drifted von plan-lint/agent-lock-Kontrakten (Rollen-Literal, Claim-Flags)" (drift, .claude/skills/dev-flow-plan).

#### Scenario: dev-flow-plan-Doku drifted von plan-lint/agent-lock-Kontrakten (Rollen-Literal, Claim-Flags) is covered by the bundle

- **GIVEN** a batch entry "dev-flow-plan-Doku drifted von plan-lint/agent-lock-Kontrakten (Rollen-Literal, Claim-Flags)" (drift, .claude/skills/dev-flow-plan) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Rebase nach Reorg verlor openspec-status.json-Änderung still

The rollup bundle SHALL address the mishap "Rebase nach Reorg verlor openspec-status.json-Änderung still" (drift, repo/chore/plan-archive).

#### Scenario: Rebase nach Reorg verlor openspec-status.json-Änderung still is covered by the bundle

- **GIVEN** a batch entry "Rebase nach Reorg verlor openspec-status.json-Änderung still" (drift, repo/chore/plan-archive) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: mcp-postgres (localhost:13001) nicht erreichbar — DB-Abfrage via kubectl exec umgangen

The rollup bundle SHALL address the mishap "mcp-postgres (localhost:13001) nicht erreichbar — DB-Abfrage via kubectl exec umgangen" (degraded, mcp/postgres).

#### Scenario: mcp-postgres (localhost:13001) nicht erreichbar — DB-Abfrage via kubectl exec umgangen is covered by the bundle

- **GIVEN** a batch entry "mcp-postgres (localhost:13001) nicht erreichbar — DB-Abfrage via kubectl exec umgangen" (degraded, mcp/postgres) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
