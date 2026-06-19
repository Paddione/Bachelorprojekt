---
title: "Cockpit-Sidebar → Globaler PortalSidekick"
slug: cockpit-sidekick-global
date: 2026-06-19
status: ready
ticket_id: null
plan_ref: null
areas:
  - website
  - admin
  - frontend
---

# Spec: Cockpit-Sidebar → Globaler PortalSidekick

## Warum (Problem)

Die `CockpitSidebar.svelte` ist ein dediziertes linkes Navigationspanel im `/admin/cockpit`-Layout.
Es belegt dauerhaft 240 px horizontale Fläche auf der Cockpit-Seite und ist **ausschließlich von dort**
erreichbar. Funktionen wie Feature-Auswahl, KI-Priorisierung (SuggestionBar) und Feature-Aktionen
(next_step, discard, major) sind damit auf eine Seite beschränkt.

Der globale `PortalSidekick` (FAB-Button unten rechts) existiert bereits auf allen Admin-Seiten
und hat ein sauberes View-System (`'tickets' | 'inbox' | 'pipeline' | ...`). Item 04 im Sidekick-
Menü (`Projekttickets`) verlinkt heute per `href` auf `/admin/tickets` statt eine echte View zu
öffnen.

## Was (Lösung)

1. `CockpitSidebar.svelte` aus dem Cockpit-Layout entfernen.
2. Ihre Funktionalität als neue `'cockpit'`-View in den globalen `PortalSidekick` integrieren.
3. Item 04 im Sidekick-Menü von einem `href`-Link zu einem Navigate-to-View umwandeln.
4. Kommunikation zwischen globalem Sidekick und Cockpit-Seite über `cockpitStore` + Custom Events.

## Komponenten-Architektur

### Neue Datei: `CockpitSidekickView.svelte`

Ort: `website/src/components/assistant/CockpitSidekickView.svelte`  
Syntax: **Svelte 5 Runes** (konsistent mit anderen `assistant/`-Komponenten)

Verantwortlichkeiten:
- Eigener Portfolio-Fetch von `/api/admin/cockpit/portfolio`
- Lauscht auf `cockpit:portfolio-mutated` Custom Event → refetch
- Feature-Selektion: `cockpitStore.selectFeature()` + `cockpit:feature-selected` Event
- Wenn User nicht auf `/admin/cockpit`: navigiert zu `/admin/cockpit?feature=<id>`
- Feature-Aktionen: direkter API-Call + anschließend `cockpit:portfolio-mutated` dispatchen
- SuggestionBar (Import aus `../admin/SuggestionBar.svelte`)
- Filter: Suchfeld + "nur mit offener Arbeit"-Toggle + Per-Product-Collapse (localStorage)

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `PortalSidekick.svelte` | `'cockpit'` zu View-Type + Import + titleMap + Render-Branch |
| `SidekickHome.svelte` | Item 04: `id:'cockpit'`, `href` entfernen, View-Type erweitern |
| `Cockpit.svelte` | CockpitSidebar entfernen, Window-Event-Listener, Full-Width-Layout |
| `CockpitSidebar.svelte` | LÖSCHEN |
| `CockpitSidebar.test.ts` | LÖSCHEN |
| `CockpitShell.integration.test.ts` | Sidebar-Referenzen prüfen & entfernen |

## Kommunikations-Bridge

```
┌─────────────────────┐    cockpitStore.selectedFeature    ┌──────────────────┐
│  CockpitSidekick-   │ ──────────────────────────────────> │   Cockpit.svelte │
│  View.svelte        │                                     │  (reagiert auf   │
│  (im globalen       │   cockpit:feature-selected Event    │   Store-Änderung │
│   PortalSidekick)   │ ──────────────────────────────────> │   + loadFeature) │
│                     │   cockpit:portfolio-mutated Event   │                  │
│                     │ ──────────────────────────────────> │   (loadPortfolio)│
└─────────────────────┘                                     └──────────────────┘
```

- `cockpitStore.selectedFeature`: Svelte-Store, global geteilt → automatische Reaktion
- `cockpit:feature-selected`: Custom Event, damit `Cockpit.svelte` `loadFeature()` aufruft
- `cockpit:portfolio-mutated`: Custom Event, damit `Cockpit.svelte` `loadPortfolio()` aufruft

## Navigation-Logik (Feature-Klick)

```
Benutzer klickt Feature in CockpitSidekickView
  → selectFeature(extId)
  → wenn window.location.pathname !== '/admin/cockpit':
      window.location.href = '/admin/cockpit?feature=' + extId
    sonst:
      window.dispatchEvent(new CustomEvent('cockpit:feature-selected', { detail: { extId } }))
```

## Layout-Änderung Cockpit

Vorher:
```
┌──────────────────────────────────────┐
│ [CockpitSidebar 240px] [CockpitTable]│
└──────────────────────────────────────┘
```

Nachher:
```
┌──────────────────────────────────────┐
│ [CockpitTable (volle Breite)         │
└──────────────────────────────────────┘
```

## UX-Konsequenzen

- Cockpit-Seite gewinnt ~240 px horizontale Fläche für die Ticket-Tabelle.
- Feature-Navigation über FAB → Item 04 "Projekttickets" → Cockpit-View (kein Seitensprung mehr).
- Der globale Sidekick kann auf 640 px expandiert werden für bequeme Feature-Navigation.
- Badge `pendingContainerCount` bleibt am Item erhalten.

## Akzeptanzkriterien

1. `/admin/cockpit` zeigt die CockpitTable ohne linke Sidebar (volle Breite).
2. Globaler Sidekick → Item 04 öffnet neue 'cockpit'-View (kein Redirect mehr).
3. Feature-Klick in der View: wenn auf `/admin/cockpit` → Tabelle aktualisiert sich; wenn woanders → Navigation zu `/admin/cockpit?feature=<id>`.
4. Feature-Aktionen (next_step, discard, major) funktionieren aus dem Sidekick heraus.
5. SuggestionBar rolliert und übernimmt Flags korrekt.
6. Filter, Collapse und activeOnly-Toggle persistieren in localStorage.
7. `CockpitSidebar.svelte` und `CockpitSidebar.test.ts` sind gelöscht.
8. Alle bestehenden Unit-Tests grün; `task test:all` PASS.
