---
title: "mishap-incident-rollup-2026-08-22-T013316 — Mishap-Bundle"
ticket_id: T013316
---

## ADDED Requirements

### Requirement: Delegation für Review-/Finalizer-Subagenten im Subagent-Kontext unbrauchbar

The rollup bundle SHALL address the mishap "Delegation für Review-/Finalizer-Subagenten im Subagent-Kontext unbrauchbar" (process, infra).

#### Scenario: Delegation für Review-/Finalizer-Subagenten im Subagent-Kontext unbrauchbar is covered by the bundle

- **GIVEN** a batch entry "Delegation für Review-/Finalizer-Subagenten im Subagent-Kontext unbrauchbar" (process, infra) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Finalizer-Schritt 7 scheitert, wenn Plan-Datei nur im Worktree liegt

The rollup bundle SHALL address the mishap "Finalizer-Schritt 7 scheitert, wenn Plan-Datei nur im Worktree liegt" (process, scripts).

#### Scenario: Finalizer-Schritt 7 scheitert, wenn Plan-Datei nur im Worktree liegt is covered by the bundle

- **GIVEN** a batch entry "Finalizer-Schritt 7 scheitert, wenn Plan-Datei nur im Worktree liegt" (process, scripts) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: svelte-check in components/website nicht installiert — Plan-Verifikationsschritt nicht ausführbar

The rollup bundle SHALL address the mishap "svelte-check in components/website nicht installiert — Plan-Verifikationsschritt nicht ausführbar" (process, website).

#### Scenario: svelte-check in components/website nicht installiert — Plan-Verifikationsschritt nicht ausführbar is covered by the bundle

- **GIVEN** a batch entry "svelte-check in components/website nicht installiert — Plan-Verifikationsschritt nicht ausführbar" (process, website) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Bekannte Worktree/Test-Frictions: SID-Drift, BATS stderr-Mixing, pnpm-TTY-Abbruch, commitlint-Scopes

The rollup bundle SHALL address the mishap "Bekannte Worktree/Test-Frictions: SID-Drift, BATS stderr-Mixing, pnpm-TTY-Abbruch, commitlint-Scopes" (process, scripts).

#### Scenario: Bekannte Worktree/Test-Frictions: SID-Drift, BATS stderr-Mixing, pnpm-TTY-Abbruch, commitlint-Scopes is covered by the bundle

- **GIVEN** a batch entry "Bekannte Worktree/Test-Frictions: SID-Drift, BATS stderr-Mixing, pnpm-TTY-Abbruch, commitlint-Scopes" (process, scripts) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: freshness:regenerate erzeugt Kollateral-Drift an .opencode/package.json

The rollup bundle SHALL address the mishap "freshness:regenerate erzeugt Kollateral-Drift an .opencode/package.json" (drift, Taskfile freshness:regenerate).

#### Scenario: freshness:regenerate erzeugt Kollateral-Drift an .opencode/package.json is covered by the bundle

- **GIVEN** a batch entry "freshness:regenerate erzeugt Kollateral-Drift an .opencode/package.json" (drift, Taskfile freshness:regenerate) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Flaky G-CD03 --self-test in CI-Spec-Shards (PR #4959)

The rollup bundle SHALL address the mishap "Flaky G-CD03 --self-test in CI-Spec-Shards (PR #4959)" (suspicious, tests/spec health-goals G-CD03).

#### Scenario: Flaky G-CD03 --self-test in CI-Spec-Shards (PR #4959) is covered by the bundle

- **GIVEN** a batch entry "Flaky G-CD03 --self-test in CI-Spec-Shards (PR #4959)" (suspicious, tests/spec health-goals G-CD03) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: agent-lock.sh claim aus Subshell erzeugt SID, die ticket.sh als fremde Session wertet

The rollup bundle SHALL address the mishap "agent-lock.sh claim aus Subshell erzeugt SID, die ticket.sh als fremde Session wertet" (degraded, scripts/agent-lock.sh).

#### Scenario: agent-lock.sh claim aus Subshell erzeugt SID, die ticket.sh als fremde Session wertet is covered by the bundle

- **GIVEN** a batch entry "agent-lock.sh claim aus Subshell erzeugt SID, die ticket.sh als fremde Session wertet" (degraded, scripts/agent-lock.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: test(mishap-rollup)-Scope fehlt in der test:changed-Allowlist

The rollup bundle SHALL address the mishap "test(mishap-rollup)-Scope fehlt in der test:changed-Allowlist" (degraded, task test:changed / find-changed-tests).

#### Scenario: test(mishap-rollup)-Scope fehlt in der test:changed-Allowlist is covered by the bundle

- **GIVEN** a batch entry "test(mishap-rollup)-Scope fehlt in der test:changed-Allowlist" (degraded, task test:changed / find-changed-tests) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Ad-hoc git-worktree-Parsing entfernte das falsche Worktree (selbst korrigiert)

The rollup bundle SHALL address the mishap "Ad-hoc git-worktree-Parsing entfernte das falsche Worktree (selbst korrigiert)" (suspicious, scripts/hygiene worktree cleanup).

#### Scenario: Ad-hoc git-worktree-Parsing entfernte das falsche Worktree (selbst korrigiert) is covered by the bundle

- **GIVEN** a batch entry "Ad-hoc git-worktree-Parsing entfernte das falsche Worktree (selbst korrigiert)" (suspicious, scripts/hygiene worktree cleanup) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Rollup-Eskalation scannt fremde Pläne über Worktree-Namen — False-Positive-needs_human-Tickets

The rollup bundle SHALL address the mishap "Rollup-Eskalation scannt fremde Pläne über Worktree-Namen — False-Positive-needs_human-Tickets" (degraded, scripts/factory/rollup-carryover.sh).

#### Scenario: Rollup-Eskalation scannt fremde Pläne über Worktree-Namen — False-Positive-needs_human-Tickets is covered by the bundle

- **GIVEN** a batch entry "Rollup-Eskalation scannt fremde Pläne über Worktree-Namen — False-Positive-needs_human-Tickets" (degraded, scripts/factory/rollup-carryover.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
