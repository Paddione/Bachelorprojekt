---
title: "mishap-incident-rollup-2026-08-21-T012973 — Mishap-Bundle"
ticket_id: T012973
---

## ADDED Requirements

### Requirement: False-positive 'IDENTISCH mit main' durch pfadgefilterten Diff in ignoriertem Worktree-Pfad

The rollup bundle SHALL address the mishap "False-positive 'IDENTISCH mit main' durch pfadgefilterten Diff in ignoriertem Worktree-Pfad" (process, repo-hygiene).

#### Scenario: False-positive 'IDENTISCH mit main' durch pfadgefilterten Diff in ignoriertem Worktree-Pfad is covered by the bundle

- **GIVEN** a batch entry "False-positive 'IDENTISCH mit main' durch pfadgefilterten Diff in ignoriertem Worktree-Pfad" (process, repo-hygiene) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: commit-msg-Hook lehnt konsolidierten Scope 'openspec' ab

The rollup bundle SHALL address the mishap "commit-msg-Hook lehnt konsolidierten Scope 'openspec' ab" (process, scripts/validate-commit-msg.sh).

#### Scenario: commit-msg-Hook lehnt konsolidierten Scope 'openspec' ab is covered by the bundle

- **GIVEN** a batch entry "commit-msg-Hook lehnt konsolidierten Scope 'openspec' ab" (process, scripts/validate-commit-msg.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Ticket-loser PR-Branch blockiert eigenen Freshness-Fix-Commit

The rollup bundle SHALL address the mishap "Ticket-loser PR-Branch blockiert eigenen Freshness-Fix-Commit" (process, repo-hygiene).

#### Scenario: Ticket-loser PR-Branch blockiert eigenen Freshness-Fix-Commit is covered by the bundle

- **GIVEN** a batch entry "Ticket-loser PR-Branch blockiert eigenen Freshness-Fix-Commit" (process, repo-hygiene) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Superseded Fix-Draft (mit Syntaxfehler) lag uncommittet im T012967-Worktree

The rollup bundle SHALL address the mishap "Superseded Fix-Draft (mit Syntaxfehler) lag uncommittet im T012967-Worktree" (drift, scripts/branch-reaper.sh).

#### Scenario: Superseded Fix-Draft (mit Syntaxfehler) lag uncommittet im T012967-Worktree is covered by the bundle

- **GIVEN** a batch entry "Superseded Fix-Draft (mit Syntaxfehler) lag uncommittet im T012967-Worktree" (drift, scripts/branch-reaper.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Paralleler MCP+bash-Toolcall lieferte bash-Ausgabe verlustfrei nicht zurück

The rollup bundle SHALL address the mishap "Paralleler MCP+bash-Toolcall lieferte bash-Ausgabe verlustfrei nicht zurück" (suspicious, skills/ticket-ops).

#### Scenario: Paralleler MCP+bash-Toolcall lieferte bash-Ausgabe verlustfrei nicht zurück is covered by the bundle

- **GIVEN** a batch entry "Paralleler MCP+bash-Toolcall lieferte bash-Ausgabe verlustfrei nicht zurück" (suspicious, skills/ticket-ops) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Verwaistes OpenSpec-Change-Dir des T012445-Rollups im Haupt-Checkout

The rollup bundle SHALL address the mishap "Verwaistes OpenSpec-Change-Dir des T012445-Rollups im Haupt-Checkout" (drift, repo/openspec).

#### Scenario: Verwaistes OpenSpec-Change-Dir des T012445-Rollups im Haupt-Checkout is covered by the bundle

- **GIVEN** a batch entry "Verwaistes OpenSpec-Change-Dir des T012445-Rollups im Haupt-Checkout" (drift, repo/openspec) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Ticket-Beschreibung driftet nach Cross-Session-Rescue: T012966 blieb offen, obwohl Arbeit via T012972 (#4887) längst gemergt war

The rollup bundle SHALL address the mishap "Ticket-Beschreibung driftet nach Cross-Session-Rescue: T012966 blieb offen, obwohl Arbeit via T012972 (#4887) längst gemergt war" (drift, tickets).

#### Scenario: Ticket-Beschreibung driftet nach Cross-Session-Rescue: T012966 blieb offen, obwohl Arbeit via T012972 (#4887) längst gemergt war is covered by the bundle

- **GIVEN** a batch entry "Ticket-Beschreibung driftet nach Cross-Session-Rescue: T012966 blieb offen, obwohl Arbeit via T012972 (#4887) längst gemergt war" (drift, tickets) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Factory-Executor setzte belegtes Rollup-Worktree auf HEAD zurück und vernichtete uncommittete Arbeit einer Parallel-Session

The rollup bundle SHALL address the mishap "Factory-Executor setzte belegtes Rollup-Worktree auf HEAD zurück und vernichtete uncommittete Arbeit einer Parallel-Session" (degraded, factory/executor).

#### Scenario: Factory-Executor setzte belegtes Rollup-Worktree auf HEAD zurück und vernichtete uncommittete Arbeit einer Parallel-Session is covered by the bundle

- **GIVEN** a batch entry "Factory-Executor setzte belegtes Rollup-Worktree auf HEAD zurück und vernichtete uncommittete Arbeit einer Parallel-Session" (degraded, factory/executor) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Drei lokale Test-Fehlschläge auf main (Proxy-Pin, pgvector-Index, feature_flags-FK) — Umgebungsdrift macht test:changed lokal unbrauchbar

The rollup bundle SHALL address the mishap "Drei lokale Test-Fehlschläge auf main (Proxy-Pin, pgvector-Index, feature_flags-FK) — Umgebungsdrift macht test:changed lokal unbrauchbar" (degraded, tests/local-env).

#### Scenario: Drei lokale Test-Fehlschläge auf main (Proxy-Pin, pgvector-Index, feature_flags-FK) — Umgebungsdrift macht test:changed lokal unbrauchbar is covered by the bundle

- **GIVEN** a batch entry "Drei lokale Test-Fehlschläge auf main (Proxy-Pin, pgvector-Index, feature_flags-FK) — Umgebungsdrift macht test:changed lokal unbrauchbar" (degraded, tests/local-env) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: SSOT-Spec mishap-rollup.md beschreibt den Container-Lebenszyklus veraltet

The rollup bundle SHALL address the mishap "SSOT-Spec mishap-rollup.md beschreibt den Container-Lebenszyklus veraltet" (drift, openspec/specs/mishap-rollup.md).

#### Scenario: SSOT-Spec mishap-rollup.md beschreibt den Container-Lebenszyklus veraltet is covered by the bundle

- **GIVEN** a batch entry "SSOT-Spec mishap-rollup.md beschreibt den Container-Lebenszyklus veraltet" (drift, openspec/specs/mishap-rollup.md) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
