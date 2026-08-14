# batch-worktree-guard-tooling-fixes

## Purpose

Dieser Spec fasst die Verhaltenszusicherungen des Mishap-Batches T004295 zusammen: fünf
Fixes im Worktree-/Guard-Tooling, die den Standard-Arbeitspfad (Commit → Hook → Stage →
Archive → Deploy) von manuellen Bypasses und stillen Hängern befreien. Entstanden aus
ticket-ops Phase 1.5 als Batch-Gruppe über die Kind-Tickets T004261, T003991, T004269,
T003988 und T003982.

## ADDED Requirements

### Requirement: Batch-Branches ohne Bypass durch den Pre-Commit-Hook lassen

The system SHALL akzeptiert den Factory-Standard `feat/batch-*` im Pre-commit-Hook, ohne
dass `SKIP_BRANCH_CHECK` gesetzt werden muss.

#### Scenario: Commit auf feat/batch-Branch

- **GIVEN** ein Branch mit Namen `feat/batch-dashboard-fixes-T003XXX`
- **WHEN** der Pre-commit-Hook läuft
- **THEN** passiert der Branch-Check ohne Fehler
- **AND** kein `SKIP_BRANCH_CHECK`-Bypass ist nötig

#### Scenario: Unbekannte Branch-Präfixe bleiben abgelehnt

- **GIVEN** ein Branch mit Namen `experiment/foo`
- **WHEN** der Pre-commit-Hook läuft
- **THEN** lehnt der Hook den Commit mit dem Branch-Check-Fehler ab

### Requirement: Write-Guard normalisiert Lock-Pfade um das Ticket-Suffix

The system SHALL behandle einen Lock-Worktree-Pfad mit `-T<id>`-Suffix als zum realen
Worktree-Verzeichnis ohne Suffix gehörig, sodass der eigene Claim nicht als tot
übersprungen wird.

#### Scenario: Lock-Pfad mit Suffix, realer Worktree ohne

- **GIVEN** ein branch-scoped Claim mit `"worktree": "/pfad/.worktrees/<slug>-T00XXXX"`
- **AND** der reale Worktree existiert als `/pfad/.worktrees/<slug>`
- **WHEN** der Worktree-Write-Guard einen Write innerhalb des realen Worktrees prüft
- **THEN** wird der Claim als eigener erkannt
- **AND** der Write wird nicht als Fremd-Zugriff blockiert

### Requirement: archive_plan liest Branch-only-Plandateien per git show

The system SHALL lese die Plandatei in `cmd_archive_plan` per
`git show "${branch}:${plan_file}"`, wenn die Datei im Aufrufer-Verzeichnis fehlt, der
Blob im Branch aber existiert.

#### Scenario: Plan liegt nur im Branch

- **GIVEN** ein Feature-Branch mit committetem Plan `openspec/changes/<slug>/tasks.md`
- **AND** die Datei existiert nicht im aktuellen Arbeitsverzeichnis
- **WHEN** `scripts/ticket.sh archive-plan --id <id> --branch <branch> --plan <pfad>` läuft
- **THEN** wird der Planinhalt aus dem Branch gelesen
- **AND** das Kommando endet mit Exit-Code 0

### Requirement: Embed-DB-Verbindung hat ein endliches Connect-Timeout

The system SHALL setze `connectionTimeoutMillis` auf dem pg.Pool in
`scripts/openspec-embed.mjs`, sodass ein nicht erreichbarer Datenbank-Port den
post-commit-Hook nicht unbegrenzt blockiert.

#### Scenario: DB-Port nicht erreichbar

- **GIVEN** der DB-Port (z. B. k3d-Published-Port 15432) ist belegt oder nicht
  erreichbar
- **WHEN** der Embed-Hook eine DB-Verbindung aufbaut
- **THEN** bricht der Connect nach spätestens 10 Sekunden ab
- **AND** die Kollisions-Diagnose wird als Ursache ausgegeben
- **AND** der Hook endet über den bestehenden Retry-/WARN-Pfad nicht-fatal

### Requirement: SDLC-Stack-Pfade lösen keinen fleet-Deploy aus

The system SHALL schließe `k3d/sdlc-stack/`-Pfade in
`scripts/devflow-post-merge-deploy.sh` vom `DEPLOY_K8S`-Routing aus, sodass Änderungen am
lokalen Dev-Stack keinen `task feature:deploy` auf fleet auslösen.

#### Scenario: Nur sdlc-stack-Dateien geändert

- **GIVEN** der Merge-Diff enthält ausschließlich `k3d/sdlc-stack/`-Pfade
- **WHEN** `devflow-post-merge-deploy.sh` die Routing-Tabelle auswertet
- **THEN** wird kein K8s-Deploy getriggert

#### Scenario: Gemischter Diff triggert weiterhin

- **GIVEN** der Merge-Diff enthält `k3d/websocket.yaml` (nicht sdlc-stack)
- **WHEN** `devflow-post-merge-deploy.sh` die Routing-Tabelle auswertet
- **THEN** wird der K8s-Deploy getriggert
