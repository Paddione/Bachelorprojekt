---
title: "mishap-incident-rollup-2026-08-22-T013678 — Mishap-Bundle"
ticket_id: T013678
---

## ADDED Requirements

### Requirement: export_ticket_timeline schlägt für Brand korczewski fehl (Exit 3, keine Diagnose)

The rollup bundle SHALL address the mishap "export_ticket_timeline schlägt für Brand korczewski fehl (Exit 3, keine Diagnose)" (degraded, ticket-mcp/export-timeline).

#### Scenario: export_ticket_timeline schlägt für Brand korczewski fehl (Exit 3, keine Diagnose) is covered by the bundle

- **GIVEN** a batch entry "export_ticket_timeline schlägt für Brand korczewski fehl (Exit 3, keine Diagnose)" (degraded, ticket-mcp/export-timeline) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Verwaiste Factory-Test-Fixtures akkumulieren ohne Sweeper — geleakte SF-REAL-Zeilen sind in der echten Queue dispatchbar

The rollup bundle SHALL address the mishap "Verwaiste Factory-Test-Fixtures akkumulieren ohne Sweeper — geleakte SF-REAL-Zeilen sind in der echten Queue dispatchbar" (degraded, tests/factory-fixtures).

#### Scenario: Verwaiste Factory-Test-Fixtures akkumulieren ohne Sweeper — geleakte SF-REAL-Zeilen sind in der echten Queue dispatchbar is covered by the bundle

- **GIVEN** a batch entry "Verwaiste Factory-Test-Fixtures akkumulieren ohne Sweeper — geleakte SF-REAL-Zeilen sind in der echten Queue dispatchbar" (degraded, tests/factory-fixtures) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Plan-Status-Flip uncommittet im Hauptcheckout statt im PR (T013593 tasks.md)

The rollup bundle SHALL address the mishap "Plan-Status-Flip uncommittet im Hauptcheckout statt im PR (T013593 tasks.md)" (suspicious, factory/post-merge-finalize).

#### Scenario: Plan-Status-Flip uncommittet im Hauptcheckout statt im PR (T013593 tasks.md) is covered by the bundle

- **GIVEN** a batch entry "Plan-Status-Flip uncommittet im Hauptcheckout statt im PR (T013593 tasks.md)" (suspicious, factory/post-merge-finalize) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Uncommittete .opencode/package.json+-Lockfile-Änderungen im mishap-rollup Worktree T013316-reuse

The rollup bundle SHALL address the mishap "Uncommittete .opencode/package.json+-Lockfile-Änderungen im mishap-rollup Worktree T013316-reuse" (suspicious, factory/worktrees).

#### Scenario: Uncommittete .opencode/package.json+-Lockfile-Änderungen im mishap-rollup Worktree T013316-reuse is covered by the bundle

- **GIVEN** a batch entry "Uncommittete .opencode/package.json+-Lockfile-Änderungen im mishap-rollup Worktree T013316-reuse" (suspicious, factory/worktrees) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: worktree-create.sh: Skill-Text zeigt Aufruf ohne Pflicht-Pfadargument

The rollup bundle SHALL address the mishap "worktree-create.sh: Skill-Text zeigt Aufruf ohne Pflicht-Pfadargument" (drift, skills/dev-flow-plan).

#### Scenario: worktree-create.sh: Skill-Text zeigt Aufruf ohne Pflicht-Pfadargument is covered by the bundle

- **GIVEN** a batch entry "worktree-create.sh: Skill-Text zeigt Aufruf ohne Pflicht-Pfadargument" (drift, skills/dev-flow-plan) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: freshness:regenerate erzeugt repo-index.json, plan-preflight verbietet sie im selben Zug

The rollup bundle SHALL address the mishap "freshness:regenerate erzeugt repo-index.json, plan-preflight verbietet sie im selben Zug" (suspicious, skills/dev-flow-plan).

#### Scenario: freshness:regenerate erzeugt repo-index.json, plan-preflight verbietet sie im selben Zug is covered by the bundle

- **GIVEN** a batch entry "freshness:regenerate erzeugt repo-index.json, plan-preflight verbietet sie im selben Zug" (suspicious, skills/dev-flow-plan) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: components/website/node_modules unvollstaendig im Haupt-Checkout — pg toter Symlink, tsx ohne dist/

The rollup bundle SHALL address the mishap "components/website/node_modules unvollstaendig im Haupt-Checkout — pg toter Symlink, tsx ohne dist/" (degraded, components/website).

#### Scenario: components/website/node_modules unvollstaendig im Haupt-Checkout — pg toter Symlink, tsx ohne dist/ is covered by the bundle

- **GIVEN** a batch entry "components/website/node_modules unvollstaendig im Haupt-Checkout — pg toter Symlink, tsx ohne dist/" (degraded, components/website) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: plan-qa-check.sh uebersprungen — llm-proxy antwortet 503 no_backend

The rollup bundle SHALL address the mishap "plan-qa-check.sh uebersprungen — llm-proxy antwortet 503 no_backend" (degraded, scripts/llm-proxy).

#### Scenario: plan-qa-check.sh uebersprungen — llm-proxy antwortet 503 no_backend is covered by the bundle

- **GIVEN** a batch entry "plan-qa-check.sh uebersprungen — llm-proxy antwortet 503 no_backend" (degraded, scripts/llm-proxy) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Merge=Closure griff nicht bei MCP-angelegtem Chore-Ticket (T013675 blieb triage nach gemergtem PR)

The rollup bundle SHALL address the mishap "Merge=Closure griff nicht bei MCP-angelegtem Chore-Ticket (T013675 blieb triage nach gemergtem PR)" (suspicious, tickets/merge-closure).

#### Scenario: Merge=Closure griff nicht bei MCP-angelegtem Chore-Ticket (T013675 blieb triage nach gemergtem PR) is covered by the bundle

- **GIVEN** a batch entry "Merge=Closure griff nicht bei MCP-angelegtem Chore-Ticket (T013675 blieb triage nach gemergtem PR)" (suspicious, tickets/merge-closure) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: git-worktree-health.sh objects wertet harmloses dangling als BEFUND (Exit 1)

The rollup bundle SHALL address the mishap "git-worktree-health.sh objects wertet harmloses dangling als BEFUND (Exit 1)" (degraded, scripts/git-worktree-health.sh).

#### Scenario: git-worktree-health.sh objects wertet harmloses dangling als BEFUND (Exit 1) is covered by the bundle

- **GIVEN** a batch entry "git-worktree-health.sh objects wertet harmloses dangling als BEFUND (Exit 1)" (degraded, scripts/git-worktree-health.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
