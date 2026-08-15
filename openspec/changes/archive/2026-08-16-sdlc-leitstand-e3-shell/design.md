# Design: SDLC-Leitstand E3 — Leitstand-Shell

**Datum:** 2026-08-15 · **Ticket:** T007957 · **Epic:** T007553 (blocked_by T007559/E1+E2)
**Grundlage:** Epic-Design in `openspec/changes/sdlc-leitstand-e1-e2/design.md` (nach Archive:
`openspec/changes/archive/sdlc-leitstand-e1-e2/design.md`) — Grundsatzentscheidungen (Control
Room, `--ls-`-Token-Set, dark primär + Print-Light, kompakt, Leitstand-first, IA-2 Hybrid,
Help-Overlay-Prinzip) gelten unverändert und werden hier nicht neu verhandelt.

## E3-Entscheidungsprotokoll (Brainstorming 2026-08-15, Runde 2)

| Frage | Entscheidung |
|---|---|
| URL-Schema | **Query auf `/sdlc/cockpit`**: `?station=`, `?ticket=`, `?deck=` — kombinierbar; ersetzt `?mode=`/`?phase=`; alte Parameter werden auf neue gemappt (Redirect-Weiche in der Seite) |
| Toter Plattform/KI-Zweig | **In Decks reaktivieren**: die 12 Karten (Kill-Switch/DryRun/SlotCap/DailyCap/ContextBudget/SpawnHarness/LavishDelegation/StatusStrip, KostenTab/FactoryBudgetPage/FactoryObservability+KpiCard, LlmProxyPanel/KiRoutingPanel/FactoryModelSlots) werden Material der Decks Plattform + KI; `DevStatusTabs.svelte` stirbt ersatzlos |
| PlanningOffice | **Gemeinsam behalten** für Stationen Triage + Planung (Stations-Filter als Prop, keine Aufspaltung — YAGNI) |
| GoalsDashboard / `/sdlc/repohealth` | **Absorbieren** ins Qualität-Deck (Redirect der Seite formal in E5; die Komponente wird jetzt Deck-Modul) |
| Floor-`data-testid`s | **Stabil mappen**: neue Zonen-Komponenten tragen die in `software-factory.md` fixierten testids weiter (`factory-floor`, `floor-leitstand`, `floor-hall`, `floor-shipped`, `floor-slots`, `floor-workpiece`, `floor-detail`) — kein `software-factory.md`-Delta, E2E bleibt grün |
| Zonen-Controller | `FactoryFloor`-Store-Schicht (`floorStore`, `acquireFloor`, `ingestFloorPayload`) wird der gemeinsame Datencontroller für Z2–Z4. Die „Laderampe" (Backlog-Darstellung in `FactoryFloorLane.svelte`) bleibt unverändert Teil der Floor-Ansicht — die Z4-Ansicht der Station Triage ist `PlanningOffice` mit Stations-Filter (Korrektur 2026-08-15: die frühere Formulierung „Laderampe wird Z4-Triage-Ansicht" widersprach dem Zonen-Vertrag und hätte `FactoryFloorLane.svelte` außerhalb aller Partials angefasst) |
| Navigation | **Kein Voll-Reload mehr**: Selektion/Deck-Wechsel via `history.pushState` + Client-State; SSR liefert den initialen Zustand aus den Query-Params |
| purpose-Registry | `components/website/src/lib/sdlc/leitstand-purpose-registry.ts` entsteht in E3 mit Einträgen für JEDE Shell-Komponente (zweck/datenquelle/aktionen); Overlay-UI erst E5 |

## Zonen-Vertrag (je Zone genau ein Zweck)

| Zone | Zweck | Datenquelle | Komponenten (Wiederverwendung) |
|---|---|---|---|
| **Z1 Statusband** | Gesamtzustand auf einen Blick + Help-Toggle | `getSharedMetrics`/`deriveMetrics` (aus CockpitRail extrahiert), Stream-State | neu: `LeitstandStatusband.svelte`; Atome: `PilotLight`, `StatusStrip`-Extrakte |
| **Z2 Attention** | Handlungsbedarf, nie verdeckt | `buildAttention`-Payload via floorStore | `AttentionStrip` (hochgezogen aus FactoryFloor) |
| **Z3 Stationen-Achse** | Wertstrom Scout→Deploy permanent | floorStore (SSE) | `ConveyorBelt`/`StationColumn` (Umbau Kanban→kompakte Achse), `PhaseBadge`, `PilotLight` |
| **Z4 Kontextzone** | Tiefe/Aktion, folgt Selektion | floorStore + `/sdlc/api/cockpit/portfolio` (KPI-Leerlauf) + DORA später (E4) | leer→KPI-Raster (Aggregation aus OverviewDashboard-Datenpfad, neue schlanke Komponente); Station→`StagedColumn`/`ShippedColumn`/`AwaitingDeployLane`/`WorkpieceCard`/Laderampe bzw. `PlanningOffice` (Triage/Planung); Ticket→`DetailPanel`+`DetailPanelSidebar`+`SuggestedFiles` |
| **Z5 Deck-Leiste** | Nebendomänen, einzige umschaltende Zone | je Karte ihr bestehender Adapter | Decks: **Qualität** (GoalsDashboard; Tests/QA in E4), **Plattform** (Kill-Switch-/Budget-/Observability-Karten), **KI** (LlmProxyPanel, KiRoutingPanel, FactoryModelSlots, DispatchLogPanel, InsightsTab), **Wissen** (API-Katalog-Platzhalterkachel bis E4, OpenSpec-Suche) |

**Sterbeliste (ersatzlos):** `cockpit/CommandBar.svelte` (255 Z.), `cockpit/CockpitRail.svelte`
(308 Z. — Metrik-Logik wird extrahiert), `cockpit/OverviewDashboard.svelte` (351 Z. — Datenpfad
lebt im Z4-KPI-Raster weiter), `components/DevStatusTabs.svelte` (351 Z., toter Code).

## Spec-Delta-Rahmen

Klassifikation aller 60 Requirements aus `openspec/specs/sdlc-cockpit.md` (Recon 2026-08-15):
**9× LAYOUT** (MODIFIED/REMOVED — Command Bar, Overview-/Fokus-Modus, Rail, Layout-Persistence,
Default-View, Mobile-Bottom-Sheet, „Pipeline-Panel-Architektur"-Formulierung), **42× INVARIANT**
(unangetastet — Adapter, Schreibpfad, Realtime, Auth, Daemon), **9× GRENZFALL** (MODIFIED nur im
layout-gebundenen Teil: Pointer-Mechanik-Terminologie, Panel-Größen-Vokabular, Terminal-Lock-Ort,
Header→Statusband, Insights-Zugang→KI-Deck). `software-factory.md` bleibt ohne Delta
(testid-Mapping-Entscheidung). Die `/dev-status`-Redundanz (FA-UNIF) wird NICHT in E3 gelöst —
Folgenotiz für E5-Absorption.

## Schnittstellen-Kontrakte (p1 liefert · p3 prüft — verbindlich für beide Partials)

**Stationen-Vokabular (Achse = ganzer Wertstrom in drei Segmenten):**
Intake `triage`, `planung` → Fertigung `scout`, `design`, `plan`, `implement`, `verify`,
`deploy` → Ausgang `ship`. Neun Station-IDs; `PlanningOffice` bedient die
Z4-Ansicht von `triage`+`planung` (Filter-Prop), die Fertigungs-Stationen speist der
floorStore, `ship` zeigt die Shipped-Liste.

**Kontrakt A — purpose-Registry** (`components/website/src/lib/sdlc/leitstand-purpose-registry.ts`):

```ts
export interface LeitstandPurpose { zweck: string; datenquelle: string; aktionen: string[] }
export const leitstandPurposes: Record<string, LeitstandPurpose>
```

Key = Komponenten-/Zonen-Name (z. B. `statusband`, `attention`, `achse`, `kontextzone`,
`deck-qualitaet`, …). Guard-Semantik: Registry nicht leer (Positiv-Anker), jeder
`zweck`-String einzigartig, jede in `components/leitstand/` existierende Komponente hat
einen Eintrag.

**Kontrakt B — URL-lib** (`components/website/src/lib/sdlc/leitstand-url.ts`):

```ts
export interface LeitstandSelection { station?: string; ticket?: string; deck?: string }
export function parseLeitstandQuery(params: URLSearchParams): LeitstandSelection
export function toLeitstandQuery(sel: LeitstandSelection): string
```

`parseLeitstandQuery` mappt Legacy-Parameter: `phase=triage|planung|deploy|ship` →
gleichnamige Station, `phase=bauen` → keine Station (Achse ist ohnehin sichtbar),
`phase=review` → `verify`, `mode=insights` → `deck=ki`, `mode=overview` → leere
Selektion. Unbekannte Werte werden ignoriert (leere Selektion), nie geworfen.

**Präzisierungen (von p3 als RED-Test-Kontrakt festgeschrieben):**
- Präzedenz: neue Params (`station=`/`deck=`) gewinnen über Legacy (`phase=`/`mode=`),
  wenn beide vorhanden sind.
- Validierungs-Sets: Stationen = die 9 IDs oben; Decks = `qualitaet`, `plattform`,
  `ki`, `wissen`. Unbekannte Werte werden still verworfen.
- `toLeitstandQuery`: Feld-Reihenfolge `station, ticket, deck`, kein führendes `?`,
  leere Selektion → `''`.
- Registry-Keys: PascalCase→kebab-case des Datei-Basenames; das `Leitstand`-Präfix wird
  nur für Dateien direkt unter `components/leitstand/` gestrippt (nicht in `decks/`) —
  z. B. `statusband`, `kontextzone`, `deck-qualitaet`.

**Kontrakt C — Zonen-testids (Smoke-geprüft):** Z1 `leitstand-statusband`,
Z3 `leitstand-achse`, Z4 `leitstand-kontextzone`, Z5 `leitstand-deck-leiste`;
Z2 erhält keinen eigenen Wrapper-testid (AttentionStrip wird nur hochgezogen).
Zusätzlich bleiben die 7 Floor-testids aus `software-factory.md` stabil
(`factory-floor`, `floor-leitstand`, `floor-hall`, `floor-shipped`, `floor-slots`,
`floor-workpiece`, `floor-detail`).

Invarianten D12/D13, fail-soft pro Zone (fehlende Quelle blendet Zone-Inhalt aus, nie die Shell).
Tests: BATS-Guards (purpose-Registry-Vollständigkeit + Eindeutigkeit mit Positiv-Anker;
Query-Param-Mapping-Konvention), vitest für extrahierte Metrik-/Router-Logik (neue lib-Dateien
→ Vitest-Pflicht laut plan-quality-gates), `sdlc-cockpit-smoke.mjs` auf Zonen-Selektoren
erweitert, testid-Stabilität als expliziter Smoke-Check.
