---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-15
---

# Pipeline Interface Consolidation — Design-Spec

## Warum (Intent)

`/admin/pipeline` (T001433: aus `/dev-status` verschoben) rendert `DevStatusTabs.svelte` mit sechs
Tabs (Floor, Planung, Analytics, Kosten, Steuerung, Abhängigkeiten). Die Tabs sind historisch als
Einzel-Features entstanden und wirken heute nicht wie *ein* Interface: vier verschiedene
Design-Paletten, kein gemeinsamer Datenlayer (acht unabhängige `/api/factory-floor`-Fetches,
Doppelfetches im Analytics-Tab), ein Refresh-Zoo (SSE / 5s-Poll / 30s-Poll / load-once),
fragmentierte Steuerung (3 von 7 `factory-control`-Feldern nur im PortalSidekick editierbar,
drei konkurrierende Model-Routing-Flächen) und konkrete Bugs (toter SSE-Handler im
PipelineSidekickView, `?tab=`-Deep-Links werden von localStorage überschrieben).

Ziel: Die sechs Tabs plus ihre direkten Ränder zu einem kohärenten Gesamtinterface integrieren —
ein Datenlayer, eine Palette, eine Steuerungs-Wahrheit, funktionierende Deep-Links.

## Scope (User-Entscheidung)

- **In Scope:** die 6 Tabs unter `/admin/pipeline`, PipelineSidekickView (SSE-Fix via Store),
  PortalSidekick (Control-Edit-UI wandert in den Steuerung-Tab), Orphan-/Leichen-Cleanup,
  Design-Token-Migration der Pipeline-Komponenten.
- **Out of Scope:** Cockpit-Fusion (Cockpit bleibt eigenständig, erhält nur Deep-Links),
  Backend-/DAL-Umbauten, `/admin/ki-konfiguration` (wird verlinkt, nicht angefasst),
  globale Token-Migration außerhalb der Pipeline-Komponenten.

## Entscheidungen (Brainstorming 2026-07-15, Lavish-Board `.lavish/pipeline-interface-consolidation-brainstorm.html`)

### D1 — Gemeinsamer Datenlayer: `factory-floor-store.ts`

Neues pures Store-Modul `website/src/lib/stores/factory-floor-store.ts` (Svelte-Store, kein
Component-State): hält genau **eine** `EventSource`-Verbindung zu `/api/factory-floor/stream`
(benannte Events `phase` / `heartbeat`, Reconnect über `SSE_RECONNECT_MS` aus
`factory-constants.ts`) und einen gecachten `FloorPayload` (Erst-Load per `GET /api/factory-floor`,
Refresh bei `phase`-Event). Konsumenten subscriben statt selbst zu fetchen:

- `FactoryFloor.svelte` (ersetzt eigene SSE-+Fetch-Logik → Shrink),
- `StatusStrip.svelte` (ersetzt den 30s-Vollpayload-Poll für `watchdogStale`),
- `FactoryPhaseHeatmap.svelte`, `FactoryShippedBar.svelte` (ersetzt Doppelfetch),
- `PipelineSidekickView.svelte` (ersetzt den **toten** `onmessage`/`data.floor`-Handler — Bugfix),
- `DependencyGraph.svelte` (D5).

Der SSR-`initial`-Prop aus `pipeline.astro` seedet den Store. Referenz-Zählung: Verbindung wird
bei 0 Subscribern geschlossen. `/api/factory-metrics` wird analog einmal pro Analytics-Render
geteilt (einfacher modulinterner Cache im selben Store-Modul, kein zweites SSE).

### D2 — Steuerung-Tab ist die Control-SSOT (alle 7 Felder)

`ControlPanel.svelte` modelliert alle 7 Felder von `GET/PATCH /api/admin/factory-control`:
killSwitch, dryRun, slotCap, dailyCap **+ contextBudget, spawnHarness, lavishDelegation**
(drei neue Karten analog zu den bestehenden Card-Komponenten). `PortalSidekick.svelte`
(578 LOC, S1-Budget 0) verliert seine Edit-UI für diese 3 Felder — dort bleibt eine
Read-only-Anzeige mit Deep-Link auf `/admin/pipeline?tab=control` → echter Shrink.

### D3 — KI-Routing im Steuerung-Tab gebündelt

Der `KiProviderDrawer` (Provider-Prioritäten je Phase, `/api/admin/ki/*`) wird aus
`FactoryFloor.svelte` (521 LOC, S1-Budget 0) in eine eigenständige Komponente extrahiert und
im Steuerung-Tab als „KI-Routing"-Sektion **neben** `FactoryModelSlots` gerendert (zwei
komplementäre Flächen an einem Ort: Slots = Modell je Phase, Provider = Priorität/Tiers je
Phase). Der Floor-Tab behält keinen Drawer; `/admin/ki-konfiguration` wird aus der Sektion
verlinkt. FactoryFloor shrinkt dadurch real.

### D4 — Globaler Analytics-Fensterfilter

Ein 7d/30d/all-Filter oben im Analytics-Tab (heute nur in `DeliveryHistory`) steuert alle
fünf Widgets. Wo die API kein Fenster kennt (`/api/factory-metrics`, `/api/factory-floor`),
wird clientseitig gefiltert; `/api/admin/delivery-metrics?window=` bleibt wie er ist.

### D5 — DependencyGraph event-getrieben

Der hartkodierte 5s-`setInterval` entfällt; der Graph subscribt den Store und lädt
`/api/tickets/graph` nur bei `phase`-Events neu (plus Erst-Load).

### D6 — Design-Tokens: eine Palette für die Pipeline

Alle Pipeline-Komponenten migrieren auf die `--admin-*`-Token-Familie gemäß
`openspec/specs/admin-token-consolidation.md`:

- Die selbstgebaute `--pb-*`-Palette in `PlanningOffice.svelte` entfällt ersatzlos.
- `--factory-*`-Verwendungen in den Pipeline-Komponenten werden auf `--admin-*` (bzw.
  bestehende dünne Aliasse) umgestellt; **kein** Big-Bang an Komponenten außerhalb der Pipeline.
- Tailwind-Utility-Inseln (Floor) ziehen auf dieselben Tokens.
- Kein Emoji im Admin-UI (bestehende Konvention).

### D7 — Bugfixes im Zug der Konsolidierung

1. `PipelineSidekickView.svelte`: toter SSE-Handler (lauscht `message`, Stream sendet nur
   benannte `phase`/`heartbeat`-Events) — behoben durch Store-Subscription (D1).
2. `DevStatusTabs.svelte`: `?tab=`-URL **gewinnt** über `localStorage['dev-status-tab']`;
   localStorage ist nur Fallback, wenn kein `?tab=` gesetzt ist (Deep-Links aus Leitstand-
   Kacheln und Sidekick funktionieren damit zuverlässig).
3. Orphan `website/src/components/factory/ViewSwitcher.svelte` wird gelöscht.
4. Toter Nav-Match `'/dev-status'` in `AdminSidebarNav.astro` entfernt.
5. `.btn-back`-Style-Leiche und der synthetische `CustomEvent('submit')`-Hack in
   `FactoryBudgetPage.svelte` werden bereinigt.
6. Auth-Statuscode von `/api/factory-budget` von 403 auf 401 vereinheitlicht (wie alle
   Geschwister-Endpoints).

### D8 — Cockpit bleibt eigenständig

Keine Fusion. Cockpit-Flächen, die Factory-Daten zeigen (`CockpitExpandRow`), bleiben;
sinnvolle Stellen erhalten Deep-Links auf `/admin/pipeline?tab=…`.

## Constraints

- **S1-Ratchet:** `FactoryFloor.svelte` (521/521) und `PortalSidekick.svelte` (578/578) haben
  Budget 0 — beide werden durch D2/D3 real verkleinert (Extract, nicht kosmetisch). Alle
  Budgets vorberechnet in `openspec/changes/pipeline-interface-consolidation/intel.json`.
- **API-Contracts stabil:** UI-only; einzige Backend-Änderung ist der 403→401-Statuscode
  (D7.6). Kein DDL, keine neuen Endpoints.
- **DORA-Stub respektieren:** `openspec/specs/dora-dashboard.md` — Analytics-Konsolidierung
  darf kein DORA-UI wiederbeleben.
- **Specs als Soll-Quelle:** `software-factory.md` (Floor/Lanes/Attention),
  `planning-office.md` (Planung + Delivery-Metrics), `admin-cockpit.md` (Toolbar-/Emoji-
  Konventionen), `admin-token-consolidation.md` (Token-SSOT).
- Keine Brand-Domain-Literale in Code (S3); Store als pures Modul ohne Import-Zyklen (S2).

## Verifikation (Erwartung an den Plan)

- BATS: `tests/spec/`-Datei zur Parent-Spec ergänzt Szenarien (Store-Modul existiert & wird
  von den Konsumenten importiert; ControlPanel kennt 7 Felder; kein `--pb-*` mehr;
  DependencyGraph ohne `setInterval`; ViewSwitcher gelöscht).
- Failing-Test-Step rot→grün gemäß plan-lint STRUCT2.
- Finale Verify-Kommandos: `task test:changed`, `task freshness:regenerate`,
  `task freshness:check`; nach Teständerungen `task test:inventory` + Commit des Inventars.
