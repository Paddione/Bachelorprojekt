# Design: Sidekick-Pipeline-Ansicht + Pipeline-Richtungs-Konsolidierung

> Stateful Ticketing sichtbar machen: ein neuer Pipeline-View im Sidekick-Drawer, der die
> Ticket-Lebenszyklus-States vorne→hinten zeigt — und die *eine* geordnete Quelle, aus der
> alle Pipeline-Ansichten ableiten, damit „verkehrt herum" strukturell unmöglich wird.

## 1. Problem & Intent

Wir haben jetzt stateful Ticketing (11 States). Der Sidekick — die zentrale Drawer-UI
(`PortalSidekick.svelte`, in allen Layouts gemountet) — macht daraus aber **keinen Nutzen**:
es gibt keine Pipeline-/Lane-Übersicht, und das einzige State-betreffende Element
(`TicketSidekickView`) hat ein **stale 7-State-Enum**, das `planning/plan_staged/qa_review/
awaiting_deploy` gar nicht kennt.

Zugleich läuft die existierende Pipeline-Visualisierung (Factory-Floor unter `/dev-status`)
in der Desktop-Ansicht **verkehrt herum**: die Macro-Lane-DOM-Reihenfolge rendert
`in-progress | staged | backlog | done | awaiting-deploy | qa` — also **`done` VOR
`awaiting_deploy` und `qa_review`**, invers zum echten Lebenszyklus.

**Wurzelursache:** Die kanonische Reihenfolge existiert **nicht an einer Stelle**. Sie wird
per Copy-Paste redeklariert (`FactoryFloor.svelte` STATIONS + Macro-Lane-DOM, `MobileTabBar.svelte`
TABS, `MOBILE_COL_INDEX`) — Drift ist die natürliche Folge.

**Ziel:**
1. Eine geordnete Lane-SSOT in `lib/factory-floor.ts`, aus der **alle** Ansichten ableiten.
2. Ein neuer, admin-gateter **Pipeline-View im Sidekick-Drawer**: Lane-Streifen vorne→hinten
   mit Counts, Drill-down auf einen Lebenszyklus-Stepper pro Ticket.
3. Die stale State-Enums (Sidekick, Transition-Gate, Labels) auf das 11-State-Modell ziehen.
4. Die Factory-Floor-Desktop-Reihenfolge gerade ziehen und aus der SSOT ableiten.

## 2. Kanonische Pipeline-Reihenfolge (SSOT)

Quelle der gültigen States (Set): DB-CHECK in `website/src/lib/tickets-db.ts:170`.
Quelle der **Reihenfolge** (front→back) ab jetzt: `PIPELINE_LANES` in `lib/factory-floor.ts`.

```
Planung        (triage, planning)
Kommissioniert (plan_staged)
Laderampe      (backlog)
In Arbeit      (in_progress, in_review)     ← Phasen scout→deploy orthogonal (PHASE_ORDER)
QS-Abnahme     (qa_review)
Deploy-Wartung (awaiting_deploy)
Fertig         (done)
── Seiten-Lanes (side:true, nicht Teil der linearen Pipeline) ──
Blockiert      (blocked)
Archiv         (archived)
```

`awaiting_deploy` = „nach main gemergt, aber noch nicht auf fleet" (push-based, kein GitOps-
Reconciler); `done` = „in Prod verifiziert". `PHASE_ORDER = [scout,design,plan,implement,
verify,deploy]` bleibt die *orthogonale* In-Arbeit-Achse, kein State.

## 3. SSOT-Interface-Contract (verbindlich für alle Sub-Pläne)

Sub-Plan 1 exportiert aus `website/src/lib/factory-floor.ts` (oder einem importsauberen
Helfer `website/src/lib/tickets/pipeline-order.ts`, falls S2-Modulgrenzen es verlangen):

```ts
export interface PipelineLane {
  key: 'planning' | 'staged' | 'loadingDock' | 'hall' | 'qa' | 'awaitingDeploy'
     | 'shipped' | 'attention' | 'archive';
  label: string;          // deutsches Anzeige-Label
  statuses: TicketStatus[]; // zugehörige Status, in Reihenfolge
  side: boolean;          // true = nicht Teil der linearen Pipeline (blocked/archived)
}

// Die EINZIGE geordnete Deklaration (front→back). Alles andere wird hieraus abgeleitet.
export const PIPELINE_LANES: readonly PipelineLane[];

// Abgeleitet: lineare Status-Rungs (nur side:false), in Reihenfolge.
export const PIPELINE_STATUSES: readonly TicketStatus[];

// Abgeleitet/zentralisiert: Status → Lane-Key (ersetzt die handgepflegte Map).
export const STATUS_BUCKETS: Record<TicketStatus, PipelineLane['key']>;
```

- `ALL_TICKET_STATUSES` bleibt erhalten (Backward-Compat), wird aber aus `PIPELINE_LANES`
  abgeleitet bzw. dagegen getestet.
- `PHASE_ORDER` bleibt unverändert.
- Consumer (Sub-Pläne 3 & 4) **importieren** diese Konstanten und deklarieren **nichts** neu.

## 4. Sub-Plan-Zerlegung & Datei-Eigentümerschaft

Vier Sub-Pläne, kollisionsfrei parallelisierbar in zwei Wellen. Jede Datei gehört **genau einem**
Sub-Plan (keine geteilten Edits über Sub-Plan-Grenzen).

| # | Sub-Plan | Exklusive Dateien | Hängt ab von |
|---|----------|-------------------|--------------|
| **1** | Geordnete Lane-SSOT | `website/src/lib/factory-floor.ts` (+ ggf. neu `website/src/lib/tickets/pipeline-order.ts`); neuer Test `website/src/lib/factory-floor.order.test.ts` | — (Fundament) |
| **2** | Stale-Enum-Konsistenz | `website/src/lib/tickets/transition.ts`, `website/src/lib/tickets/cockpit-labels.ts`, `website/src/components/assistant/TicketSidekickView.svelte` (+ Tests) | — |
| **3** | Sidekick-Pipeline-View | **neu** `website/src/components/assistant/PipelineSidekickView.svelte`, `website/src/components/PortalSidekick.svelte`, `website/src/components/assistant/SidekickHome.svelte`, `website/src/styles/sidekick-panels.css`, `website/src/lib/assistant/sidekick-nudge.ts` (+ Tests) | 1 |
| **4** | FactoryFloor-Richtung | `website/src/components/FactoryFloor.svelte`, `website/src/components/factory/MobileTabBar.svelte`, `website/src/components/factory/ConveyorBelt.svelte` | 1 |

**Wellen:** Welle 1 = `{1, 2}` parallel. Welle 2 = `{3, 4}` parallel (beide konsumieren 1).
`TicketSidekickView.svelte` gehört **nur** Sub-Plan 2; Sub-Plan 3 fasst es nicht an.
`factory-floor.ts` gehört **nur** Sub-Plan 1; Sub-Plan 4 importiert nur daraus.

### Sub-Plan 1 — Geordnete Lane-SSOT
- `PIPELINE_LANES` als einzige geordnete Deklaration; `PIPELINE_STATUSES` + `STATUS_BUCKETS`
  daraus ableiten; `ALL_TICKET_STATUSES` gegen die SSOT testen.
- **Front-to-back-Regressionstest** (`factory-floor.order.test.ts`): deklariert die Soll-Sequenz
  und prüft, dass `PIPELINE_STATUSES`, die abgeleitete `STATUS_BUCKETS`-Lane-Zuordnung sowie
  (importiert) `MobileTabBar.TABS` / `MOBILE_COL_INDEX` / FactoryFloor-Macro-Lane-Reihenfolge
  exakt der SSOT entsprechen. (Die Component-Order-Assertions greifen erst, wenn Sub-Plan 4
  die Ableitung verdrahtet — der Test wird in Sub-Plan 1 geschrieben und in Sub-Plan 4 grün.)
- **Akzeptanz:** `pnpm vitest run factory-floor.order` grün; keine Verhaltensänderung an
  bestehenden Consumern (STATUS_BUCKETS-Werte identisch zur alten Map).

### Sub-Plan 2 — Stale-Enum-Konsistenz
- `transition.ts:7-14`: `TicketStatus` + `VALID_STATUSES` um `qa_review` + `awaiting_deploy`
  erweitern. Beide **nicht-terminal** → keine Resolution erforderlich; `done/archived`-Regeln
  unverändert.
- `cockpit-labels.ts:5-16`: deutsches Label für `awaiting_deploy` ergänzen
  (z. B. `'Deploy-Wartung'`); `STATUS_LABELS` vollständig auf 11 States.
- `TicketSidekickView.svelte:5`: lokales 7-State-Enum entfernen, Labels/Status **aus
  `cockpit-labels.ts` importieren** (Single Source) → Dropdown kennt alle States.
- **Automation unangetastet:** `scripts/factory/pipeline.js` / `deploy-transition.mjs` nicht ändern.
- **Akzeptanz:** Unit-Test, dass der manuelle `/transition`-Pfad `qa_review`+`awaiting_deploy`
  akzeptiert; `TicketSidekickView` rendert für ein Ticket in jedem der 11 States eine passende
  Option (kein leeres Dropdown).

### Sub-Plan 3 — Sidekick-Pipeline-View (Headline)
- Neu `PipelineSidekickView.svelte`: fetcht `GET /api/factory-floor`, mappt `FloorPayload`-Lanes
  via `PIPELINE_LANES` auf den vertikalen **Lane-Streifen** (vorne→hinten, Count + Mini-Balken).
- **Drill-down:** Klick auf Lane/Ticket → Lebenszyklus-Stepper (✓ erledigt / ● aktuell / ○ offen)
  entlang `PIPELINE_LANES`; für In-Arbeit-Tickets `factory/PhaseStepper.svelte` wiederverwenden.
- **Live:** Subscribe auf vorhandenen `GET /api/factory-floor/stream` (SSE); Fallback: Fetch
  beim Öffnen des Views.
- **Wiring (5-Schritt-Seam):** `View`-Union + `titleMap` (`PortalSidekick.svelte:15,64`),
  Drawer-Branch (~`:263`), Menüeintrag (`SidekickHome.svelte:35-44`, `show: isAdmin`),
  CSS in `styles/sidekick-panels.css` **scoped unter `.drawer`** (kein scoped `<style>`),
  Deep-Link in `sidekick-nudge.ts:6-11` (`KNOWN_VIEWS`).
- **Admin-gated:** sichtbar nur bei `helpContext==='admin'` (wie tickets/inbox).
- **Akzeptanz:** Render-Test mit gemocktem `FloorPayload` zeigt Lanes in SSOT-Reihenfolge;
  Drill-down-Stepper markiert die korrekte aktuelle Lane.

### Sub-Plan 4 — FactoryFloor-Richtungs-Fix
- `FactoryFloor.svelte:271-400`: Desktop-Macro-Lane-DOM in Lebenszyklus-Reihenfolge bringen
  (`qa_review → awaiting_deploy → done` korrekt) und die Reihenfolge aus `PIPELINE_LANES`
  ableiten statt handzukodieren; `STATIONS` aus `PHASE_ORDER` ableiten.
- `factory/MobileTabBar.svelte:2-13`: `TABS` aus der SSOT ableiten (behebt fehlendes
  `awaitingDeploy`); `MOBILE_COL_INDEX` aus der SSOT.
- `factory/ConveyorBelt.svelte`: sicherstellen, dass es weiter über die abgeleiteten `STATIONS`
  iteriert (bereits korrekt links→rechts).
- **Akzeptanz:** die in Sub-Plan 1 geschriebenen Component-Order-Assertions werden grün;
  visuelle Reihenfolge der Lanes/Tabs = SSOT.

## 5. Datenfluss

```
/api/factory-floor (existiert)  ──FloorPayload{loadingDock,hall,staged,awaitingDeploy,
                                              shipped,planningCount,attention,...}──▶
PipelineSidekickView ──iteriert PIPELINE_LANES──▶ Lane-Streifen
                     └─Klick─▶ Lifecycle-Stepper (PIPELINE_LANES) / PhaseStepper (hall)
/api/factory-floor/stream (SSE, existiert) ──phase-event──▶ Re-Fetch
```
Kein neues Pflicht-Endpoint. Admin-Auth wie bei bestehenden `/api/admin/*` (Session +
`isAdmin`); `/api/factory-floor` ist bereits admin-gated.

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
- **Sub-Plan 2:** Vitest für `transition` (akzeptiert qa_review/awaiting_deploy) +
  `cockpit-labels` (Label für alle 11 States) + `TicketSidekickView` Render/Options.
- **Sub-Plan 3:** Vitest-Render des Views (Lanes in Reihenfolge, Drill-down-Stepper).
- **Sub-Plan 4:** die Order-Assertions aus Sub-Plan 1 grün; ggf. Snapshot der Lane-Reihenfolge.
- **Finales Gate (Orchestrator, einmalig):** `task test:changed` + `task freshness:regenerate`
  + `task freshness:check`; nach Test-Änderungen `task test:inventory` + Commit;
  `task test:openspec` / `bash scripts/openspec.sh validate` grün.

## 8. Scope-Grenzen (YAGNI)

- **Kein** neues `/api/admin/pipeline`-Endpoint (`/api/factory-floor` reicht).
- **Keine** Cross-Brand-Aggregation (bleibt brand-scoped).
- **Keine** Änderung an der Factory-Automation (`pipeline.js`/`deploy-transition.mjs`).
- **Keine** Umgestaltung des Planungsbüro-Backlog-Tables (`PlanningOfficeQueue.svelte`).
- **Keine** Berührung der Customer-Journey-Minimap (`WorkflowStatusMinimap`) — anderes Thema.

## 9. CI-/Quality-Gate-Hinweise für die Plan-Autoren

- `factory-floor.ts` und `FactoryFloor.svelte` sind groß → vor dem Plan pro Datei `wc -l` UND
  Baseline (`jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json`)
  prüfen. Bei Budget ≈ 0 zeilenneutral planen (Ableitung ersetzt handkopierte Arrays → tendenziell
  neutral bis verkleinernd) bzw. echten Verkleinerungs-Schritt einplanen, kein kosmetisches
  Zusammenziehen.
- Keine Brand-Domain-Literale in Code-Snippets (S3); Helfer als pure Module ohne Import-Zyklen
  (S2 — `pipeline-order.ts` darf nichts DB-seitiges importieren); neue Dateien/Tests referenzieren,
  nicht verwaisen lassen (S4).
