# sdlc-cockpit

<!-- baseline SSOT für das SDLC Cockpit Epic -->

## Purpose

Das SDLC Cockpit ist ein agentisches Engineering Command Center für den
Bachelorprojekt-Software-Development-Lifecycle. Es ersetzt das heutige
`opencode-cockpit.html` durch ein dreischichtiges Design-Kit (Lavish) und
eine Panel-basierte Cockpit-Fläche.

---

## Requirements

### Requirement: Lavish Design-Kit — Dreischichtiges CSS-Token-System

The SSOT SHALL define ein Lavish Design-Kit mit drei Schichten: Tokens (Farben, Typografie, Abstände, Radien), Dokument-Bausteine (Überschriften, Tabellen, Code-Blöcke), und Panel-Rahmen (Frame, Kopf, Body, Aktions-Slot). (K1, E11)

#### Scenario: Ein Board lädt das Kit per `<link>` und verwendet Tokons statt Hardcode-Werte

- GIVEN ein Board lädt `tokens.css`, `document.css`, `panel.css`
- WHEN das Board Tokens wie `--lv-clr-primary` referenziert
- THEN werden die Design-Tokens korrekt angewandt

### Requirement: Panel-Laufzeit — Panel.create() mit vier Typen

The system SHALL implement a Panel-Klasse mit den Typen Status/Strom/Canvas/Terminal,
Typ-gesteuertem Refresh/Fehler/Scroll-Verhalten, und Action-Zustandsmaschine. (K1, D2, D4, D5, D10–D13)

#### Scenario: Panel erzeugen und Typ setzen

- GIVEN ein Panel wird via `Panel.create({type: 'status'})` erzeugt
- WHEN das Panel initialisiert ist
- THEN zeigt es den Status-Typ mit korrektem Frame, Kopf und Body an

### Requirement: Daten-Adapter — Kein direkter fetch() aus Panels

The system SHALL provide einen Adapter-Vertrag mit Fixture-Daten für 6 Domänen (Tickets, Agents, CI, Cluster, Factory, Modelle). Kein Panel ruft `fetch()` direkt auf. (K1, E1, E16)

#### Scenario: Panel verwendet Adapter statt fetch

- GIVEN ein Panel benötigt Modelldaten
- WHEN es den Adapter aufruft
- THEN erhält es Fixture-Daten ohne Netzwerkzugriff

### Requirement: Belegartefakte — Standalone-Board und Cockpit-Hülle

The system SHALL provide `reference-board.html` (Schicht 1+2) und `cockpit-shell.html` (Schicht 3) als standalone, `file://`-öffnungsfähige Belege ohne Build. (K1)

#### Scenario: Belegartefakt wird im Browser geöffnet

- GIVEN `reference-board.html` wird mit `file://` geöffnet
- WHEN die Seite lädt
- THEN werden Tokens und Dokument-Bausteine korrekt dargestellt

---

### Requirement: Epic-Liste als Daemon-Route (E6)

The system SHALL expose die laufenden Epics über die Daemon-Route
`GET /api/cockpit/epics`. The response SHALL carry a `fetchedAt` field (D12) and
SHALL contain either an `epics` list OR an `error` field — an empty list MUST NOT
mask a failure (D13). Browser access SHALL go exclusively through the adapter
method `data.epics()`; no panel calls `fetch()` directly (E1).

#### Scenario: The route is registered and responds

- **GIVEN** the daemon is running
- **WHEN** `GET /api/cockpit/epics` is called
- **THEN** it responds with HTTP 200
- **AND** the response contains `fetchedAt`

#### Scenario: A failure is named, not disguised as an empty list

- **GIVEN** the ticket source is unreachable
- **WHEN** `GET /api/cockpit/epics` is called
- **THEN** the response contains an `error` field
- **AND** a genuinely empty result set remains distinguishable from it

#### Scenario: No panel bypasses the adapter

- **GIVEN** a panel needs the epic list
- **WHEN** its source is checked for direct `fetch()` calls
- **THEN** it contains none
- **AND** access goes through `data.epics()`

### Requirement: Detection of foreign changes before export (OF1)

The system SHALL determine, before each canvas export, whether
`openspec/changes/` has been modified by others since the last export, and SHALL
offer this check via `GET /api/cockpit/epics/:id/changes-since`. Where no
reliable statement is possible — missing or unusable reference timestamp,
unreadable source — the response SHALL be `hasChanges: true`. The conservative
answer is binding because a `false` would, in the least certain case, advise
overwriting someone else's progress.

#### Scenario: Without a reference point, "possibly changed" applies

- **GIVEN** no or an unusable `ts` parameter
- **WHEN** `changes-since` is called
- **THEN** the response is `hasChanges: true`

#### Scenario: A timestamp is validated before it is used

- **GIVEN** a `ts` parameter that is not an ISO timestamp
- **WHEN** `changes-since` is called
- **THEN** it is rejected instead of being passed to the underlying command

### Requirement: The canvas export does not write server-side

The system SHALL perform the canvas export as a client-side operation. The
canvas SHALL NOT write to `openspec/changes/` through a daemon route while the
authentication design from K4 is outstanding. Only those artifact parts the
canvas itself authored are exported — `proposal.md` and `tasks.md` remain
untouched. This preserves the ownership boundary from OF1: "the canvas is the
source" means "the source for the parts it writes".

#### Scenario: No server-side write path

- **GIVEN** a user triggers the export
- **WHEN** the operation runs
- **THEN** the output is produced in the browser
- **AND** no writing daemon route is called

### Requirement: The daemon identifies its checkout to tests

The system SHALL report, in the response to `GET /health`, the checkout the
daemon was started from. Tests SHALL use this to determine whether the
responding daemon carries the code under test; otherwise the run SHALL be
skipped (locally) or fail (under `COCKPIT_DAEMON_REQUIRED`). Without this field a
daemon from a foreign working directory is indistinguishable from the correct
one — the suite then measures the wrong state and still reports a result.

#### Scenario: /health names the checkout

- **GIVEN** a running daemon
- **WHEN** `GET /health` is called
- **THEN** the response contains the field `root`

#### Scenario: A daemon from a foreign checkout is detected

- **GIVEN** a daemon from another working directory answers on the port
- **WHEN** the test precondition is evaluated
- **THEN** the test is skipped or fails
- **AND** the message names both the found and the expected checkout

### Requirement: Stil-Datenbank — kuratierte Sammlung geernteter Komponenten (E14)

The system SHALL provide eine Stil-Datenbank unter `.lavish/styles/` als versionskontrollierte
Repo-Dateien: eine JSON-Datei pro Eintrag nach einem strukturierten Schema (`id`, `name`, `zweck`,
`herkunft`, `beleg_ausschnitt`, `token_bezuege`, `tags`) plus ein Index `styles/index.json`, der
alle Einträge listet. (K9, E14)

#### Scenario: Ein Eintrag wird als JSON abgelegt

- **GIVEN** eine geerntete Komponente aus einem abgeschlossenen Prototypen
- **WHEN** sie in die Stil-Datenbank aufgenommen wird
- **THEN** liegt sie als `.lavish/styles/<id>.json` vor
- **AND** alle Pflichtfelder (`id`, `name`, `zweck`, `herkunft`, `beleg_ausschnitt`, `token_bezuege`) sind gefüllt
- **AND** `styles/index.json` listet den neuen Eintrag

#### Scenario: Nur Token-Bezüge statt fester Werte (D14)

- **GIVEN** ein Eintrag mit `beleg_ausschnitt`
- **WHEN** der Beleg auf Farb-/Größenwerte geprüft wird
- **THEN** enthält er ausschließlich Token-Bezüge, keine festen Hex-/Pixel-Werte
- **AND** jedes genannte Token ist in `.lavish/kit/tokens.css` definiert

> Der Planentwurf nannte hier `--lv-*` / `--color-*`. Ein `--lv-`-Präfix
> existiert im Repo nicht; maßgeblich sind die in `tokens.css` tatsächlich
> definierten Namen (`--color-*`, `--space-*`, `--radius-*`, `--text-*`,
> `--duration-*`, `--font-*`, `--ease-*`, `--leading-*`, `--weight-*`). Eine
> feste Liste würde hier bei jeder Token-Ergänzung veralten — geprüft wird
> deshalb gegen die Datei, nicht gegen eine Aufzählung.

### Requirement: Modell-Zugriff über Adapter und Daemon-Route

The system SHALL expose die Stil-Datenbank über die bestehende Adapter-/Daemon-Architektur:
Adapter-Methode `data.styles()` und Daemon-Route `GET /api/cockpit/styles` mit `fetchedAt`-Feld.
Kein Panel ruft `fetch()` direkt auf (E1). (K9)

#### Scenario: Adapter liefert Stil-Einträge

- **GIVEN** ein Panel benötigt Stil-Einträge
- **WHEN** es `data.styles()` aufruft
- **THEN** erhält es die Einträge aus `styles/index.json` mit `fetchedAt`
- **AND** bei nicht erreichbarer Quelle ein `error`-Feld statt stiller Null (D13)

#### Scenario: Daemon-Route antwortet

- **GIVEN** der Daemon läuft
- **WHEN** `GET /api/cockpit/styles` aufgerufen wird
- **THEN** antwortet er mit der Eintragsliste und `fetchedAt`

## Kind-Verteilung

| Kind | Ticket | Status |
|------|--------|--------|
| K1 — Lavish Design-Kit & Panel-Kontrakt | T002460 | in_progress |
| K2 — Daten-Adapter & lokaler Daemon | T002461 | triage |
| K3 — Layout-Engine | T002462 | triage |
| K4 — Steuerung & Audit | T002463 | triage |
| K5 — Epic-Canvas & Planungs-Workflow | T002464 | triage |
| K6 — Brain-Anbindung | T002465 | triage |
| K7 — Admin-Migration | T002466 | triage |
| K8 — Agentische Headed-Tests | T002467 | triage |
| K9 — Kunst-/Stil-Datenbank | T002468 | triage |

## Architektur-Entscheidungen

Siehe `openspec/changes/sdlc-cockpit-design/design.md`, Abschnitt „Getroffene Entscheidungen" (E1–E22).

<!-- merged from change delta sdlc-cockpit.md (1254cd25f840) -->

<!-- merged from change delta sdlc-cockpit.md (b6e25230b17f) -->