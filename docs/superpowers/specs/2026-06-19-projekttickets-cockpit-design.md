---
title: "Projekttickets-Vollansicht im Cockpit + Sidekick-Eintrag"
date: 2026-06-19
slug: projekttickets-cockpit
ticket_id: null
plan_ref: null
domains: []
status: draft
---

# Projekttickets-Vollansicht (Container-Detailansicht) + abgestimmter Sidekick-Eintrag

## Kontext

Die Plattform führt **zwei Ticket-Welten in derselben Tabelle** `tickets.tickets`, nur
durch `type` unterschieden:

- **Engineering-Welt** (Software-Factory): `type ∈ {project, feature, task, bug}`,
  Hierarchie via `parent_id`. Bedient durch `/admin/cockpit` (Feature-Board:
  Sidebar = Feature-Liste mit Rollup, Tabelle = Leaf-Tickets eines Features) und
  `/dev-status` (Factory-Floor, Planungsbüro, Analytics).
- **Mandate-Welt** (Kunden-Coaching): `type = 'project'` **mit** `customer_id`.
  Bedient durch `/admin/projekte` (+ `/admin/projekte/[id]`). **Außerhalb des Scopes.**

„Unsere Projekttickets" sind die **Engineering-Container** (`project`/`feature`) und ihre
`task`/`bug`-Leaves.

### Problem (bestätigte Kern-Lücke)

Ein `project`/`feature`-**Container** erscheint heute nur als **Sidebar-Zeile mit
Rollup-Zahl** im Cockpit. Es gibt **keine aggregierte Vollansicht eines einzelnen
Containers**. Die relevanten Daten sind über drei Ansichten + drei APIs verstreut:

| Datenpunkt | Liegt heute in | Im Container-Kontext sichtbar? |
|---|---|---|
| Rollup-Breakdown (done/blocked/in_progress/awaiting_deploy/open, Health) | `v_cockpit_rollup` (Cockpit-Sidebar) | nur als nackte Zahl |
| Kind-Tickets mit Status/Prio | `/admin/tickets/[id]` (flache Liste) | ja, aber ohne Aggregat |
| **Plan** (`ticket_plans.content` + branch + PR) | nirgends gerendert | **nein — wird in der gesamten Website nirgends angezeigt** |
| DoR / Lastenheft (readiness, dorScore, requirementsList, valueProp, effort, areas, dependsOn) | Planungsbüro (`/dev-status`) | nein |

Die bestehende generische Ticket-Vollansicht `/admin/tickets/[id]` ist leaf-/coaching-zentriert:
Sie zeigt Beschreibung, Grilling, flache Kind-Liste, Verknüpfungen, Verlauf, Anhänge — aber
**kein** Rollup, **keinen** Plan, **kein** DoR. Zusätzlich sind ihre Status-Maps veraltet
(es fehlen `planning`, `plan_staged`, `qa_review`, `awaiting_deploy`).

## Ziel

Eine **Container-Vollansicht**: Öffnet man ein `project`/`feature`-Ticket über die
bestehende Liste (Cockpit-Sidebar/-Tabelle oder den Drawer-Link „Vollansicht öffnen"),
zeigt **eine** Seite alle relevanten Informationen dieses Containers an einem Ort —
Rollup, Plan, DoR, angereicherte Kind-Liste, Lifecycle. Plus ein **Sidekick-Menü-Eintrag**,
der als Einstieg dient.

### Nicht-Ziele (YAGNI / eigene Tickets)

- **Keine** neue Listen-/Übersichtsansicht — die existiert bereits als Cockpit-Tabelle/Sidebar.
- **Keine** Live-Factory-Floor-Phase via SSE/Polling (FloorPayload). Der Lifecycle-Streifen
  nutzt nur bereits geladene Daten (Status + verknüpfte PR + Plan-Branch).
- **Kein** AdminTabs-Umbau — gestapelte Karten, konsistent mit der bestehenden Seite.
- **Keine** Admin-Nav-Restrukturierung (Gap-Analyse WP-29/40) — die bestehenden
  `CockpitTable`/`TicketDrawer` werden nicht angefasst; neue Komponenten werden gleich
  a11y-korrekt gebaut (`role=list`, Fokus).
- **Keine** Mandate-Welt (`/admin/projekte`).

## Lösungsansatz

**Die bestehende Route `/admin/tickets/[id]` zur Container-Vollansicht ausbauen** — statt
eine zweite Detail-Route anzulegen.

*Begründung:* Der `TicketDrawer` (`drawer-fullview`-Link) **und** jede Cockpit-Zeile zeigen
bereits hierher. Der Drilldown von der existierenden Liste funktioniert damit ohne neue
Verdrahtung. DRY (eine Detailseite für alle Typen). Behebt nebenbei die veralteten
Status-Maps.

Die neuen Container-Sektionen erscheinen **conditional** — nur wenn `ticket.type ∈
{project, feature}`. Für `task`/`bug`-Leaves bleibt die Seite unverändert.

### Komponenten (Isolation — S1-Zeilen-Budget)

Jede neue Sektion ist eine **eigene, fokussierte Komponente**; `[id].astro` (heute 395 Z.)
bindet sie nur conditional ein und bleibt schlank.

| Komponente | Zweck | Sichtbar bei |
|---|---|---|
| `ContainerRollupHeader.svelte` | Fortschrittsbalken + Breakdown (done/blocked/in_progress/awaiting_deploy/open) + Health-Punkt | project/feature |
| `TicketPlanPanel.svelte` | Plan-Metadaten (branch, PR, status, slug) immer sichtbar; `content` als Markdown **collapsible** | jeder Typ mit Plan |
| `ContainerDorPanel.svelte` | DoR-Checkliste (readiness), dorScore, valueProp, effort, areas, dependsOn, requirementsList/Lastenheft | project/feature mit gesetzten Feldern |
| `ContainerChildrenList.astro` | Kind-Tickets mit Status-/Prio-Chips, nach Status gruppiert (ersetzt die flache `<ul>`) | project/feature |

Lifecycle-Streifen (Status + verknüpfte PR(s) + Plan-Branch) wird inline im Header aus
bereits geladenen Daten gerendert (keine eigene Komponente nötig).

### Datenquellen

| Bedarf | Quelle | Status |
|---|---|---|
| Rollup je Container | neue Funktion `getContainerRollup(brand, containerExtId)` auf der **vorhandenen** View `tickets.v_cockpit_rollup` | **neu** (trivial; View existiert) |
| Plan | neue Funktion `getTicketPlan(brand, ticketId)` — lädt `content` **nur für dieses eine Ticket** (`WHERE ticket_id = $1`, neuester nicht-archivierter) | **neu** — ⚠️ CLAUDE.md-Footgun: `content` nie breit selektieren |
| DoR-Felder | `getTicketDetail` um `value_prop, effort, areas, depends_on, readiness, requirements_list, dorScore` erweitern (Spalten existieren in `tickets.tickets`) **oder** Helper aus `planning-office.ts` wiederverwenden | **erweitern** |
| Kind-Tickets mit Status/Prio | `getTicketDetail.children` | **vorhanden** |
| Sidekick-Badge-Count | neuer Endpoint `/api/admin/cockpit/container-count` (offene `project`/`feature`-Container), nach `inbox/count`-Muster | **neu** |

### Status-Map-Fix

`[id].astro` nutzt künftig die **`cockpit-labels.ts`-SSOT** (`STATUS_LABELS`,
`PRIORITY_LABELS`, …) statt der lokalen veralteten Maps → `planning`/`plan_staged`/
`qa_review`/`awaiting_deploy` werden korrekt dargestellt.

### Sidekick-Menü

Neuer **Admin-only** Eintrag „Projekttickets" in `SidekickHome` → Deep-Link auf
`/admin/cockpit` (= existierende Liste, Einstieg in die Vollansichten), mit **Count-Badge**
(offene Container) nach dem `pendingTickets`/`inbox`-Badge-Muster. **Kein** eigenes
Drawer-Panel (reiner `href`-Eintrag, kein neuer View-Slug nötig).

Betroffene Stellen: `SidekickHome.svelte` (neuer Eintrag + `no`-Renumbering),
`PortalSidekick.svelte` (optionaler Badge-Count-Fetch im Admin-`$effect`, Muster
`pendingTickets`). Da reiner Link: **kein** Eintrag in `PortalSidekick`-View-Union /
`sidekick-nudge.ts` nötig.

## Datenfluss

```
/admin/tickets/[id].astro (SSR, Auth-Gate getSession+isAdmin)
  ├─ getTicketDetail(brand, id)         ← + DoR-Felder, children
  ├─ getTicketTimeline(brand, id)
  ├─ if type ∈ {project,feature}:
  │     getContainerRollup(brand, extId) ← v_cockpit_rollup
  └─ getTicketPlan(brand, id)            ← ticket_plans (content gefiltert)
        ↓ Props
  AdminLayout → conditional Container-Sektionen (Svelte/Astro-Komponenten)

PortalSidekick.svelte ($effect, helpContext==='admin')
  └─ fetch /api/admin/cockpit/container-count → Badge
SidekickHome.svelte → Eintrag „Projekttickets" (href=/admin/cockpit, badge)
```

## Fehlerbehandlung

- Jede Container-Datenquelle wird **fail-soft** geladen (try/catch → `null`/leeres Aggregat),
  konsistent mit dem bestehenden questionnaire-Fetch in `[id].astro`. Eine fehlende
  Plan-/Rollup-/DoR-Quelle blendet ihre Sektion aus, statt die Seite zu brechen.
- Brand-scoped (Spalte `brand`); kein cross-brand-Zugriff.
- Alle neuen API-Routen: `getSession`+`isAdmin` → 403, sonst `json()`-Konvention.

## Tests

- **Vitest:** `getTicketPlan` (gefilterte Selektion, neuester nicht-archivierter Plan,
  kein Plan → null), `getContainerRollup` (Aggregat-Mapping), Sidekick-Eintrag
  (`PortalSidekick.test.ts`: Admin-Kontext zeigt „Projekttickets" mit Badge; Portal-Kontext
  nicht).
- **Playwright (optional, Smoke):** Container-Vollansicht eines `feature`-Tickets rendert
  Rollup-Header + Plan-Panel + DoR; ein `task`-Leaf zeigt sie nicht.

## Qualitäts-Gates (Plan beachtet)

- **S1:** Container-Sektionen als eigene Komponenten auslagern; `[id].astro`-Netto-Zuwachs
  gegen `baseline.json` prüfen (bei Budget≈0 zeilenneutral / echt verkleinern).
- **S2:** Datenfunktionen in `cockpit-db.ts`/`admin.ts` (pg-Importe) bleiben aus Svelte
  heraus; Labels via reine `cockpit-labels.ts`.
- **S3:** keine Brand-Domain-Literale in Code-Snippets.
- Brand-übergreifend (mentolder + korczewski): rein Website-Code, kein Manifest/Overlay.

## Offene Annahmen

- `getContainerRollup` schlüsselt über `container_id` der View (external_id vs. uuid wird im
  Plan am echten Schema verifiziert).
- DoR-Felder werden in `getTicketDetail` ergänzt (gegenüber separater Funktion bevorzugt,
  da `[id].astro` ohnehin `getTicketDetail` lädt) — finale Entscheidung im Plan.
