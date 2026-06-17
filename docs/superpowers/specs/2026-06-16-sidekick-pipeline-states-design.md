---
ticket_id: null
plan_ref: null
status: active
date: 2026-06-16
---

# Design: Sidekick-Pipeline-Ansicht + Pipeline-Richtungs-Konsolidierung

> Stateful Ticketing sichtbar machen: ein neuer Pipeline-View im Sidekick-Drawer, der die
> Ticket-Lebenszyklus-States vorne→hinten zeigt — und die *eine* geordnete Quelle, aus der
> alle Pipeline-Ansichten ableiten, damit „verkehrt herum" strukturell unmöglich wird.
>
> **Basis:** `origin/main` · **Branch:** `feature/sidekick-pipeline-states`
> **Tickets:** SP1=T000919 · SP2=T000920 · SP3=T000921 · SP4=T000922 (SP3/SP4 → SP1)

## 1. Problem & Intent

Wir haben jetzt stateful Ticketing. Der Sidekick — die zentrale Drawer-UI
(`PortalSidekick.svelte`, in allen Layouts gemountet) — macht daraus aber **keinen Nutzen**:
es gibt keine Pipeline-/Lane-Übersicht, und das einzige State-betreffende Element
(`TicketSidekickView`) hat ein **stale 7-State-Enum**, das `planning/plan_staged/qa_review`
gar nicht kennt → Tickets in diesen States bekommen ein leeres/falsches Dropdown.

Zugleich läuft die existierende Pipeline-Visualisierung (Factory-Floor unter `/dev-status`)
in der Desktop-Ansicht **verkehrt herum**: die Macro-Lane-DOM-Reihenfolge rendert
`ShippedColumn` (done, `FactoryFloor.svelte:372`) **VOR** der QS-Abnahme-Lane
(qa_review, `:381`) — invers zum echten Lebenszyklus `qa_review → done`.

**Wurzelursache:** Die kanonische Reihenfolge existiert **nicht an einer Stelle**. Sie wird
per Copy-Paste redeklariert (`FactoryFloor.svelte` STATIONS + Macro-Lane-DOM,
`factory/MobileTabBar.svelte` TABS, `MOBILE_COL_INDEX`) — Drift ist die natürliche Folge.

**Ziel:**
1. Eine geordnete Lane-SSOT in `lib/factory-floor.ts`, aus der **alle** Ansichten ableiten.
2. Ein neuer, admin-gateter **Pipeline-View im Sidekick-Drawer**: Lane-Streifen vorne→hinten
   mit Counts, Drill-down auf einen Lebenszyklus-Stepper pro Ticket.
3. Die stale State-Enums (Sidekick, Transition-Gate) auf das vollständige State-Modell ziehen.
4. Die Factory-Floor-Desktop-Reihenfolge gerade ziehen und aus der SSOT ableiten.

## 2. Kanonische Pipeline-Reihenfolge (SSOT) — Stand origin/main

Quelle der gültigen States (Set): DB-CHECK in `website/src/lib/tickets-db.ts` + `ALL_TICKET_STATUSES`
in `lib/factory-floor.ts` (auf main: 10 States). Quelle der **Reihenfolge** (front→back) ab jetzt:
`PIPELINE_LANES` in `lib/factory-floor.ts`.

```
Planung        (triage, planning)
Kommissioniert (plan_staged)
Laderampe      (backlog)
In Arbeit      (in_progress, in_review)     ← Phasen scout→deploy orthogonal (PHASE_ORDER)
QS-Abnahme     (qa_review)
Fertig         (done)
── Seiten-Lanes (side:true, nicht Teil der linearen Pipeline) ──
Blockiert      (blocked)
Archiv         (archived)
```

`PHASE_ORDER = [scout,design,plan,implement,verify,deploy]` bleibt die *orthogonale*
In-Arbeit-Achse, kein State.

### Vorwärts-Kompatibilität: `awaiting_deploy` (PR #1786, NICHT in diesem Scope)
Der `awaiting_deploy`-State („gemergt, noch nicht auf fleet") lebt auf dem in-flight
Branch `feature/openspec-native-workflow` (PR #1786) und ist **nicht auf main**. Diese Arbeit
**fügt ihn nicht hinzu**. Aber die SSOT ist so gebaut, dass `awaiting_deploy` später ein
**1-Zeilen-Insert** zwischen `qa` und `shipped` in `PIPELINE_LANES` ist — alle Views + Tests
ziehen automatisch nach. (Damit hilft diese SSOT der späteren #1786-Integration, statt zu
kollidieren.) Der Front-to-back-Test (SP1) ist gegen genau dieses Einfügen robust.

## 3. SSOT-Interface-Contract (verbindlich für alle Sub-Pläne)

Sub-Plan 1 exportiert aus `website/src/lib/factory-floor.ts` (oder einem importsauberen
Helfer `website/src/lib/tickets/pipeline-order.ts`, falls S2-Modulgrenzen es verlangen):

```ts
export interface PipelineLane {
  key: 'planning' | 'staged' | 'loadingDock' | 'hall' | 'qa' | 'shipped'
     | 'attention' | 'archive';
  label: string;            // deutsches Anzeige-Label
  statuses: TicketStatus[]; // zugehörige Status, in Reihenfolge
  side: boolean;            // true = nicht Teil der linearen Pipeline (blocked/archived)
}

// Die EINZIGE geordnete Deklaration (front→back). Alles andere wird hieraus abgeleitet.
export const PIPELINE_LANES: readonly PipelineLane[];

// Abgeleitet: lineare Status-Rungs (nur side:false), in Reihenfolge.
export const PIPELINE_STATUSES: readonly TicketStatus[];

// Abgeleitet/zentralisiert: Status → Lane-Key (ersetzt die handgepflegte Map).
export const STATUS_BUCKETS: Record<TicketStatus, PipelineLane['key']>;
```

- `ALL_TICKET_STATUSES` bleibt erhalten (Backward-Compat), wird aber aus `PIPELINE_LANES`
  abgeleitet bzw. dagegen getestet. **Werte von `STATUS_BUCKETS` müssen identisch zur heutigen
  Map bleiben** (keine Verhaltensänderung) — nur die *Quelle* wird zentralisiert.
- `PHASE_ORDER` bleibt unverändert.
- Consumer (Sub-Pläne 3 & 4) **importieren** diese Konstanten und deklarieren **nichts** neu.

## 4. Sub-Plan-Zerlegung & Datei-Eigentümerschaft

Vier Sub-Pläne, kollisionsfrei parallelisierbar in zwei Wellen. Jede Datei gehört **genau einem**
Sub-Plan (keine geteilten Edits über Sub-Plan-Grenzen).

| # | Ticket | Sub-Plan | Exklusive Dateien | Hängt ab von |
|---|--------|----------|-------------------|--------------|
| **1** | T000919 | Geordnete Lane-SSOT | `website/src/lib/factory-floor.ts` (+ ggf. neu `website/src/lib/tickets/pipeline-order.ts`); neuer Test `website/src/lib/factory-floor.order.test.ts` | — (Fundament) |
| **2** | T000920 | Stale-Enum-Konsistenz | `website/src/lib/tickets/transition.ts`, `website/src/lib/tickets/cockpit-labels.ts`, `website/src/components/assistant/TicketSidekickView.svelte` (+ Tests) | — |
| **3** | T000921 | Sidekick-Pipeline-View | **neu** `website/src/components/assistant/PipelineSidekickView.svelte`, `website/src/components/PortalSidekick.svelte`, `website/src/components/assistant/SidekickHome.svelte`, `website/src/styles/sidekick-panels.css`, `website/src/lib/assistant/sidekick-nudge.ts` (+ Tests) | 1 |
| **4** | T000922 | FactoryFloor-Richtung | `website/src/components/FactoryFloor.svelte`, `website/src/components/factory/MobileTabBar.svelte`, `website/src/components/factory/ConveyorBelt.svelte` | 1 |

**Wellen:** Welle 1 = `{1, 2}` parallel. Welle 2 = `{3, 4}` parallel (beide konsumieren 1).
`TicketSidekickView.svelte` gehört **nur** Sub-Plan 2; Sub-Plan 3 fasst es nicht an.
`factory-floor.ts` gehört **nur** Sub-Plan 1; Sub-Plan 4 importiert nur daraus.

### Sub-Plan 1 — Geordnete Lane-SSOT (T000919)
- `PIPELINE_LANES` als einzige geordnete Deklaration; `PIPELINE_STATUSES` + `STATUS_BUCKETS`
  daraus ableiten; `ALL_TICKET_STATUSES` gegen die SSOT testen.
- **Front-to-back-Regressionstest** (`factory-floor.order.test.ts`): deklariert die Soll-Sequenz
  und prüft, dass `PIPELINE_STATUSES`, die abgeleitete `STATUS_BUCKETS`-Lane-Zuordnung sowie
  (importiert) `MobileTabBar.TABS` / `MOBILE_COL_INDEX` / FactoryFloor-Macro-Lane-Reihenfolge
  exakt der SSOT entsprechen. Die Component-Order-Assertions greifen erst, wenn Sub-Plan 4 die
  Ableitung verdrahtet — der Test wird in SP1 geschrieben, ggf. mit `it.todo`/Skip für die
  Component-Teile markiert und in SP4 scharf geschaltet.
- **Akzeptanz:** `pnpm vitest run factory-floor.order` grün; STATUS_BUCKETS-Werte identisch zur
  alten Map (keine Verhaltensänderung an bestehenden Consumern).

### Sub-Plan 2 — Stale-Enum-Konsistenz (T000920)
- `transition.ts`: `TicketStatus` + `VALID_STATUSES` um **`qa_review`** erweitern (auf main
  fehlt qa_review im manuellen Transition-Gate → wirft heute `invalid status`). qa_review ist
  **nicht-terminal** → keine Resolution erforderlich; `done/archived`-Regeln unverändert.
- `cockpit-labels.ts`: auf main ist das `qa_review`-Label bereits vorhanden — sicherstellen,
  dass `STATUS_LABELS` für **alle** auf main gültigen States ein Label hat (Lücken schließen,
  keine erfinden).
- `TicketSidekickView.svelte:5`: lokales 7-State-Enum entfernen, Labels/Status **aus
  `cockpit-labels.ts` importieren** (Single Source) → Dropdown kennt `planning/plan_staged/qa_review`.
- **Automation unangetastet:** `scripts/factory/pipeline.js` nicht ändern.
- **Akzeptanz:** Unit-Test, dass der manuelle `/transition`-Pfad `qa_review` akzeptiert;
  `TicketSidekickView` rendert für ein Ticket in jedem auf main gültigen State eine passende
  Option (kein leeres Dropdown).

### Sub-Plan 3 — Sidekick-Pipeline-View (Headline) (T000921)
- Neu `PipelineSidekickView.svelte`: fetcht `GET /api/factory-floor`, mappt die zurückgegebenen
  Lanes via `PIPELINE_LANES` auf den vertikalen **Lane-Streifen** (vorne→hinten, Count + Mini-Balken).
  **Hinweis Plan-Autor:** die exakte `FloorPayload`-Form auf main verifizieren
  (`website/src/pages/api/factory-floor.ts` + `lib/factory-floor.ts`); auf main existiert **keine**
  `awaitingDeploy`-Lane — der Streifen iteriert `PIPELINE_LANES`, fehlende Lanes = Count 0.
- **Drill-down:** Klick auf Lane/Ticket → Lebenszyklus-Stepper (✓ erledigt / ● aktuell / ○ offen)
  entlang `PIPELINE_LANES`; für In-Arbeit-Tickets `factory/PhaseStepper.svelte` wiederverwenden.
- **Live:** Subscribe auf vorhandenen `GET /api/factory-floor/stream` (SSE), falls auf main
  vorhanden; sonst Fetch beim Öffnen des Views (Plan-Autor verifiziert Stream-Route auf main).
- **Wiring (5-Schritt-Seam):** `View`-Union + `titleMap` (`PortalSidekick.svelte:15,64`),
  Drawer-Branch (~`:263`), Menüeintrag (`SidekickHome.svelte:35-44`, `show: isAdmin`),
  CSS in `styles/sidekick-panels.css` **scoped unter `.drawer`** (kein scoped `<style>`),
  Deep-Link in `sidekick-nudge.ts:6-11` (`KNOWN_VIEWS`).
- **Admin-gated:** sichtbar nur bei `helpContext==='admin'` (wie tickets/inbox).
- **Akzeptanz:** Render-Test mit gemocktem `FloorPayload` zeigt Lanes in SSOT-Reihenfolge;
  Drill-down-Stepper markiert die korrekte aktuelle Lane.

### Sub-Plan 4 — FactoryFloor-Richtungs-Fix (T000922)
- `FactoryFloor.svelte` (Desktop-Macro-Lane-DOM, um `:271-400`): Reihenfolge in
  Lebenszyklus-Reihenfolge bringen — **`QS-Abnahme` (qa_review) VOR `ShippedColumn` (done)** —
  und die Reihenfolge aus `PIPELINE_LANES` ableiten statt handzukodieren; `STATIONS` aus
  `PHASE_ORDER` ableiten.
- `factory/MobileTabBar.svelte`: `TABS` aus der SSOT ableiten; `MOBILE_COL_INDEX` aus der SSOT.
- `factory/ConveyorBelt.svelte`: sicherstellen, dass es weiter über die abgeleiteten `STATIONS`
  iteriert (links→rechts).
- **Akzeptanz:** die in Sub-Plan 1 geschriebenen Component-Order-Assertions werden grün;
  visuelle Reihenfolge der Lanes/Tabs = SSOT (qa vor done).

## 5. Datenfluss

```
/api/factory-floor (existiert auf main)  ──FloorPayload{lanes...}──▶
PipelineSidekickView ──iteriert PIPELINE_LANES──▶ Lane-Streifen
                     └─Klick─▶ Lifecycle-Stepper (PIPELINE_LANES) / PhaseStepper (hall)
/api/factory-floor/stream (SSE, falls auf main) ──phase-event──▶ Re-Fetch
```
Kein neues Pflicht-Endpoint. Admin-Auth wie bei bestehenden `/api/admin/*` (Session + `isAdmin`).

## 6. Error Handling

- `PipelineSidekickView`: Fetch-Fehler → freundlicher Fehlerzustand im View (kein Crash des
  Drawers); SSE-Disconnect → stiller Reconnect / Fallback auf manuellen Refresh (Muster wie
  `FactoryFloor.svelte` EventSource-Handling).
- `transition.ts`: erweitertes `VALID_STATUSES` wirft weiterhin sauber bei wirklich ungültigen
  States; Resolution-Constraint bleibt fail-closed.
- SSOT-Ableitung ist rein/synchron, keine Laufzeitfehler; Fehlkonfiguration fällt im Build/Test.

## 7. Testing

- **Sub-Plan 1:** `factory-floor.order.test.ts` — die Front-to-back-Garantie (alle Consumer ==
  SSOT). Vitest für die Ableitungslogik.
- **Sub-Plan 2:** Vitest für `transition` (akzeptiert qa_review) + `cockpit-labels`
  (Label-Vollständigkeit) + `TicketSidekickView` Render/Options.
- **Sub-Plan 3:** Vitest-Render des Views (Lanes in Reihenfolge, Drill-down-Stepper).
- **Sub-Plan 4:** die Order-Assertions aus Sub-Plan 1 grün; ggf. Snapshot der Lane-Reihenfolge.
- **Finales Gate (Orchestrator, einmalig je Sub-Plan in dev-flow-execute):** `task test:changed`
  + `task freshness:regenerate` + `task freshness:check`; nach Test-Änderungen `task test:inventory`
  + Commit.

## 8. Scope-Grenzen (YAGNI)

- **Kein** `awaiting_deploy` (gehört zu PR #1786; nur als 1-Zeilen-Vorwärts-Slot vorbereitet).
- **Kein** neues `/api/admin/pipeline`-Endpoint (`/api/factory-floor` reicht).
- **Keine** Cross-Brand-Aggregation (bleibt brand-scoped).
- **Keine** Änderung an der Factory-Automation (`pipeline.js`).
- **Keine** Umgestaltung des Planungsbüro-Backlog-Tables (`PlanningOfficeQueue.svelte`).
- **Keine** Berührung der Customer-Journey-Minimap (`WorkflowStatusMinimap`) — anderes Thema.
- **Kein** OpenSpec-Change-Ordner (`scripts/openspec.sh` ist nicht auf main; Legacy-Plan-Format
  `docs/superpowers/plans/<date>-<slug>.md` ist hier das operative Ziel).

## 9. CI-/Quality-Gate-Hinweise für die Plan-Autoren

- `factory-floor.ts` und `FactoryFloor.svelte` sind groß → vor dem Plan pro Datei `wc -l` UND
  Baseline (`jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json`)
  prüfen. Bei Budget ≈ 0 zeilenneutral planen (Ableitung ersetzt handkopierte Arrays → tendenziell
  neutral bis verkleinernd) bzw. echten Verkleinerungs-Schritt einplanen, kein kosmetisches
  Zusammenziehen.
- Keine Brand-Domain-Literale in Code-Snippets (S3); Helfer als pure Module ohne Import-Zyklen
  (S2 — ein evtl. `pipeline-order.ts` darf nichts DB-seitiges importieren); neue Dateien/Tests
  referenzieren, nicht verwaisen lassen (S4).
- Alle Code-Lesungen für die Pläne gegen **`origin/main`** (`git show origin/main:<pfad>`),
  nicht gegen den lokalen Haupt-Checkout (der steht auf `feature/openspec-native-workflow` und
  zeigt das 11-State-Modell).
