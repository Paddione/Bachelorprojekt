# Design: sdlc-dashboard-redesign

> Architektur-Entscheidungen aus dem Brainstorming (`.lavish/sdlc-dashboard-redesign-brainstorm.html`)

## D1 — Navigationsmodell: Command Bar + Overview/Fokus

```
┌─────────────────────────────────────────────────────────────┐
│ COMMAND BAR                                                  │
│ 🟢 Cluster │ ⚡Watchdog │ 👤 2 Agents │ 🎯 3/5 Slots │ 🔀 2 PRs │ ⏱ Tick 01:23 │ [Overview|Fokus] │
├──────────────┬──────────────────────────────────────────────┤
│ RAIL         │ HAUPTFLÄCHE                                   │
│ (kontext-    │                                               │
│  sensitiv)   │  Overview: Lifecycle-Status, Attention, PRs   │
│              │  Fokus:    Phasen-Detail (FactoryFloor etc.)  │
└──────────────┴──────────────────────────────────────────────┘
```

- **Command Bar**: Schmale, persistente Status-Leiste oben. Immer sichtbar.
- **Overview-Modus**: Aggregierte Lifecycle-Übersicht. Zeigt alle 6 Phasen mit Ticket-Counts, Attention-Sektion (blocked, stuck, cooldowns), offene PRs.
- **Fokus-Modus**: Detail-Ansicht einer SDLC-Phase. Enthält die existierenden Komponenten (FactoryFloor, PlanningOffice, etc.).

## D2 — Wählbare Default-Ansicht

- localStorage key: `cockpit:default-view` mit Wert `overview` oder `fokus:<phase>`
- Beim Laden: Präferenz anwenden, Fallback auf Overview
- Versionierung des Keys (z.B. `cockpit:default-view:v1`)

## D3 — Kontext-sensitive lebendige Rail

Rail-Inhalt pro Modus:
| Modus/Phase | Rail-Inhalt |
|---|---|
| Overview | Attention (blocked, stuck, cooldowns), Laufende Epics, Aktive Agenten, Modell-Server |
| Fokus: Planung | DoR-Scores, Queue-Tiefe, Planungs-Metriken |
| Fokus: Bauen | Slot-Usage, Aktive Workpieces, Agent-Logs |
| Fokus: Review | Offene PRs, CI-Status pro PR |
| Fokus: Deploy | Awaiting-Deploy-Tickets, FluxCD-Status |
| Insights | Trace-Liste, Modell-Performance |

## D4 — Unified Panel System

- `Panel.register()` akzeptiert Svelte-Komponenten als Panel-Typ
- `PipelinePanel.svelte` entfällt komplett
- Kit `panel.js`: `Panel.run()` erkennt Svelte-registrierte Panels und überschreibt deren Body nicht
- Alle Panels (Rail + Workspace) nutzen dieselbe Panel-API

## D5 — Insights-Tab mit Trace-Recording

- Neuer `InsightsTab.svelte` 
- Metriken: nur echte Daten (nicht Throughput/Heatmap/ShippedBar)
- Trace-Recording: Factory-Durchläufe werden in `tickets.factory_traces` oder ähnlich persistiert
- Alte Komponenten entfernen: `FactoryKpiGrid`, `FactoryThroughputChart`, `FactoryPhaseHeatmap`, `FactoryShippedBar`, `AnalyticsWindowFilter`

## D6 — Mobile: Bottom-Sheet + Swipe

- Viewport < 768px: Command Bar → Top Bar, Phasen-Navigation → Bottom Sheet
- Swipe-Gesten zwischen Overview und Fokus-Phasen
- Non-reversible actions per Session-Lock gesperrt (bestehendes Verhalten)

## URL-Schema

- `/admin/cockpit` — Default (Overview oder User-Präferenz)
- `/admin/cockpit?mode=overview` — Overview
- `/admin/cockpit?mode=fokus&phase=bauen` — Fokus: Bauen
- Redirect: `/sdlc/cockpit` → `/admin/cockpit` (301 mit Query-Erhalt)

## Zu erhaltende Komponenten

- `FactoryFloor.svelte` — integriert in Fokus/Bauen
- `PlanningOffice.svelte` — integriert in Fokus/Planung (mit Sub-Komponenten)
- `DependencyGraph.svelte` — Overlay in Planung
- `ControlPanel.svelte` — Elemente wandern in Command Bar
- `FactoryModelSlots`, `KiRoutingPanel`, `LlmProxyPanel` — in Rail (Steuerung-Kontext)
- `KostenTab.svelte` — als Metrik in Insights
- `CockpitSidekickView.svelte` — unverändert (Detail-Drawer)

## Zu entfernende Komponenten

- `PipelinePanel.svelte` + `PipelinePanel.test.ts`
- `DevStatusTabs.svelte` (ersetzt durch Overview/Fokus-Architektur)
- `FactoryKpiGrid.svelte`, `FactoryThroughputChart.svelte`, `FactoryPhaseHeatmap.svelte`, `FactoryShippedBar.svelte`
- `AnalyticsWindowFilter.svelte`
