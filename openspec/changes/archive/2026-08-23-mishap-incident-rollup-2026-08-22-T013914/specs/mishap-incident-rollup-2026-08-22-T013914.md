---
title: "mishap-incident-rollup-2026-08-22-T013914 — Mishap-Bundle"
ticket_id: T013914
---

## ADDED Requirements

### Requirement: routing-check FEHLT für gemma12-vision — GPU-Loadout heute nicht geladen

The rollup bundle SHALL address the mishap "routing-check FEHLT für gemma12-vision — GPU-Loadout heute nicht geladen" (drift, llm-proxy).

#### Scenario: routing-check FEHLT für gemma12-vision — GPU-Loadout heute nicht geladen is covered by the bundle

- **GIVEN** a batch entry "routing-check FEHLT für gemma12-vision — GPU-Loadout heute nicht geladen" (drift, llm-proxy) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Drei plan_staged Mishap-Rollup-Container akkumulieren gleichzeitig

The rollup bundle SHALL address the mishap "Drei plan_staged Mishap-Rollup-Container akkumulieren gleichzeitig" (suspicious, factory/mishap-rollup).

#### Scenario: Drei plan_staged Mishap-Rollup-Container akkumulieren gleichzeitig is covered by the bundle

- **GIVEN** a batch entry "Drei plan_staged Mishap-Rollup-Container akkumulieren gleichzeitig" (suspicious, factory/mishap-rollup) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: export_ticket_timeline exitiert mit rc=3 statt Timeline zu liefern

The rollup bundle SHALL address the mishap "export_ticket_timeline exitiert mit rc=3 statt Timeline zu liefern" (degraded, ticket-mcp).

#### Scenario: export_ticket_timeline exitiert mit rc=3 statt Timeline zu liefern is covered by the bundle

- **GIVEN** a batch entry "export_ticket_timeline exitiert mit rc=3 statt Timeline zu liefern" (degraded, ticket-mcp) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Factory-Dispatcher: drei parallele Runs kollidierten auf Slot 1

The rollup bundle SHALL address the mishap "Factory-Dispatcher: drei parallele Runs kollidierten auf Slot 1" (degraded, factory).

#### Scenario: Factory-Dispatcher: drei parallele Runs kollidierten auf Slot 1 is covered by the bundle

- **GIVEN** a batch entry "Factory-Dispatcher: drei parallele Runs kollidierten auf Slot 1" (degraded, factory) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Factory-Tick hing nach abgebrochenen Runs (wakeup wartete endlos auf auto-close-merged)

The rollup bundle SHALL address the mishap "Factory-Tick hing nach abgebrochenen Runs (wakeup wartete endlos auf auto-close-merged)" (degraded, factory).

#### Scenario: Factory-Tick hing nach abgebrochenen Runs (wakeup wartete endlos auf auto-close-merged) is covered by the bundle

- **GIVEN** a batch entry "Factory-Tick hing nach abgebrochenen Runs (wakeup wartete endlos auf auto-close-merged)" (degraded, factory) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Worktree t013036-large-files zeigt auf fehlenden Commit (fsck missing commit)

The rollup bundle SHALL address the mishap "Worktree t013036-large-files zeigt auf fehlenden Commit (fsck missing commit)" (suspicious, repo).

#### Scenario: Worktree t013036-large-files zeigt auf fehlenden Commit (fsck missing commit) is covered by the bundle

- **GIVEN** a batch entry "Worktree t013036-large-files zeigt auf fehlenden Commit (fsck missing commit)" (suspicious, repo) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Mishap-Rollup-Serie vermehrt sich: 14 identische Container gleichzeitig in der Factory-Queue

The rollup bundle SHALL address the mishap "Mishap-Rollup-Serie vermehrt sich: 14 identische Container gleichzeitig in der Factory-Queue" (drift, ticket-system/mishap-rollup).

#### Scenario: Mishap-Rollup-Serie vermehrt sich: 14 identische Container gleichzeitig in der Factory-Queue is covered by the bundle

- **GIVEN** a batch entry "Mishap-Rollup-Serie vermehrt sich: 14 identische Container gleichzeitig in der Factory-Queue" (drift, ticket-system/mishap-rollup) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: G-BRAIN14 misst Manifestgröße statt Pending-Backlog — Goal-Kennzahl strukturell defekt

The rollup bundle SHALL address the mishap "G-BRAIN14 misst Manifestgröße statt Pending-Backlog — Goal-Kennzahl strukturell defekt" (drift, repo/scripts/health-goals-check).

#### Scenario: G-BRAIN14 misst Manifestgröße statt Pending-Backlog — Goal-Kennzahl strukturell defekt is covered by the bundle

- **GIVEN** a batch entry "G-BRAIN14 misst Manifestgröße statt Pending-Backlog — Goal-Kennzahl strukturell defekt" (drift, repo/scripts/health-goals-check) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: brain-ingest Delivery bricht mit non-fast-forward, wenn zwei Läufe konkurrieren

The rollup bundle SHALL address the mishap "brain-ingest Delivery bricht mit non-fast-forward, wenn zwei Läufe konkurrieren" (degraded, scripts/brain-ingest).

#### Scenario: brain-ingest Delivery bricht mit non-fast-forward, wenn zwei Läufe konkurrieren is covered by the bundle

- **GIVEN** a batch entry "brain-ingest Delivery bricht mit non-fast-forward, wenn zwei Läufe konkurrieren" (degraded, scripts/brain-ingest) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Bash-Ergebnis verschwindet bei Parallel-Call mit skill-/MCP-Tool

The rollup bundle SHALL address the mishap "Bash-Ergebnis verschwindet bei Parallel-Call mit skill-/MCP-Tool" (suspicious, opencode-harness/tool-parallelism).

#### Scenario: Bash-Ergebnis verschwindet bei Parallel-Call mit skill-/MCP-Tool is covered by the bundle

- **GIVEN** a batch entry "Bash-Ergebnis verschwindet bei Parallel-Call mit skill-/MCP-Tool" (suspicious, opencode-harness/tool-parallelism) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
