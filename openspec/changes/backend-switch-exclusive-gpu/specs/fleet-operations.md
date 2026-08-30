## ADDED Requirements

### Requirement: Exactly One Local Inference Backend Loaded

The system SHALL ensure that at most one local inference backend holds GPU memory at any time,
and SHALL make the transition between them a single reversible operation rather than a sequence
of manual steps.

#### Scenario: Wechsel zum Vision-Backend gibt den VRAM frei

- **GIVEN** FreeToken bedient `:1919` und belegt den überwiegenden Teil des VRAM
- **WHEN** der Wechsel zum Vision-Backend angefordert wird
- **THEN** wird die FreeToken-Engine gestoppt, bevor LM Studio ein Modell lädt
- **AND** nach dem Wechsel antwortet `:1234` und `:1919` nicht mehr

#### Scenario: Rückkehr stellt die Engine identisch her

- **GIVEN** die FreeToken-Engine lief mit Flags, die das Startskript nicht setzt (etwa `--expert-load parallel`, `--moe-cpu-threads 8`, `--cors-origins`)
- **WHEN** nach dem Vision-Einsatz zurückgeschaltet wird
- **THEN** startet die Engine mit exakt denselben Argumenten wie vor dem Wechsel
- **AND** `/health` meldet `maintenance=serving`, bevor der Wechsel als abgeschlossen gilt

### Requirement: Engine Control Through the Daemon API

The system SHALL stop and start the FreeToken engine through the daemon control API on port
1900, and SHALL NOT rely on process-name matching for that purpose.

Rationale: an engine started by the FreeToken desktop app runs as `python.exe -m
freetoken.cli serve` beneath an `ft.exe daemon`. Scripts matching `ft.exe` with `serve` in the
command line miss it entirely and report success while the GPU stays occupied.

#### Scenario: Stop erfasst auch eine von der Desktop-App gestartete Engine

- **GIVEN** die Engine wurde von der FreeToken-Desktop-App gestartet und läuft als Kindprozess des Daemons
- **WHEN** der Stop über `POST :1900/engine/stop` ausgelöst wird
- **THEN** meldet die Antwort `drainComplete`
- **AND** der belegte VRAM ist anschließend freigegeben

#### Scenario: Startargumente werden vor dem Stop gesichert

- **WHEN** ein Wechsel weg von FreeToken beginnt
- **THEN** werden Modellpfad, Port und die vollständige Argumentliste der laufenden Engine persistiert, bevor sie gestoppt wird
- **AND** die Rückkehr verwendet ausschließlich diese gesicherten Werte

### Requirement: opencode Work Is Settled Before the Backend Is Removed

The system SHALL wait for an in-flight opencode request to finish, then compact and export the
session, before it stops the backend that request depends on.

#### Scenario: Laufender Request wird abgewartet, nicht abgebrochen

- **GIVEN** `GET /api/session/active` meldet eine Session mit laufendem Request
- **WHEN** ein Backend-Wechsel angefordert wird
- **THEN** wartet der Wechsel, bis die Session nicht mehr aktiv ist
- **AND** erst danach werden `compact` und Export ausgeführt

#### Scenario: Hängender Request führt zu definiertem Abbruch statt endlosem Warten

- **GIVEN** eine Session bleibt über das konfigurierte Zeitlimit hinaus aktiv
- **WHEN** das Zeitlimit überschritten wird
- **THEN** bricht der Wechsel mit einem von Null verschiedenen Exit-Code ab und lässt das laufende Backend unangetastet
- **AND** die Meldung nennt die Session-ID und den Weg zum manuellen Eingriff

### Requirement: Session Dumps Are Never Published

The system SHALL write session dumps to a directory that git ignores, and the ignore entry
SHALL exist before the first dump is written.

Rationale: the repository is public and session dumps carry conversation content.

#### Scenario: Dump-Verzeichnis ist ignoriert

- **GIVEN** Session-Dumps werden nach `.workdir/session-dumps/` geschrieben
- **WHEN** `git status --porcelain` nach einem Dump ausgeführt wird
- **THEN** erscheint keine Datei unterhalb von `.workdir/` als untracked oder staged
