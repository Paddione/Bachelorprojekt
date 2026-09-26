## ADDED Requirements

### Requirement: WIP-Uebersicht

Das System SHALL einen read-only Befehl bereitstellen, der den
unfertigen Zustand eines Repositories in einem Lauf zusammenfasst:
Worktrees, Agent-Locks, offene Pull Requests, nicht in `origin/main`
integrierte Branches und Stashes. Der Befehl SHALL keine Datei, keinen
Branch und keinen Lock veraendern.

#### Scenario: Uebersicht im Planlauf

- **GIVEN** ein Repository mit einem dirty Worktree ohne Lock, dessen
  Head-Caender aelter als `--stale-hours` ist
- **WHEN** der Aufrufer den Befehl mit `--json` aufruft
- **THEN** enthaelt die Antwort diesen Worktree mit Zustand `abandoned`
  **AND** der Repository-Zustand ist vor und nach dem Aufruf identisch

#### Scenario: Kurzantwort fuer Loop-Gates

- **GIVEN** ein Repository in beliebigem Zustand
- **WHEN** der Aufrufer den Befehl mit `--quiet` aufruft
- **THEN** enthaelt die Ausgabe genau eine Zeile mit den Zaehlern
  `abandoned`, `dirty`, `live_locks`, `open_prs` und `stashes`

#### Scenario: Fail-closed bei unsinnigen Argumenten

- **GIVEN** ein unbekanntes Flag oder ein nicht-numerisches `--stale-hours`
- **WHEN** der Befehl aufgerufen wird
- **THEN** endet er mit Exit-Code 2 **AND** einer Meldung auf stderr

### Requirement: Fail-closed WIP-Finisher

Das System SHALL einen Befehl bereitstellen, der liegengebliebenes WIP
erklaert und nur auf ausdrueckliche Freigabe abschliesst. Ohne
`--apply` **und** `--allow <aktionen>` SHALL keine Aktion ausgefuehrt
werden. Automatisch ausfuehrbar SHALL ausschliesslich die Aktion
`commit-dirty` sein, und diese nur, wenn der Aufrufer selbst einen
Live-Lock auf dem Worktree oder Branch haelt und kein Merge oder Rebase
in Arbeit ist.

#### Scenario: Planlauf aendert nichts

- **GIVEN** ein `abandoned`-Worktree mit uncommitteten Aenderungen
- **WHEN** der Befehl ohne `--apply` aufgerufen wird
- **THEN** wird fuer jeden Kandidaten eine Aktion mit Begruendung
  ausgegeben **AND** kein Commit entsteht

#### Scenario: Fremde Arbeit wird nicht committed

- **GIVEN** ein `abandoned`-Worktree, fuer den der Aufrufer keinen
  Live-Lock haelt
- **WHEN** `--apply --allow commit-dirty` aufgerufen wird
- **THEN** lautet das Ergebnis `skipped` mit dem Hinweis auf den
  fehlenden eigenen Lock **AND** der Arbeitsbaum bleibt unveraendert

### Requirement: 4B-Rail nur als Triagierer

Das System SHALL lokale Kleinmodelle (2. GPU, PK-Tablet im LAN) als
Triage-Rail einsetzen duerfen, jedoch ausschliesslich fuer das Lesen und
Einordnen. Die Rail SHALL mit genau einer Zeile der Form
`ACT=<aktion>|REASON=<kurz>` antworten. Eine Antwort, die eine nicht im
Angebot stehende Aktion nennt, oder eine unbrauchbare Antwort, SHALL
verworfen werden; es gilt dann die deterministische Heuristik. Die Rail
SHALL niemals Repo-Inhalt schreiben, committen, pushen oder Branches
loeschen.

#### Scenario: Nicht angebotene Aktion wird verworfen

- **GIVEN** eine erreichbare Rail, die `ACT=rm-rf-slash` vorschlaegt
- **WHEN** der Finisher laeuft
- **THEN** ist die Rail-Aktion `none` **AND** die Begruendung nennt, dass
  der Vorschlag verworfen wurde **AND** die Heuristik gilt

#### Scenario: Rail nicht erreichbar

- **GIVEN** keine erreichbare Rail
- **WHEN** der Finisher mit `--require-rail` aufgerufen wird
- **THEN** endet er mit Exit-Code 1 **AND** nennt die nicht erreichbaren
  Rails

#### Scenario: Heuristik als Rueckfallebene

- **GIVEN** ein `abandoned`-Worktree ohne Lock mit uncommitteten
  Aenderungen
- **WHEN** der Finisher laeuft
- **THEN** schlaegt die Heuristik `commit-dirty` vor, unabhaengig davon,
  ob eine Rail antwortet

### Requirement: WIP-Luecke im sdlc-autopilot

Der Skill `sdlc-autopilot` SHALL die WIP-Uebersicht als Schritt 0 vor der
Ticket-Inventur fuehren und das Aufraeumen liegengebliebener Arbeit als
eigenen, fail-closed Schritt beschreiben. "Clean" SHALL bedeuten: kein
Worktree im Zustand `abandoned` — `live` und `unlocked-dirty` sind per
Definition nicht abandoned. Stashes, offene PRs und Branch-Loeschungen
SHALL geplant, aber nie automatisch ausgefuehrt werden.

#### Scenario: Loop startet mit WIP-Lage

- **GIVEN** der Loop beginnt eine Iteration
- **WHEN** Schritt 0 laeuft
- **THEN** ist der WIP-Zustand vor der Ticket-Inventur bekannt
  **AND** ein `abandoned`-Eintrag fuehrt zum Aufraeum-Schritt, bevor ein
  neues Ticket angefasst wird
