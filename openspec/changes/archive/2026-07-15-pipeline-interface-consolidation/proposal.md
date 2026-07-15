# Proposal: pipeline-interface-consolidation

## Why

`/admin/pipeline` (T001433: aus `/dev-status` verschoben) rendert `DevStatusTabs.svelte` mit sechs
Tabs — Floor, Planung, Analytics, Kosten, Steuerung, Abhängigkeiten. Die Tabs sind historisch als
Einzel-Features entstanden und liefern heute kein kohärentes Gesamtinterface:

- **Vier Design-Paletten** in einem Interface (Tailwind-Utilities im Floor, `--factory-*` in
  Steuerung/Analytics/DAG, `--pb-*`-Eigenpalette in der Planung, `--admin-*`/`--ink-*`/`--brass`
  in Kosten/ModelSlots) — Verstoß gegen `openspec/specs/admin-token-consolidation.md`.
- **Kein gemeinsamer Datenlayer:** `/api/factory-floor` wird von 8 Komponenten unabhängig
  gefetcht, `/api/factory-metrics` doppelt pro Analytics-Render; Refresh-Strategien gemischt
  (SSE / 5s-Poll / 30s-Poll / load-once) mit teils hartkodierten Literalen statt
  `factory-constants.ts`.
- **Fragmentierte Steuerung:** `/api/admin/factory-control` hat 7 Felder, der Steuerung-Tab
  zeigt 4; `contextBudget`, `spawnHarness`, `lavishDelegation` sind nur im `PortalSidekick`
  editierbar. Dazu drei konkurrierende Model-Routing-Flächen (FactoryModelSlots,
  KiProviderDrawer im Floor, `/admin/ki-konfiguration`).
- **Konkrete Bugs:** toter SSE-Handler in `PipelineSidekickView.svelte` (lauscht `onmessage`,
  der Stream sendet nur benannte `phase`/`heartbeat`-Events → Live-Refresh tot);
  `?tab=`-Deep-Links werden von `localStorage` überschrieben; Orphan `ViewSwitcher.svelte`;
  toter `/dev-status`-Nav-Match; Auth-Statuscode 403 statt 401 bei `/api/factory-budget`.

## What

Die sechs Pipeline-Tabs plus ihre direkten Ränder werden zu einem Gesamtinterface integriert
(Entscheidungen D1–D8 aus dem Brainstorming, SSOT:
`docs/superpowers/specs/2026-07-15-pipeline-interface-consolidation-design.md`):

1. **Gemeinsamer Datenlayer (D1):** Neues pures Store-Modul
   `website/src/lib/stores/factory-floor-store.ts` — genau eine SSE-Verbindung
   (`/api/factory-floor/stream`, benannte Events, Reconnect via `SSE_RECONNECT_MS`) und ein
   gecachter `FloorPayload`; FactoryFloor, StatusStrip, PhaseHeatmap, ShippedBar,
   PipelineSidekickView und DependencyGraph subscriben statt selbst zu fetchen. SSR-`initial`
   aus `pipeline.astro` seedet den Store; Verbindung schließt bei 0 Subscribern.
2. **Steuerung-Tab = Control-SSOT (D2):** `ControlPanel.svelte` modelliert alle 7
   `factory-control`-Felder; `PortalSidekick.svelte` verliert die Edit-UI der 3 Felder
   (Read-only + Deep-Link auf `?tab=control`) — echter Shrink der Budget-0-Datei.
3. **KI-Routing gebündelt (D3):** `KiProviderDrawer` wird aus `FactoryFloor.svelte`
   extrahiert (Shrink der Budget-0-Datei) und neben `FactoryModelSlots` als
   „KI-Routing"-Sektion im Steuerung-Tab gerendert; `/admin/ki-konfiguration` wird verlinkt.
4. **Globaler Analytics-Fensterfilter (D4):** Ein 7d/30d/all-Filter steuert alle fünf
   Analytics-Widgets (API-seitig wo vorhanden, sonst clientseitig).
5. **DAG event-getrieben (D5):** `DependencyGraph.svelte` ersetzt den hartkodierten
   5s-`setInterval` durch Store-Subscription (`phase`-Events).
6. **Token-Migration (D6):** Pipeline-Komponenten migrieren auf `--admin-*`-Tokens;
   `--pb-*`-Eigenpalette entfällt; kein Big-Bang außerhalb der Pipeline.
7. **Bugfixes (D7):** SidekickView-SSE via Store; `?tab=`-URL gewinnt über localStorage;
   `ViewSwitcher.svelte` gelöscht; `/dev-status`-Nav-Match entfernt; `.btn-back`-Leiche und
   `CustomEvent('submit')`-Hack in `FactoryBudgetPage.svelte` bereinigt; `/api/factory-budget`
   Auth-Code 403→401.

**Non-Goals:** Keine Cockpit-Fusion (D8 — Cockpit bleibt eigenständig, erhält Deep-Links);
keine Backend-/DAL-Umbauten (API-Contracts stabil, einzige Ausnahme der 403→401-Statuscode);
kein Anfassen von `/admin/ki-konfiguration`; keine Token-Migration außerhalb der
Pipeline-Komponenten; kein Wiederbeleben des DORA-UI (`openspec/specs/dora-dashboard.md`).

_Intel: `openspec/changes/pipeline-interface-consolidation/intel.json` (S1-Budgets: FactoryFloor
521/521 und PortalSidekick 578/578 → Budget 0, Extract-Pflicht)._

_Ticket: T001858_
