---
title: "mishap-incident-rollup-2026-08-21-T012445 — Mishap-Bundle"
ticket_id: T012445
---

## ADDED Requirements

### Requirement: branch-reaper --sweep prüft nicht, ob ein Branch in einem lebenden Worktree ausgecheckt ist

The rollup bundle SHALL address the mishap "branch-reaper --sweep prüft nicht, ob ein Branch in einem lebenden Worktree ausgecheckt ist" (suspicious, scripts/branch-reaper.sh).

#### Scenario: branch-reaper --sweep prüft nicht, ob ein Branch in einem lebenden Worktree ausgecheckt ist is covered by the bundle

- **GIVEN** a batch entry "branch-reaper --sweep prüft nicht, ob ein Branch in einem lebenden Worktree ausgecheckt ist" (suspicious, scripts/branch-reaper.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: BATS-Worktree-Tests lassen leere Fixture-Verzeichnisse unter .worktrees/ liegen

The rollup bundle SHALL address the mishap "BATS-Worktree-Tests lassen leere Fixture-Verzeichnisse unter .worktrees/ liegen" (drift, tests/spec (worktree-Fixtures)).

#### Scenario: BATS-Worktree-Tests lassen leere Fixture-Verzeichnisse unter .worktrees/ liegen is covered by the bundle

- **GIVEN** a batch entry "BATS-Worktree-Tests lassen leere Fixture-Verzeichnisse unter .worktrees/ liegen" (drift, tests/spec (worktree-Fixtures)) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Task dispatch to gemma12 returned empty result (T012645)

The rollup bundle SHALL address the mishap "Task dispatch to gemma12 returned empty result (T012645)" (degraded, llm-proxy).

#### Scenario: Task dispatch to gemma12 returned empty result (T012645) is covered by the bundle

- **GIVEN** a batch entry "Task dispatch to gemma12 returned empty result (T012645)" (degraded, llm-proxy) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: branch-reaper --sweep timeout at 120s with 4 candidates

The rollup bundle SHALL address the mishap "branch-reaper --sweep timeout at 120s with 4 candidates" (degraded, scripts/branch-reaper.sh).

#### Scenario: branch-reaper --sweep timeout at 120s with 4 candidates is covered by the bundle

- **GIVEN** a batch entry "branch-reaper --sweep timeout at 120s with 4 candidates" (degraded, scripts/branch-reaper.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: ticket-mcp list_tickets liefert bei komma-separiertem status-Filter still eine leere Liste

The rollup bundle SHALL address the mishap "ticket-mcp list_tickets liefert bei komma-separiertem status-Filter still eine leere Liste" (suspicious, ticket-mcp).

#### Scenario: ticket-mcp list_tickets liefert bei komma-separiertem status-Filter still eine leere Liste is covered by the bundle

- **GIVEN** a batch entry "ticket-mcp list_tickets liefert bei komma-separiertem status-Filter still eine leere Liste" (suspicious, ticket-mcp) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: kubelet cert repair still reports matching dual-stack nodes as FAIL

The rollup bundle SHALL address the mishap "kubelet cert repair still reports matching dual-stack nodes as FAIL" (suspicious, scripts/sdlc/kubelet-cert-check.sh).

#### Scenario: kubelet cert repair still reports matching dual-stack nodes as FAIL is covered by the bundle

- **GIVEN** a batch entry "kubelet cert repair still reports matching dual-stack nodes as FAIL" (suspicious, scripts/sdlc/kubelet-cert-check.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: gemma12-vision MTP draft crashes on measured three-slot configuration

The rollup bundle SHALL address the mishap "gemma12-vision MTP draft crashes on measured three-slot configuration" (degraded, local-llm/loadouts).

#### Scenario: gemma12-vision MTP draft crashes on measured three-slot configuration is covered by the bundle

- **GIVEN** a batch entry "gemma12-vision MTP draft crashes on measured three-slot configuration" (degraded, local-llm/loadouts) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: G-OPS01 conflates historical Job debris with live service degradation

The rollup bundle SHALL address the mishap "G-OPS01 conflates historical Job debris with live service degradation" (suspicious, health-goals/G-OPS01).

#### Scenario: G-OPS01 conflates historical Job debris with live service degradation is covered by the bundle

- **GIVEN** a batch entry "G-OPS01 conflates historical Job debris with live service degradation" (suspicious, health-goals/G-OPS01) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: db-backup sidecar could retain CPU requests indefinitely

The rollup bundle SHALL address the mishap "db-backup sidecar could retain CPU requests indefinitely" (degraded, k3d/backup-cronjob.yaml).

#### Scenario: db-backup sidecar could retain CPU requests indefinitely is covered by the bundle

- **GIVEN** a batch entry "db-backup sidecar could retain CPU requests indefinitely" (degraded, k3d/backup-cronjob.yaml) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: ntfy SealedSecret key casing drifted from Deployment contract

The rollup bundle SHALL address the mishap "ntfy SealedSecret key casing drifted from Deployment contract" (drift, workspace/ntfy-tokens).

#### Scenario: ntfy SealedSecret key casing drifted from Deployment contract is covered by the bundle

- **GIVEN** a batch entry "ntfy SealedSecret key casing drifted from Deployment contract" (drift, workspace/ntfy-tokens) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
