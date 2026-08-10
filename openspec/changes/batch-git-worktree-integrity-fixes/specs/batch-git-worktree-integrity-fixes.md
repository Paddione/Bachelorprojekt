## ADDED Requirements

### Requirement: Teilweiser stash pop wird gemeldet

The system SHALL einen unvollständigen `git stash pop` (Konflikt, Rest verbleibt im Stash) als solchen melden statt als stillen Erfolg.

#### Scenario: Teilweiser pop nach Rebase

- **GIVEN** ein stash pop trifft auf einen Konflikt
- **WHEN** der pop abgeschlossen ist
- **THEN** meldet das System den verbleibenden Stash-Eintrag
- **AND** kein stiller Erfolg

### Requirement: Worktree-Schleife erkennt Waisenverzeichnisse

The system SHALL in der Worktree-Schleife Waisenverzeichnisse (Ordner ohne git-worktree-Bindung) erkennen und nicht als Hauptrepo messen.

#### Scenario: Waisenverzeichnis in .worktrees/

- **GIVEN** ein Ordner unter .worktrees/ ohne git-worktree-Bindung
- **WHEN** die Worktree-Schleife läuft
- **THEN** wird der Ordner als Waise erkannt, nicht als Hauptrepo gemessen

### Requirement: Write-Guard unterscheidet nebenläufige Subagenten einer Session

The system SHALL im worktree-write-guard nebenläufige Subagenten derselben Session als koordiniert erkennen statt als Besitzkonflikt zu melden.

#### Scenario: Zwei Subagenten einer Session

- **GIVEN** zwei Subagenten derselben Session arbeiten im selben Worktree
- **WHEN** der Write-Guard prüft
- **THEN** erfolgt keine irreführende Besitzkonflikt-Meldung
- **AND** fremde Sessions werden weiterhin als Konflikt erkannt

### Requirement: Stash ist worktree-lokal

The system SHALL einen worktree-lokalen Stash-Mechanismus bereitstellen, sodass Stashes eines Worktrees nicht in anderen Worktrees sichtbar sind.

#### Scenario: Parallelarbeit mit Stash

- **GIVEN** Worktree A und B existieren parallel
- **WHEN** Worktree A einen Stash anlegt
- **THEN** ist der Stash in Worktree B nicht sichtbar

### Requirement: Kaputte Loose-Objects vor fetch erkennen

The system SHALL vor `git fetch` kaputte 0-Byte-Loose-Objects erkennen und lokalisieren, statt den Repo-fetch still zu blockieren.

#### Scenario: 0-Byte-Object in einem Worktree

- **GIVEN** ein Worktree enthält ein 0-Byte-Loose-Object
- **WHEN** fetch ausgeführt wird
- **THEN** wird das Objekt erkannt und der betroffene Worktree benannt

### Requirement: Kein Falsch-Positiv "dirty" nach Crash

The system SHALL den ersten `git status` nach einer abgebrochenen git-Operation robust auswerten — keine Falsch-Positiv "dirty"-Meldung.

#### Scenario: Abgebrochene git-Operation

- **GIVEN** eine git-Operation wurde abgebrochen (Lockfiles/Index-Marker)
- **WHEN** git status läuft
- **THEN** meldet es nicht fälschlich "dirty"

### Requirement: Rebase verliert Freshness-Artefakte nicht still

The system SHALL nach einem konfliktfreien Rebase Freshness-Artefakte gegen den Pre-Rebase-Stand prüfen und einen Verlust melden statt ihn still zu akzeptieren.

#### Scenario: Artefakt-Commit geht beim Rebase verloren

- **GIVEN** ein Freshness-Artefakt-Commit ist auf dem Branch
- **WHEN** ein konfliktfreier Rebase läuft
- **THEN** bleibt das Artefakt erhalten oder der Verlust wird gemeldet
