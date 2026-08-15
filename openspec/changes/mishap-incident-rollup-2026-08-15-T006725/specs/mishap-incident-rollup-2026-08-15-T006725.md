---
title: "mishap-incident-rollup-2026-08-15-T006725 — Mishap-Bundle"
ticket_id: T006725
---

## ADDED Requirements

### Requirement: Doppelbelegung von Worktrees durch parallele Sessions

The rollup bundle SHALL address the mishap "Doppelbelegung von Worktrees durch parallele Sessions" (process, session-koordination).

#### Scenario: Doppelbelegung von Worktrees durch parallele Sessions is covered by the bundle

- **GIVEN** a batch entry "Doppelbelegung von Worktrees durch parallele Sessions" (process, session-koordination) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: WSL: HF-CloudFront-Downloads hingen in IPv6-SYN-SENT; gai.conf-Fix noetig

The rollup bundle SHALL address the mishap "WSL: HF-CloudFront-Downloads hingen in IPv6-SYN-SENT; gai.conf-Fix noetig" (degraded, infra/wsl-networking).

#### Scenario: WSL: HF-CloudFront-Downloads hingen in IPv6-SYN-SENT; gai.conf-Fix noetig is covered by the bundle

- **GIVEN** a batch entry "WSL: HF-CloudFront-Downloads hingen in IPv6-SYN-SENT; gai.conf-Fix noetig" (degraded, infra/wsl-networking) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: gh api transient network error bei PR-Suche im ticket-ops-Lauf

The rollup bundle SHALL address the mishap "gh api transient network error bei PR-Suche im ticket-ops-Lauf" (degraded, gh-cli).

#### Scenario: gh api transient network error bei PR-Suche im ticket-ops-Lauf is covered by the bundle

- **GIVEN** a batch entry "gh api transient network error bei PR-Suche im ticket-ops-Lauf" (degraded, gh-cli) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: mishap-Buffer-Write meldet Erfolg, schreibt aber nicht, wenn Repo-Root nicht aufloesbar

The rollup bundle SHALL address the mishap "mishap-Buffer-Write meldet Erfolg, schreibt aber nicht, wenn Repo-Root nicht aufloesbar" (degraded, ticket-mcp).

#### Scenario: mishap-Buffer-Write meldet Erfolg, schreibt aber nicht, wenn Repo-Root nicht aufloesbar is covered by the bundle

- **GIVEN** a batch entry "mishap-Buffer-Write meldet Erfolg, schreibt aber nicht, wenn Repo-Root nicht aufloesbar" (degraded, ticket-mcp) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: 10 mcp-task-runner-Prozesse laufen mit ersetzter/gelöschter Binary

The rollup bundle SHALL address the mishap "10 mcp-task-runner-Prozesse laufen mit ersetzter/gelöschter Binary" (drift, mcp-task-runner (registry: docs/agent-guide/registry/mcp.yaml)).

#### Scenario: 10 mcp-task-runner-Prozesse laufen mit ersetzter/gelöschter Binary is covered by the bundle

- **GIVEN** a batch entry "10 mcp-task-runner-Prozesse laufen mit ersetzter/gelöschter Binary" (drift, mcp-task-runner (registry: docs/agent-guide/registry/mcp.yaml)) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Doppelbearbeitung T006285: Chore-Merge schloss Ticket unter gestagtem Fix-Plan

The rollup bundle SHALL address the mishap "Doppelbearbeitung T006285: Chore-Merge schloss Ticket unter gestagtem Fix-Plan" (process, dev-flow / ticket-dispatch).

#### Scenario: Doppelbearbeitung T006285: Chore-Merge schloss Ticket unter gestagtem Fix-Plan is covered by the bundle

- **GIVEN** a batch entry "Doppelbearbeitung T006285: Chore-Merge schloss Ticket unter gestagtem Fix-Plan" (process, dev-flow / ticket-dispatch) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Welle-1-Dispatch kollidierte mit paralleler ticket-ops-Session (T006348 Doppel-Plan, T006285/T006368 verwaiste Pläne)

The rollup bundle SHALL address the mishap "Welle-1-Dispatch kollidierte mit paralleler ticket-ops-Session (T006348 Doppel-Plan, T006285/T006368 verwaiste Pläne)" (process, ticket-ops/dispatch).

#### Scenario: Welle-1-Dispatch kollidierte mit paralleler ticket-ops-Session (T006348 Doppel-Plan, T006285/T006368 verwaiste Pläne) is covered by the bundle

- **GIVEN** a batch entry "Welle-1-Dispatch kollidierte mit paralleler ticket-ops-Session (T006348 Doppel-Plan, T006285/T006368 verwaiste Pläne)" (process, ticket-ops/dispatch) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Drei orphaned Branch-Locks mit toten PIDs — Heartbeat lief nie, nur manueller Reap half

The rollup bundle SHALL address the mishap "Drei orphaned Branch-Locks mit toten PIDs — Heartbeat lief nie, nur manueller Reap half" (process, agent-lock).

#### Scenario: Drei orphaned Branch-Locks mit toten PIDs — Heartbeat lief nie, nur manueller Reap half is covered by the bundle

- **GIVEN** a batch entry "Drei orphaned Branch-Locks mit toten PIDs — Heartbeat lief nie, nur manueller Reap half" (process, agent-lock) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Merge-ohne-Close + Re-Work: T006348-Fix war 03:49Z gemergt, Sessions planten 05:17–05:40 nach

The rollup bundle SHALL address the mishap "Merge-ohne-Close + Re-Work: T006348-Fix war 03:49Z gemergt, Sessions planten 05:17–05:40 nach" (drift, factory).

#### Scenario: Merge-ohne-Close + Re-Work: T006348-Fix war 03:49Z gemergt, Sessions planten 05:17–05:40 nach is covered by the bundle

- **GIVEN** a batch entry "Merge-ohne-Close + Re-Work: T006348-Fix war 03:49Z gemergt, Sessions planten 05:17–05:40 nach" (drift, factory) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: gh pr list lieferte stale PR-State (OPEN für einen seit 2h gemergten PR)

The rollup bundle SHALL address the mishap "gh pr list lieferte stale PR-State (OPEN für einen seit 2h gemergten PR)" (suspicious, gh).

#### Scenario: gh pr list lieferte stale PR-State (OPEN für einen seit 2h gemergten PR) is covered by the bundle

- **GIVEN** a batch entry "gh pr list lieferte stale PR-State (OPEN für einen seit 2h gemergten PR)" (suspicious, gh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
