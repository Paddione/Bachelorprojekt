---
title: "mishap-incident-rollup-2026-08-22-T013303 — Mishap-Bundle"
ticket_id: T013303
---

## ADDED Requirements

### Requirement: Unit-Test drohte, Live-Rollup-Container in Prod-DB anzulegen

The rollup bundle SHALL address the mishap "Unit-Test drohte, Live-Rollup-Container in Prod-DB anzulegen" (suspicious, tests/spec/mishap-rollup).

#### Scenario: Unit-Test drohte, Live-Rollup-Container in Prod-DB anzulegen is covered by the bundle

- **GIVEN** a batch entry "Unit-Test drohte, Live-Rollup-Container in Prod-DB anzulegen" (suspicious, tests/spec/mishap-rollup) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: touched_files-Ableitung uebernimmt zitierte Pfade aus Plan-Prosa

The rollup bundle SHALL address the mishap "touched_files-Ableitung uebernimmt zitierte Pfade aus Plan-Prosa" (drift, scripts/plan-touched-files.sh).

#### Scenario: touched_files-Ableitung uebernimmt zitierte Pfade aus Plan-Prosa is covered by the bundle

- **GIVEN** a batch entry "touched_files-Ableitung uebernimmt zitierte Pfade aus Plan-Prosa" (drift, scripts/plan-touched-files.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Ticket-Claim aus dem Haupt-Checkout traegt den falschen Branch

The rollup bundle SHALL address the mishap "Ticket-Claim aus dem Haupt-Checkout traegt den falschen Branch" (process, scripts/agent-lock.sh).

#### Scenario: Ticket-Claim aus dem Haupt-Checkout traegt den falschen Branch is covered by the bundle

- **GIVEN** a batch entry "Ticket-Claim aus dem Haupt-Checkout traegt den falschen Branch" (process, scripts/agent-lock.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Toter Planner-Session-Lock erzwang --force beim Claim von feature/ki-deck-T013302

The rollup bundle SHALL address the mishap "Toter Planner-Session-Lock erzwang --force beim Claim von feature/ki-deck-T013302" (suspicious, scripts/agent-lock.sh).

#### Scenario: Toter Planner-Session-Lock erzwang --force beim Claim von feature/ki-deck-T013302 is covered by the bundle

- **GIVEN** a batch entry "Toter Planner-Session-Lock erzwang --force beim Claim von feature/ki-deck-T013302" (suspicious, scripts/agent-lock.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Plan-Staging übersah spec-gekoppelte BATS-Suiten — Factory-CI-Shard 4 rot

The rollup bundle SHALL address the mishap "Plan-Staging übersah spec-gekoppelte BATS-Suiten — Factory-CI-Shard 4 rot" (drift, openspec/plan-staging).

#### Scenario: Plan-Staging übersah spec-gekoppelte BATS-Suiten — Factory-CI-Shard 4 rot is covered by the bundle

- **GIVEN** a batch entry "Plan-Staging übersah spec-gekoppelte BATS-Suiten — Factory-CI-Shard 4 rot" (drift, openspec/plan-staging) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: MODIFIED-Deltas schnürten SSOT-Szenarien ein — Archivierung zweimal am Validator gescheitert

The rollup bundle SHALL address the mishap "MODIFIED-Deltas schnürten SSOT-Szenarien ein — Archivierung zweimal am Validator gescheitert" (drift, openspec/delta-authoring).

#### Scenario: MODIFIED-Deltas schnürten SSOT-Szenarien ein — Archivierung zweimal am Validator gescheitert is covered by the bundle

- **GIVEN** a batch entry "MODIFIED-Deltas schnürten SSOT-Szenarien ein — Archivierung zweimal am Validator gescheitert" (drift, openspec/delta-authoring) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Finalizer-Rezept erzeugte Archive-PR auf veraltetem main — DIRTY bis manueller Rebuild

The rollup bundle SHALL address the mishap "Finalizer-Rezept erzeugte Archive-PR auf veraltetem main — DIRTY bis manueller Rebuild" (suspicious, scripts/devflow-post-merge-finalize.sh).

#### Scenario: Finalizer-Rezept erzeugte Archive-PR auf veraltetem main — DIRTY bis manueller Rebuild is covered by the bundle

- **GIVEN** a batch entry "Finalizer-Rezept erzeugte Archive-PR auf veraltetem main — DIRTY bis manueller Rebuild" (suspicious, scripts/devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: openspec-embed Post-Commit-Hook timeoutet wiederholt (non-fatal, ~90s/Commit)

The rollup bundle SHALL address the mishap "openspec-embed Post-Commit-Hook timeoutet wiederholt (non-fatal, ~90s/Commit)" (degraded, scripts/hooks/openspec-embed).

#### Scenario: openspec-embed Post-Commit-Hook timeoutet wiederholt (non-fatal, ~90s/Commit) is covered by the bundle

- **GIVEN** a batch entry "openspec-embed Post-Commit-Hook timeoutet wiederholt (non-fatal, ~90s/Commit)" (degraded, scripts/hooks/openspec-embed) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Openspec-Change von T012967 nie archiviert — Plan-Scaffold nur unter Reaper-Archiv-Tag erhalten

The rollup bundle SHALL address the mishap "Openspec-Change von T012967 nie archiviert — Plan-Scaffold nur unter Reaper-Archiv-Tag erhalten" (process, openspec/plan-archival).

#### Scenario: Openspec-Change von T012967 nie archiviert — Plan-Scaffold nur unter Reaper-Archiv-Tag erhalten is covered by the bundle

- **GIVEN** a batch entry "Openspec-Change von T012967 nie archiviert — Plan-Scaffold nur unter Reaper-Archiv-Tag erhalten" (process, openspec/plan-archival) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: --only in health-goals-check.sh führte alle Messungen eager aus (Vollscan-Kosten für gezielten Rescan)

The rollup bundle SHALL address the mishap "--only in health-goals-check.sh führte alle Messungen eager aus (Vollscan-Kosten für gezielten Rescan)" (degraded, scripts).

#### Scenario: --only in health-goals-check.sh führte alle Messungen eager aus (Vollscan-Kosten für gezielten Rescan) is covered by the bundle

- **GIVEN** a batch entry "--only in health-goals-check.sh führte alle Messungen eager aus (Vollscan-Kosten für gezielten Rescan)" (degraded, scripts) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
