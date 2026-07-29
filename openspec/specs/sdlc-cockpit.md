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
