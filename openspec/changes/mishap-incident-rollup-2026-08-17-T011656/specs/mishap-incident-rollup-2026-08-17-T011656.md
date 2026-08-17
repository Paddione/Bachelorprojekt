---
title: "mishap-incident-rollup-2026-08-17-T011656 — Mishap-Bundle"
ticket_id: T011656
---

## ADDED Requirements

### Requirement: git-worktree-health.sh objects meldet Befund obwohl erreichbarer Objektgraph intakt ist

The rollup bundle SHALL address the mishap "git-worktree-health.sh objects meldet Befund obwohl erreichbarer Objektgraph intakt ist" (suspicious, repo/chore/git-worktree-health).

#### Scenario: git-worktree-health.sh objects meldet Befund obwohl erreichbarer Objektgraph intakt ist is covered by the bundle

- **GIVEN** a batch entry "git-worktree-health.sh objects meldet Befund obwohl erreichbarer Objektgraph intakt ist" (suspicious, repo/chore/git-worktree-health) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Vier Change-Archive vom 2026-08-17 tragen status: active statt completed

The rollup bundle SHALL address the mishap "Vier Change-Archive vom 2026-08-17 tragen status: active statt completed" (drift, repo/chore/openspec-archive).

#### Scenario: Vier Change-Archive vom 2026-08-17 tragen status: active statt completed is covered by the bundle

- **GIVEN** a batch entry "Vier Change-Archive vom 2026-08-17 tragen status: active statt completed" (drift, repo/chore/openspec-archive) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Welle-1-Dispatch lief gegen bereits gemergte Fixes (stale Audit-Basis)

The rollup bundle SHALL address the mishap "Welle-1-Dispatch lief gegen bereits gemergte Fixes (stale Audit-Basis)" (process, infra).

#### Scenario: Welle-1-Dispatch lief gegen bereits gemergte Fixes (stale Audit-Basis) is covered by the bundle

- **GIVEN** a batch entry "Welle-1-Dispatch lief gegen bereits gemergte Fixes (stale Audit-Basis)" (process, infra) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Rollup-Container-Vermehrung: T011583 + T011656 neben aktivem T009369

The rollup bundle SHALL address the mishap "Rollup-Container-Vermehrung: T011583 + T011656 neben aktivem T009369" (drift, ticket-mcp).

#### Scenario: Rollup-Container-Vermehrung: T011583 + T011656 neben aktivem T009369 is covered by the bundle

- **GIVEN** a batch entry "Rollup-Container-Vermehrung: T011583 + T011656 neben aktivem T009369" (drift, ticket-mcp) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Verwaister Worktree für T011582: Branch nur lokal, kein Lock, Ticket unverändert triage

The rollup bundle SHALL address the mishap "Verwaister Worktree für T011582: Branch nur lokal, kein Lock, Ticket unverändert triage" (suspicious, worktrees).

#### Scenario: Verwaister Worktree für T011582: Branch nur lokal, kein Lock, Ticket unverändert triage is covered by the bundle

- **GIVEN** a batch entry "Verwaister Worktree für T011582: Branch nur lokal, kein Lock, Ticket unverändert triage" (suspicious, worktrees) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: devflow-post-merge-finalize.sh: Worktree-Pfad aus Slug statt Branch → Schritt-8-Selbstkonflikt (T008014-Klasse)

The rollup bundle SHALL address the mishap "devflow-post-merge-finalize.sh: Worktree-Pfad aus Slug statt Branch → Schritt-8-Selbstkonflikt (T008014-Klasse)" (degraded, scripts/devflow).

#### Scenario: devflow-post-merge-finalize.sh: Worktree-Pfad aus Slug statt Branch → Schritt-8-Selbstkonflikt (T008014-Klasse) is covered by the bundle

- **GIVEN** a batch entry "devflow-post-merge-finalize.sh: Worktree-Pfad aus Slug statt Branch → Schritt-8-Selbstkonflikt (T008014-Klasse)" (degraded, scripts/devflow) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: T009369-Rollup-Zyklus schloss ohne Implementierung — 10 Mishap-Fixes teilweise verloren

The rollup bundle SHALL address the mishap "T009369-Rollup-Zyklus schloss ohne Implementierung — 10 Mishap-Fixes teilweise verloren" (degraded, factory/mishap-rollup).

#### Scenario: T009369-Rollup-Zyklus schloss ohne Implementierung — 10 Mishap-Fixes teilweise verloren is covered by the bundle

- **GIVEN** a batch entry "T009369-Rollup-Zyklus schloss ohne Implementierung — 10 Mishap-Fixes teilweise verloren" (degraded, factory/mishap-rollup) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Rebase verliert test-inventory.json-Änderung auf Feature-Branches

The rollup bundle SHALL address the mishap "Rebase verliert test-inventory.json-Änderung auf Feature-Branches" (suspicious, repo/hooks).

#### Scenario: Rebase verliert test-inventory.json-Änderung auf Feature-Branches is covered by the bundle

- **GIVEN** a batch entry "Rebase verliert test-inventory.json-Änderung auf Feature-Branches" (suspicious, repo/hooks) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: check-commit-vs-diff.sh schlaegt Scope 'plan' vor, den validate-commit-msg.sh ablehnt

The rollup bundle SHALL address the mishap "check-commit-vs-diff.sh schlaegt Scope 'plan' vor, den validate-commit-msg.sh ablehnt" (drift, scripts/check-commit-vs-diff.sh).

#### Scenario: check-commit-vs-diff.sh schlaegt Scope 'plan' vor, den validate-commit-msg.sh ablehnt is covered by the bundle

- **GIVEN** a batch entry "check-commit-vs-diff.sh schlaegt Scope 'plan' vor, den validate-commit-msg.sh ablehnt" (drift, scripts/check-commit-vs-diff.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Zwei Sessions reparierten denselben roten main parallel — eine Arbeit war umsonst

The rollup bundle SHALL address the mishap "Zwei Sessions reparierten denselben roten main parallel — eine Arbeit war umsonst" (process, skills/git-workflow).

#### Scenario: Zwei Sessions reparierten denselben roten main parallel — eine Arbeit war umsonst is covered by the bundle

- **GIVEN** a batch entry "Zwei Sessions reparierten denselben roten main parallel — eine Arbeit war umsonst" (process, skills/git-workflow) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
