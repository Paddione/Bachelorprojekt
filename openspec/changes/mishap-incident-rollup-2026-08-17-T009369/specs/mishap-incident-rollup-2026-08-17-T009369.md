---
title: "mishap-incident-rollup-2026-08-17-T009369 — Mishap-Bundle"
ticket_id: T009369
---

## ADDED Requirements

### Requirement: astro check fing Parse-Fehler in lib/sdlc-Datei nicht (Exit 0 trotz Syntaxfehler)

The rollup bundle SHALL address the mishap "astro check fing Parse-Fehler in lib/sdlc-Datei nicht (Exit 0 trotz Syntaxfehler)" (suspicious, website/astro-check).

#### Scenario: astro check fing Parse-Fehler in lib/sdlc-Datei nicht (Exit 0 trotz Syntaxfehler) is covered by the bundle

- **GIVEN** a batch entry "astro check fing Parse-Fehler in lib/sdlc-Datei nicht (Exit 0 trotz Syntaxfehler)" (suspicious, website/astro-check) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: task cluster:start hing trotz erfolgreichem Cluster-Start (kubectl wait ohne --context)

The rollup bundle SHALL address the mishap "task cluster:start hing trotz erfolgreichem Cluster-Start (kubectl wait ohne --context)" (suspicious, taskfile/cluster:start).

#### Scenario: task cluster:start hing trotz erfolgreichem Cluster-Start (kubectl wait ohne --context) is covered by the bundle

- **GIVEN** a batch entry "task cluster:start hing trotz erfolgreichem Cluster-Start (kubectl wait ohne --context)" (suspicious, taskfile/cluster:start) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: devflow-ci-watch.sh bewertet Checks falsch-grün, wenn headRefOid nicht bestimmbar ist

The rollup bundle SHALL address the mishap "devflow-ci-watch.sh bewertet Checks falsch-grün, wenn headRefOid nicht bestimmbar ist" (degraded, scripts/devflow-ci-watch.sh).

#### Scenario: devflow-ci-watch.sh bewertet Checks falsch-grün, wenn headRefOid nicht bestimmbar ist is covered by the bundle

- **GIVEN** a batch entry "devflow-ci-watch.sh bewertet Checks falsch-grün, wenn headRefOid nicht bestimmbar ist" (degraded, scripts/devflow-ci-watch.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: devflow-post-merge-finalize.sh: kein Skip-Flag für Worktree-Entfernung — reißt laufenden Sessions das cwd weg

The rollup bundle SHALL address the mishap "devflow-post-merge-finalize.sh: kein Skip-Flag für Worktree-Entfernung — reißt laufenden Sessions das cwd weg" (degraded, scripts/devflow-post-merge-finalize.sh).

#### Scenario: devflow-post-merge-finalize.sh: kein Skip-Flag für Worktree-Entfernung — reißt laufenden Sessions das cwd weg is covered by the bundle

- **GIVEN** a batch entry "devflow-post-merge-finalize.sh: kein Skip-Flag für Worktree-Entfernung — reißt laufenden Sessions das cwd weg" (degraded, scripts/devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: sdlc-console im k3d-mentolder-dev drifted vom Manifest (:dev/IfNotPresent statt :latest/Always)

The rollup bundle SHALL address the mishap "sdlc-console im k3d-mentolder-dev drifted vom Manifest (:dev/IfNotPresent statt :latest/Always)" (drift, k3d/sdlc-stack/sdlc-console.yaml).

#### Scenario: sdlc-console im k3d-mentolder-dev drifted vom Manifest (:dev/IfNotPresent statt :latest/Always) is covered by the bundle

- **GIVEN** a batch entry "sdlc-console im k3d-mentolder-dev drifted vom Manifest (:dev/IfNotPresent statt :latest/Always)" (drift, k3d/sdlc-stack/sdlc-console.yaml) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: T008814 test fixture not marked as is_test_data

The rollup bundle SHALL address the mishap "T008814 test fixture not marked as is_test_data" (drift, tickets).

#### Scenario: T008814 test fixture not marked as is_test_data is covered by the bundle

- **GIVEN** a batch entry "T008814 test fixture not marked as is_test_data" (drift, tickets) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Factory-Redispatch reused Worktrees mit veralteter .opencode-Config

The rollup bundle SHALL address the mishap "Factory-Redispatch reused Worktrees mit veralteter .opencode-Config" (suspicious, factory/pipeline.mjs).

#### Scenario: Factory-Redispatch reused Worktrees mit veralteter .opencode-Config is covered by the bundle

- **GIVEN** a batch entry "Factory-Redispatch reused Worktrees mit veralteter .opencode-Config" (suspicious, factory/pipeline.mjs) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: opencode run ignoriert erstes SIGTERM — hängende Orchestrator-Läufe schwer abzuräumen

The rollup bundle SHALL address the mishap "opencode run ignoriert erstes SIGTERM — hängende Orchestrator-Läufe schwer abzuräumen" (degraded, factory/opencode-exec.sh).

#### Scenario: opencode run ignoriert erstes SIGTERM — hängende Orchestrator-Läufe schwer abzuräumen is covered by the bundle

- **GIVEN** a batch entry "opencode run ignoriert erstes SIGTERM — hängende Orchestrator-Läufe schwer abzuräumen" (degraded, factory/opencode-exec.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Commit-Scope 'llm' abgelehnt — Konsolidierung zu 'ops' (T002328) nicht präsent

The rollup bundle SHALL address the mishap "Commit-Scope 'llm' abgelehnt — Konsolidierung zu 'ops' (T002328) nicht präsent" (drift, repo/commit-conventions).

#### Scenario: Commit-Scope 'llm' abgelehnt — Konsolidierung zu 'ops' (T002328) nicht präsent is covered by the bundle

- **GIVEN** a batch entry "Commit-Scope 'llm' abgelehnt — Konsolidierung zu 'ops' (T002328) nicht präsent" (drift, repo/commit-conventions) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: ticket-ops-procedures.md fehlt auf Disk

The rollup bundle SHALL address the mishap "ticket-ops-procedures.md fehlt auf Disk" (process, skills/ticket-ops).

#### Scenario: ticket-ops-procedures.md fehlt auf Disk is covered by the bundle

- **GIVEN** a batch entry "ticket-ops-procedures.md fehlt auf Disk" (process, skills/ticket-ops) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
