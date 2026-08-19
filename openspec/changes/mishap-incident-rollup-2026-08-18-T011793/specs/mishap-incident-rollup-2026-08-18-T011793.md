---
title: "mishap-incident-rollup-2026-08-18-T011793 — Mishap-Bundle"
ticket_id: T011793
---

## ADDED Requirements

### Requirement: Orphan-Worktree-Verzeichnis .worktrees/components auf Disk, kein git-worktree-Eintrag

The rollup bundle SHALL address the mishap "Orphan-Worktree-Verzeichnis .worktrees/components auf Disk, kein git-worktree-Eintrag" (suspicious, repo/worktrees).

#### Scenario: Orphan-Worktree-Verzeichnis .worktrees/components auf Disk, kein git-worktree-Eintrag is covered by the bundle

- **GIVEN** a batch entry "Orphan-Worktree-Verzeichnis .worktrees/components auf Disk, kein git-worktree-Eintrag" (suspicious, repo/worktrees) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: .opencode/package*.json als non-allowlistete dirty Files in 2 Worktrees (T008757, T008345)

The rollup bundle SHALL address the mishap ".opencode/package*.json als non-allowlistete dirty Files in 2 Worktrees (T008757, T008345)" (suspicious, repo/worktrees).

#### Scenario: .opencode/package*.json als non-allowlistete dirty Files in 2 Worktrees (T008757, T008345) is covered by the bundle

- **GIVEN** a batch entry ".opencode/package*.json als non-allowlistete dirty Files in 2 Worktrees (T008757, T008345)" (suspicious, repo/worktrees) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: T009369-Worktree (done) hat non-allowlistete dirty Files: devflow-post-merge-finalize.sh + astro-syntax.bats

The rollup bundle SHALL address the mishap "T009369-Worktree (done) hat non-allowlistete dirty Files: devflow-post-merge-finalize.sh + astro-syntax.bats" (suspicious, repo/worktrees).

#### Scenario: T009369-Worktree (done) hat non-allowlistete dirty Files: devflow-post-merge-finalize.sh + astro-syntax.bats is covered by the bundle

- **GIVEN** a batch entry "T009369-Worktree (done) hat non-allowlistete dirty Files: devflow-post-merge-finalize.sh + astro-syntax.bats" (suspicious, repo/worktrees) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: dev-flow-plan lieferte Change ohne specs/-Delta und .ticket (CI rot bei T008721)

The rollup bundle SHALL address the mishap "dev-flow-plan lieferte Change ohne specs/-Delta und .ticket (CI rot bei T008721)" (process, devflow-plan).

#### Scenario: dev-flow-plan lieferte Change ohne specs/-Delta und .ticket (CI rot bei T008721) is covered by the bundle

- **GIVEN** a batch entry "dev-flow-plan lieferte Change ohne specs/-Delta und .ticket (CI rot bei T008721)" (process, devflow-plan) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: dev-flow-plan-Changes ohne specs/-Delta und .ticket machen openspec-validate rot

The rollup bundle SHALL address the mishap "dev-flow-plan-Changes ohne specs/-Delta und .ticket machen openspec-validate rot" (process, dev-flow-plan).

#### Scenario: dev-flow-plan-Changes ohne specs/-Delta und .ticket machen openspec-validate rot is covered by the bundle

- **GIVEN** a batch entry "dev-flow-plan-Changes ohne specs/-Delta und .ticket machen openspec-validate rot" (process, dev-flow-plan) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Zwei Finalizer-Läufe teilen sich den Haupt-Checkout — kein Mutex um die Archiv-Sektion

The rollup bundle SHALL address the mishap "Zwei Finalizer-Läufe teilen sich den Haupt-Checkout — kein Mutex um die Archiv-Sektion" (degraded, scripts/devflow-post-merge-finalize.sh).

#### Scenario: Zwei Finalizer-Läufe teilen sich den Haupt-Checkout — kein Mutex um die Archiv-Sektion is covered by the bundle

- **GIVEN** a batch entry "Zwei Finalizer-Läufe teilen sich den Haupt-Checkout — kein Mutex um die Archiv-Sektion" (degraded, scripts/devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Finalizer meldet Fehlschläge als [skip] und endet mit Exit 0 — Cleanup-Lücken bleiben unsichtbar

The rollup bundle SHALL address the mishap "Finalizer meldet Fehlschläge als [skip] und endet mit Exit 0 — Cleanup-Lücken bleiben unsichtbar" (degraded, scripts/devflow-post-merge-finalize.sh).

#### Scenario: Finalizer meldet Fehlschläge als [skip] und endet mit Exit 0 — Cleanup-Lücken bleiben unsichtbar is covered by the bundle

- **GIVEN** a batch entry "Finalizer meldet Fehlschläge als [skip] und endet mit Exit 0 — Cleanup-Lücken bleiben unsichtbar" (degraded, scripts/devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Finalizer Schritt 8: git ls-remote erkennt "Archiv-PR bereits gemergt" nicht, Wiederholungslauf endet Exit 1

The rollup bundle SHALL address the mishap "Finalizer Schritt 8: git ls-remote erkennt "Archiv-PR bereits gemergt" nicht, Wiederholungslauf endet Exit 1" (suspicious, scripts/devflow-post-merge-finalize.sh).

#### Scenario: Finalizer Schritt 8: git ls-remote erkennt "Archiv-PR bereits gemergt" nicht, Wiederholungslauf endet Exit 1 is covered by the bundle

- **GIVEN** a batch entry "Finalizer Schritt 8: git ls-remote erkennt "Archiv-PR bereits gemergt" nicht, Wiederholungslauf endet Exit 1" (suspicious, scripts/devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Finalizer schreibt Plan-Status in den Hauptcheckout statt in den Worktree

The rollup bundle SHALL address the mishap "Finalizer schreibt Plan-Status in den Hauptcheckout statt in den Worktree" (degraded, scripts/devflow-post-merge-finalize.sh).

#### Scenario: Finalizer schreibt Plan-Status in den Hauptcheckout statt in den Worktree is covered by the bundle

- **GIVEN** a batch entry "Finalizer schreibt Plan-Status in den Hauptcheckout statt in den Worktree" (degraded, scripts/devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: T012256 auf done geschlossen, obwohl zwei Deliverable-Commits nie einen PR hatten

The rollup bundle SHALL address the mishap "T012256 auf done geschlossen, obwohl zwei Deliverable-Commits nie einen PR hatten" (drift, factory/post-merge-closure).

#### Scenario: T012256 auf done geschlossen, obwohl zwei Deliverable-Commits nie einen PR hatten is covered by the bundle

- **GIVEN** a batch entry "T012256 auf done geschlossen, obwohl zwei Deliverable-Commits nie einen PR hatten" (drift, factory/post-merge-closure) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
