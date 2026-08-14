---
title: "mishap-incident-rollup-2026-08-14-T005030 — Mishap-Bundle"
ticket_id: T005030
---

## ADDED Requirements

### Requirement: Mishap-Ticket nannte falsche Ziel-Datei (Root-Cause in CSV→ARRAY-Konversion)

The rollup bundle SHALL address the mishap "Mishap-Ticket nannte falsche Ziel-Datei (Root-Cause in CSV→ARRAY-Konversion)" (drift, tickets/areas).

#### Scenario: Mishap-Ticket nannte falsche Ziel-Datei (Root-Cause in CSV→ARRAY-Konversion) is covered by the bundle

- **GIVEN** a batch entry "Mishap-Ticket nannte falsche Ziel-Datei (Root-Cause in CSV→ARRAY-Konversion)" (drift, tickets/areas) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Paralleler ticket-ops-Dispatch: worktree-write-guard blockt Phase-A-Writes auf main

The rollup bundle SHALL address the mishap "Paralleler ticket-ops-Dispatch: worktree-write-guard blockt Phase-A-Writes auf main" (degraded, skills/ticket-ops + scripts/hooks/worktree-write-guard.sh).

#### Scenario: Paralleler ticket-ops-Dispatch: worktree-write-guard blockt Phase-A-Writes auf main is covered by the bundle

- **GIVEN** a batch entry "Paralleler ticket-ops-Dispatch: worktree-write-guard blockt Phase-A-Writes auf main" (degraded, skills/ticket-ops + scripts/hooks/worktree-write-guard.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Reaper räumt toten ticket-Lock nicht — manueller Release nötig (T005029)

The rollup bundle SHALL address the mishap "Reaper räumt toten ticket-Lock nicht — manueller Release nötig (T005029)" (suspicious, scripts/agent-lock.sh (reap) + dev-flow-execute Pre-Flight).

#### Scenario: Reaper räumt toten ticket-Lock nicht — manueller Release nötig (T005029) is covered by the bundle

- **GIVEN** a batch entry "Reaper räumt toten ticket-Lock nicht — manueller Release nötig (T005029)" (suspicious, scripts/agent-lock.sh (reap) + dev-flow-execute Pre-Flight) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: task test:changed lokal strukturell rot — Watchdog-Tests kollidieren über die geteilte k3d-Dev-DB

The rollup bundle SHALL address the mishap "task test:changed lokal strukturell rot — Watchdog-Tests kollidieren über die geteilte k3d-Dev-DB" (degraded, tests/spec/software-factory + k3d-Dev-DB).

#### Scenario: task test:changed lokal strukturell rot — Watchdog-Tests kollidieren über die geteilte k3d-Dev-DB is covered by the bundle

- **GIVEN** a batch entry "task test:changed lokal strukturell rot — Watchdog-Tests kollidieren über die geteilte k3d-Dev-DB" (degraded, tests/spec/software-factory + k3d-Dev-DB) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Plan-Punkt war bereits umgesetzt (T002343) — Befund aus alten Daten

The rollup bundle SHALL address the mishap "Plan-Punkt war bereits umgesetzt (T002343) — Befund aus alten Daten" (process, scripts/vda.sh).

#### Scenario: Plan-Punkt war bereits umgesetzt (T002343) — Befund aus alten Daten is covered by the bundle

- **GIVEN** a batch entry "Plan-Punkt war bereits umgesetzt (T002343) — Befund aus alten Daten" (process, scripts/vda.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: vda.sh frontmatter erzeugt invalides Frontmatter, wenn domains als YAML-Liste geschrieben sind

The rollup bundle SHALL address the mishap "vda.sh frontmatter erzeugt invalides Frontmatter, wenn domains als YAML-Liste geschrieben sind" (drift, scripts/vda.sh frontmatter + scripts/plan-lint.sh).

#### Scenario: vda.sh frontmatter erzeugt invalides Frontmatter, wenn domains als YAML-Liste geschrieben sind is covered by the bundle

- **GIVEN** a batch entry "vda.sh frontmatter erzeugt invalides Frontmatter, wenn domains als YAML-Liste geschrieben sind" (drift, scripts/vda.sh frontmatter + scripts/plan-lint.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Archive-Status-Sed-Muster deckt planning nicht ab

The rollup bundle SHALL address the mishap "Archive-Status-Sed-Muster deckt planning nicht ab" (process, scripts/openspec.sh).

#### Scenario: Archive-Status-Sed-Muster deckt planning nicht ab is covered by the bundle

- **GIVEN** a batch entry "Archive-Status-Sed-Muster deckt planning nicht ab" (process, scripts/openspec.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Review-Gate übersprungen — Merge bei grüner CI ohne separaten Review

The rollup bundle SHALL address the mishap "Review-Gate übersprungen — Merge bei grüner CI ohne separaten Review" (process, skills/dev-flow-execute).

#### Scenario: Review-Gate übersprungen — Merge bei grüner CI ohne separaten Review is covered by the bundle

- **GIVEN** a batch entry "Review-Gate übersprungen — Merge bei grüner CI ohne separaten Review" (process, skills/dev-flow-execute) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: kubectl exec -i drainte Shell-Stdin — Purge-Loop löschte nur erste Registry-ID

The rollup bundle SHALL address the mishap "kubectl exec -i drainte Shell-Stdin — Purge-Loop löschte nur erste Registry-ID" (suspicious, tests/lib/factory-test-fixtures.sh + kubectl exec -i-Muster).

#### Scenario: kubectl exec -i drainte Shell-Stdin — Purge-Loop löschte nur erste Registry-ID is covered by the bundle

- **GIVEN** a batch entry "kubectl exec -i drainte Shell-Stdin — Purge-Loop löschte nur erste Registry-ID" (suspicious, tests/lib/factory-test-fixtures.sh + kubectl exec -i-Muster) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: commit-msg-Hook nicht worktree-fähig — check-fix-ticket-guard.sh fehlt in Worktrees

The rollup bundle SHALL address the mishap "commit-msg-Hook nicht worktree-fähig — check-fix-ticket-guard.sh fehlt in Worktrees" (drift, .githooks + Worktree-Betrieb).

#### Scenario: commit-msg-Hook nicht worktree-fähig — check-fix-ticket-guard.sh fehlt in Worktrees is covered by the bundle

- **GIVEN** a batch entry "commit-msg-Hook nicht worktree-fähig — check-fix-ticket-guard.sh fehlt in Worktrees" (drift, .githooks + Worktree-Betrieb) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
