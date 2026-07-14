# admin-fundament — Delta-Spec

## Purpose

Dieser Epic-Spec definiert die Integrationsanforderungen für die Admin-Fundament-Konsolidierung.
Er beschreibt, wie die drei Welle-1-Sub-Tickets zusammenwirken und welche Qualitäts-Gates
nach jeder Welle erfüllt sein müssen.

Die eigentlichen Detail-Specs leben in den Sub-Ticket-Changes:
- `openspec/changes/admin-token-consolidation/specs/` (T001787)
- `openspec/changes/admin-modal-drawer/specs/` (T001788)
- `openspec/changes/admin-redirect-map/specs/` (T001789)

## ADDED Requirements

### Requirement: INTEGRATION-001 — Token-Konsolidierung ist vollständig

Alle Admin-Komponenten nutzen ausschließlich Tailwind `@theme`-Tokens. Es gibt
keine weiteren Token-Quellen (factory-tokens.css, inline hex-Werte ohne CSS-Variable).

#### Scenario: Keine alten Token-Imports
GIVEN die Welle-1-Token-Konsolidierung ist gemergt
WHEN `grep -r "factory-tokens" website/src/` ausgeführt wird
THEN sind keine Treffer zu erwarten (außer in CHANGELOG/kommentaren)

### Requirement: INTEGRATION-002 — Redirect-Map deckt alle Stubs ab

Die 23 ehemaligen Admin-Stub-Seiten sind in der REDIRECT_MAP in middleware.ts
registriert. Physische Stub-Dateien existieren nicht mehr.

#### Scenario: Redirect-Funktionalität
GIVEN die Welle-1-REDIRECT_MAP ist implementiert
WHEN ein Admin auf eine der 23 ehemaligen Stub-URLs zugreift
THEN wird er korrekt weitergeleitet (301/302) und kein 404 erhalten

### Requirement: INTEGRATION-003 — Natives Dialog-Muster als Standard

AdminModal und AdminDrawer nutzen natives `<dialog>`-Element. Das Muster ist
in der Admin-GUI der Standard für alle künftigen Modal/Drawer-Implementierungen.

#### Scenario: Dialog-Verhalten
GIVEN ein Admin öffnet ein Modal (z.B. Lösch-Bestätigung)
WHEN der Dialog angezeigt wird
THEN liefert der Browser Focus-Trap, Escape zum Schließen und `inert` für
Hintergrund-Inhalte ohne eigene Implementierung

### Requirement: INTEGRATION-004 — Keine regressions in bestehenden Tests

Alle drei Welle-1-Änderungen zusammen verursachen keine Test-Regressionen.

#### Scenario: Test-Suite grün nach Welle 1
GIVEN alle drei Welle-1-PRs sind gemergt
WHEN `task test:changed` ausgeführt wird
THEN sind alle Tests grün (keine neuen FAILs)
