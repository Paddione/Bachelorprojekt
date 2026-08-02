# sdlc-cockpit — Delta-Spec

## Purpose

K1 — Das dreischichtige Lavish Design-Kit und der Panel-Kontrakt für das SDLC Cockpit.
Der Kit-Vertrag umfasst Tokens (Schicht 1), Dokument-Bausteine (Schicht 2), Panel-Rahmen
(Schicht 3), Panel-Laufzeit und Daten-Adapter. Zwei Belegartefakte (Referenz-Board,
Cockpit-Hülle) belegen den Vertrag.

## ADDED Requirements

### Requirement: K1-01 — Design-Tokens

#### Scenario: K1-01 — Design-Tokens
`tokens.css` definiert alle Farben, Typografie, Abstände, Radien und Bewegungs-parameter
als CSS-Variablen. Keine hartkodierten Werte außerhalb der Token-Definition. (E11)

### Requirement: K1-02 — Dokument-Bausteine

#### Scenario: K1-02 — Dokument-Bausteine
`document.css` definiert Überschriften, Fließtext, Tabellen, Entscheidungsblöcke,
Frage-Marker, Code-Blöcke, Blockquotes, Listen. Per `<link>` von jedem Board nutzbar.

### Requirement: K1-03 — Panel-Rahmen

#### Scenario: K1-03 — Panel-Rahmen
`panel.css` definiert Panel-Frame, Kopf, Body, Aktions-Slot (4 Zustände: verfügbar/
gesperrt/bestätigung offen/läuft), Kontext-Slot. Drei Größen: Rail/Karte/Vollbild.
(D2–D6, D8, D12)

### Requirement: K1-04 — Panel-Laufzeit

#### Scenario: K1-04 — Panel-Laufzeit
`panel.js` implementiert Panel-Klasse mit vier Typen (Status/Strom/Canvas/Terminal),
Typ-gesteuertem Refresh/Fehler/Scroll-Verhalten, Action-Zustandsmaschine. (D2, D4, D5, D10–D13)

### Requirement: K1-05 — Daten-Adapter

#### Scenario: K1-05 — Daten-Adapter
`adapter.js` definiert den Adapter-Vertrag (E1, E16) und liefert Fixture-Daten für
6 Domänen (Tickets, Agents, CI, Cluster, Factory, Modelle). Kein `fetch()` in Panels.

### Requirement: K1-06 — Belegartefakte

#### Scenario: K1-06 — Belegartefakte
`reference-board.html` (Schicht 1+2) und `cockpit-shell.html` (Schicht 3) belegen
den Vertrag. Beide standalone, `file://`-öffnungsfähig, kein Build.

### Requirement: K1-07 — Tests

#### Scenario: K1-07 — Tests
6 Spec-BATS (Typdeklaration, Rail-Darstellung, kein direktes fetch, Token-Only,
Artefakt-Existenz, Kit-Binding) + 1 Vitest (Panel-Vertrag). Negativtests mit Positiv-Anker.
