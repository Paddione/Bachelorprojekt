---
title: "mishap-incident-rollup-2026-08-22-T013107 — Mishap-Bundle"
ticket_id: T013107
---

## ADDED Requirements

### Requirement: G-GIT03: Zielwert in goals.md und im Pruefskript widersprechen sich

The rollup bundle SHALL address the mishap "G-GIT03: Zielwert in goals.md und im Pruefskript widersprechen sich" (drift, health-goals/G-GIT03).

#### Scenario: G-GIT03: Zielwert in goals.md und im Pruefskript widersprechen sich is covered by the bundle

- **GIVEN** a batch entry "G-GIT03: Zielwert in goals.md und im Pruefskript widersprechen sich" (drift, health-goals/G-GIT03) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: devflow-post-merge-finalize entfernt den Worktree, in dem die aufrufende Session laeuft

The rollup bundle SHALL address the mishap "devflow-post-merge-finalize entfernt den Worktree, in dem die aufrufende Session laeuft" (degraded, scripts/devflow-post-merge-finalize.sh).

#### Scenario: devflow-post-merge-finalize entfernt den Worktree, in dem die aufrufende Session laeuft is covered by the bundle

- **GIVEN** a batch entry "devflow-post-merge-finalize entfernt den Worktree, in dem die aufrufende Session laeuft" (degraded, scripts/devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: vda.sh frontmatter leitete domains: [db] fuer einen reinen Factory-Change ab

The rollup bundle SHALL address the mishap "vda.sh frontmatter leitete domains: [db] fuer einen reinen Factory-Change ab" (suspicious, scripts/vda.sh frontmatter).

#### Scenario: vda.sh frontmatter leitete domains: [db] fuer einen reinen Factory-Change ab is covered by the bundle

- **GIVEN** a batch entry "vda.sh frontmatter leitete domains: [db] fuer einen reinen Factory-Change ab" (suspicious, scripts/vda.sh frontmatter) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: post-merge-finalize scheitert an Schritt 7, wenn der lokale main den gemergten Plan noch nicht hat

The rollup bundle SHALL address the mishap "post-merge-finalize scheitert an Schritt 7, wenn der lokale main den gemergten Plan noch nicht hat" (degraded, scripts/devflow-post-merge-finalize.sh).

#### Scenario: post-merge-finalize scheitert an Schritt 7, wenn der lokale main den gemergten Plan noch nicht hat is covered by the bundle

- **GIVEN** a batch entry "post-merge-finalize scheitert an Schritt 7, wenn der lokale main den gemergten Plan noch nicht hat" (degraded, scripts/devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: rollup-container resolving ohne Brand-Filter: mentolder-Generator erhaelt korczewski-Container T013107

The rollup bundle SHALL address the mishap "rollup-container resolving ohne Brand-Filter: mentolder-Generator erhaelt korczewski-Container T013107" (degraded, scripts/ticket.sh).

#### Scenario: rollup-container resolving ohne Brand-Filter: mentolder-Generator erhaelt korczewski-Container T013107 is covered by the bundle

- **GIVEN** a batch entry "rollup-container resolving ohne Brand-Filter: mentolder-Generator erhaelt korczewski-Container T013107" (degraded, scripts/ticket.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: SCS post-commit Reindex schlägt für alle geänderten Dateien fehl (embed localhost:8081 unerreichbar)

The rollup bundle SHALL address the mishap "SCS post-commit Reindex schlägt für alle geänderten Dateien fehl (embed localhost:8081 unerreichbar)" (degraded, repo/scripts/scs-hooks).

#### Scenario: SCS post-commit Reindex schlägt für alle geänderten Dateien fehl (embed localhost:8081 unerreichbar) is covered by the bundle

- **GIVEN** a batch entry "SCS post-commit Reindex schlägt für alle geänderten Dateien fehl (embed localhost:8081 unerreichbar)" (degraded, repo/scripts/scs-hooks) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: pnpm test:unit scheitert non-interaktiv an NO_TTY-Purge-Abfrage (Workaround CI=true)

The rollup bundle SHALL address the mishap "pnpm test:unit scheitert non-interaktiv an NO_TTY-Purge-Abfrage (Workaround CI=true)" (suspicious, components/website).

#### Scenario: pnpm test:unit scheitert non-interaktiv an NO_TTY-Purge-Abfrage (Workaround CI=true) is covered by the bundle

- **GIVEN** a batch entry "pnpm test:unit scheitert non-interaktiv an NO_TTY-Purge-Abfrage (Workaround CI=true)" (suspicious, components/website) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: 11 Unit-Test-Fails auf main: ki-services-wiring, openspec search/save-proposal, e2e-marker-hygiene

The rollup bundle SHALL address the mishap "11 Unit-Test-Fails auf main: ki-services-wiring, openspec search/save-proposal, e2e-marker-hygiene" (degraded, components/website/tests).

#### Scenario: 11 Unit-Test-Fails auf main: ki-services-wiring, openspec search/save-proposal, e2e-marker-hygiene is covered by the bundle

- **GIVEN** a batch entry "11 Unit-Test-Fails auf main: ki-services-wiring, openspec search/save-proposal, e2e-marker-hygiene" (degraded, components/website/tests) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Zwei Sessions racen auf gleichem PR-Branch ohne Agent-Lock (T013218/#4946)

The rollup bundle SHALL address the mishap "Zwei Sessions racen auf gleichem PR-Branch ohne Agent-Lock (T013218/#4946)" (suspicious, process/agent-coordination).

#### Scenario: Zwei Sessions racen auf gleichem PR-Branch ohne Agent-Lock (T013218/#4946) is covered by the bundle

- **GIVEN** a batch entry "Zwei Sessions racen auf gleichem PR-Branch ohne Agent-Lock (T013218/#4946)" (suspicious, process/agent-coordination) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: BATS-Gather blockiert: kommentarloser setup()-Body in container-resolution.bats ist Syntaxfehler

The rollup bundle SHALL address the mishap "BATS-Gather blockiert: kommentarloser setup()-Body in container-resolution.bats ist Syntaxfehler" (degraded, tests/spec/mishap-rollup).

#### Scenario: BATS-Gather blockiert: kommentarloser setup()-Body in container-resolution.bats ist Syntaxfehler is covered by the bundle

- **GIVEN** a batch entry "BATS-Gather blockiert: kommentarloser setup()-Body in container-resolution.bats ist Syntaxfehler" (degraded, tests/spec/mishap-rollup) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
