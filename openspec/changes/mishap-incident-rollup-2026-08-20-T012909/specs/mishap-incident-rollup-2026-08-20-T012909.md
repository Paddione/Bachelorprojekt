---
title: "mishap-incident-rollup-2026-08-20-T012909 — Mishap-Bundle"
ticket_id: T012909
---

## ADDED Requirements

### Requirement: repo-hygiene: Auto-Mode-Klassifikator blockiert zwei Runbook-Standardschritte

The rollup bundle SHALL address the mishap "repo-hygiene: Auto-Mode-Klassifikator blockiert zwei Runbook-Standardschritte" (process, ops).

#### Scenario: repo-hygiene: Auto-Mode-Klassifikator blockiert zwei Runbook-Standardschritte is covered by the bundle

- **GIVEN** a batch entry "repo-hygiene: Auto-Mode-Klassifikator blockiert zwei Runbook-Standardschritte" (process, ops) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: dev-flow-chore Schritt 4 nennt Commit-Scope ohne Allowlist-Hinweis

The rollup bundle SHALL address the mishap "dev-flow-chore Schritt 4 nennt Commit-Scope ohne Allowlist-Hinweis" (drift, skills/dev-flow-chore).

#### Scenario: dev-flow-chore Schritt 4 nennt Commit-Scope ohne Allowlist-Hinweis is covered by the bundle

- **GIVEN** a batch entry "dev-flow-chore Schritt 4 nennt Commit-Scope ohne Allowlist-Hinweis" (drift, skills/dev-flow-chore) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Worktree-Isolationsguard blockiert repo-hygiene vollstaendig, auch lesende git-Befehle

The rollup bundle SHALL address the mishap "Worktree-Isolationsguard blockiert repo-hygiene vollstaendig, auch lesende git-Befehle" (suspicious, skills/repo-hygiene).

#### Scenario: Worktree-Isolationsguard blockiert repo-hygiene vollstaendig, auch lesende git-Befehle is covered by the bundle

- **GIVEN** a batch entry "Worktree-Isolationsguard blockiert repo-hygiene vollstaendig, auch lesende git-Befehle" (suspicious, skills/repo-hygiene) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: branch-reaper loescht den Remote-Branch, bevor er den Worktree-Check macht

The rollup bundle SHALL address the mishap "branch-reaper loescht den Remote-Branch, bevor er den Worktree-Check macht" (degraded, scripts/branch-reaper.sh).

#### Scenario: branch-reaper loescht den Remote-Branch, bevor er den Worktree-Check macht is covered by the bundle

- **GIVEN** a batch entry "branch-reaper loescht den Remote-Branch, bevor er den Worktree-Check macht" (degraded, scripts/branch-reaper.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Nach-Merge-Commit auf Ticket-Branch kam nie nach main und wurde von keinem Guard gemeldet

The rollup bundle SHALL address the mishap "Nach-Merge-Commit auf Ticket-Branch kam nie nach main und wurde von keinem Guard gemeldet" (drift, scripts/branch-reaper.sh).

#### Scenario: Nach-Merge-Commit auf Ticket-Branch kam nie nach main und wurde von keinem Guard gemeldet is covered by the bundle

- **GIVEN** a batch entry "Nach-Merge-Commit auf Ticket-Branch kam nie nach main und wurde von keinem Guard gemeldet" (drift, scripts/branch-reaper.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Ungeticketer Flux-Patch lag unversioniert im Hauptcheckout

The rollup bundle SHALL address the mishap "Ungeticketer Flux-Patch lag unversioniert im Hauptcheckout" (process, flux/clusters/fleet).

#### Scenario: Ungeticketer Flux-Patch lag unversioniert im Hauptcheckout is covered by the bundle

- **GIVEN** a batch entry "Ungeticketer Flux-Patch lag unversioniert im Hauptcheckout" (process, flux/clusters/fleet) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Ungeticketete Fremdarbeit lag uncommittet in thematisch fremdem Worktree

The rollup bundle SHALL address the mishap "Ungeticketete Fremdarbeit lag uncommittet in thematisch fremdem Worktree" (suspicious, repo/worktrees).

#### Scenario: Ungeticketete Fremdarbeit lag uncommittet in thematisch fremdem Worktree is covered by the bundle

- **GIVEN** a batch entry "Ungeticketete Fremdarbeit lag uncommittet in thematisch fremdem Worktree" (suspicious, repo/worktrees) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Commit-Hooks melden Branchnamen- und Scope-Fehler nacheinander statt zusammen

The rollup bundle SHALL address the mishap "Commit-Hooks melden Branchnamen- und Scope-Fehler nacheinander statt zusammen" (drift, scripts/hooks/commit).

#### Scenario: Commit-Hooks melden Branchnamen- und Scope-Fehler nacheinander statt zusammen is covered by the bundle

- **GIVEN** a batch entry "Commit-Hooks melden Branchnamen- und Scope-Fehler nacheinander statt zusammen" (drift, scripts/hooks/commit) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: worktree-clean-check rc=2 bei aktiver Fremdsession sieht wie ein Werkzeugfehler aus

The rollup bundle SHALL address the mishap "worktree-clean-check rc=2 bei aktiver Fremdsession sieht wie ein Werkzeugfehler aus" (suspicious, scripts/worktree-clean-check.sh).

#### Scenario: worktree-clean-check rc=2 bei aktiver Fremdsession sieht wie ein Werkzeugfehler aus is covered by the bundle

- **GIVEN** a batch entry "worktree-clean-check rc=2 bei aktiver Fremdsession sieht wie ein Werkzeugfehler aus" (suspicious, scripts/worktree-clean-check.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: SCS-Reindex schlaegt beim Commit fehl, Commit geht trotzdem durch

The rollup bundle SHALL address the mishap "SCS-Reindex schlaegt beim Commit fehl, Commit geht trotzdem durch" (drift, scripts/hooks/scs-reindex).

#### Scenario: SCS-Reindex schlaegt beim Commit fehl, Commit geht trotzdem durch is covered by the bundle

- **GIVEN** a batch entry "SCS-Reindex schlaegt beim Commit fehl, Commit geht trotzdem durch" (drift, scripts/hooks/scs-reindex) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
