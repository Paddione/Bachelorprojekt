---
title: Plan: T000627 — Ticket-Dependency-Resolver (TDR)
ticket_id: T000627
domains: [website, db, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: T000627 — Ticket-Dependency-Resolver (TDR)

**Ticket:** T000627  
**Branch:** feature/tdr-ticket-dependency-resolver  
**Datum:** 2026-06-11  
**Status:** staged

---

## Ziel

Das `depends_on`-Feld in `tickets.tickets` als gerichteten azyklischen Graph auswerten: DB-API, Blocker-Erkennung im Factory-Dispatcher, DAG-Visualisierung im Planungsbüro und automatische Readiness-Updates via API-Webhook.

---

## Design-Injektion (Industrial/Loft)

TDR-3 (DAG-Visualisierung) baut auf dem Factory Design System aus `website/src/styles/factory-tokens.css` (T000597):

| Token | Verwendung in TDR-3 (DAG) |
|-------|--------------------------|
| `--ff-bg` | Canvas-Hintergrund der DAG-Visualisierung |
| `--ff-surface` | Ticket-Node Hintergrund |
| `--ff-amber` | Kritischer Pfad, aktive/in-progress Tickets |
| `--ff-green` | Done-Nodes (Vorgänger vollständig) |
| `--ff-red` | Blocked-Nodes (Vorgänger nicht done) |
| `--ff-muted` | Zukünftige Nodes (not yet reached) |
| `--ff-border` | Kanten (Abhängigkeitspfeile) |
| Monospace (JetBrains Mono) | Ticket-IDs, Status-Labels in Nodes |

**Node-Design:**
- Node-Breite: variabel (mind. 120 px), 4 px linker Border = Priority-LED-Strip (analog `WorkpieceCard.svelte`)
- Done-Nodes: `fill: var(--ff-green)`, `border-left: 4px solid var(--ff-green)`
- Blocked-Nodes: `fill: var(--ff-red)` + `PilotLight`-Puls-Animation
- Kritischer Pfad: Kanten in `var(--ff-amber)`, Strichstärke 2 px (statt 1 px für nicht-kritische)
- Hover-Tooltip: Ticket-Titel, Status, `depends_on`-IDs — Monospace, 11 px

---

## Architektur

### Neue Dateien

```
website/src/pages/api/tickets/graph.ts              # GET: JSON-Graph aller Ticket-Abhängigkeiten
website/src/pages/api/tickets/[id]/readiness.ts     # POST: Readiness-Webhook nach status=done
website/src/components/DependencyGraph.svelte       # D3.js DAG-Visualisierung für Planungsbüro
website/src/lib/ticket-graph.ts                     # Graph-Algo: topologische Sortierung, kritischer Pfad
tests/unit/ticket-graph.bats                        # Unit-Tests für Graph-API
```

### Geänderte Dateien

```
website/src/pages/api/tickets/[id].ts               # PATCH status=done → POST /api/tickets/:id/readiness
website/src/pages/admin/planungsbuero.astro         # DependencyGraph-Komponente einbinden (neuer Tab)
website/src/lib/tickets-db.ts                       # getTicketGraph(), updateReadiness() hinzufügen
scripts/factory/pipeline.js                         # Scout-Phase: depends_on prüfen vor claim
```

### Nicht geändert

- `k3d/` Manifeste
- `environments/schema.yaml`
- Keycloak/Auth

---

## Sub-Ticket-Breakdown

### TDR-1: Dependency-Graph-API — DB-View + JSON-Endpunkt (T000633)

**Depends on:** —

**Ziel:** `GET /api/tickets/graph` gibt den vollständigen gerichteten Abhängigkeitsgraphen als JSON zurück. Datenquelle: `tickets.tickets.depends_on` (UUID-Array).

**DB-View (recursive CTE):**
```sql
WITH RECURSIVE dep_graph AS (
  SELECT id, external_id, title, status, priority, depends_on, 0 AS depth
  FROM tickets.tickets
  WHERE status != 'done'
  UNION ALL
  SELECT t.id, t.external_id, t.title, t.status, t.priority, t.depends_on, dg.depth + 1
  FROM tickets.tickets t
  JOIN dep_graph dg ON t.id = ANY(dg.depends_on)
  WHERE dg.depth < 10
)
SELECT DISTINCT * FROM dep_graph;
```

**API-Output:**
```json
{
  "nodes": [{ "id": "T000633", "title": "...", "status": "planning", "priority": "hoch", "depth": 0 }],
  "edges": [{ "from": "T000634", "to": "T000633", "type": "depends_on" }],
  "criticalPath": ["T000633", "T000634", "T000636"]
}
```

**Tasks:**
- [x] `website/src/lib/ticket-graph.ts`: `getTicketGraph()` mit recursive CTE, kritischer-Pfad-Algo (longest path by ticket count)
- [x] `GET /api/tickets/graph` in `website/src/pages/api/tickets/graph.ts` — Auth: Admin
- [x] `tests/unit/ticket-graph.bats`: prüft Nodes-Count, Edges-Count, criticalPath nicht leer
- [x] Freshness: kein Caching (live DB-Query, max 200 ms erwartet)

---

### TDR-2: Blocker-Detektor — Factory/Dispatcher überspringt blockierte Tickets (T000634)

**Depends on:** TDR-1 (T000633)

**Ziel:** Vor jedem `claim`-Aufruf in `scripts/factory/pipeline.js` prüft der Dispatcher ob alle `depends_on`-Vorgänger `status=done` haben. Blockierte Tickets werden mit Reason `blocked:T000xxx` übersprungen.

**Logik:**
```js
// In pipeline.js, Scout-Phase vor claim():
const graphRes = await fetch(`${BASE_URL}/api/tickets/graph`, { headers: { Cookie: adminCookie } });
const { edges } = await graphRes.json();
const blockers = edges
  .filter(e => e.from === ticket.external_id)
  .map(e => e.to)
  .filter(depId => tickets.find(t => t.external_id === depId)?.status !== 'done');
if (blockers.length > 0) {
  log(`Ticket ${ticket.external_id} blocked by: ${blockers.join(', ')} — skipping`);
  continue;
}
```

**Tasks:**
- [x] `scripts/factory/schedule.sh`: Blocker-Check vor `claim()` einbauen
- [x] Log-Ausgabe: `"[BLOCKED] T000634 wartet auf T000633"` — Factory-UI zeigt das als Status
- [x] BATS-Test `tests/unit/factory-blocked.bats`: mockt Graph-API, prüft dass blockiertes Ticket übersprungen wird
- [ ] Dispatcher-Dashboard: Blocked-Tickets in Factory-Floor als Stuck-State (roter PilotLight-Puls)

---

### TDR-3: Planungsbüro DAG-Visualisierung (T000635)

**Depends on:** TDR-1 (T000633)

**Ziel:** Neuer Tab „Abhängigkeiten" im `/admin/planungsbuero` mit D3.js DAG-Visualisierung. Tickets als Nodes, `depends_on` als gerichtete Kanten, kritischer Pfad hervorgehoben.

**Komponente `DependencyGraph.svelte`:**

```svelte
<!-- Props -->
let { graphData }: { graphData: TicketGraph } = $props();

<!-- Layout: D3 force-directed oder dagre-Layout -->
<!-- Nodes: SVG-rect + foreignObject für Text -->
<!-- Kanten: SVG-path mit Pfeil-Marker -->
<!-- Critical Path: Amber Kanten, 2px -->
<!-- Blocked Nodes: Rotes Fill + PilotLight-Animation -->
```

**Design-Spezifikation:**
- Canvas: `background: var(--ff-bg)`, SVG volle Breite/Höhe
- Nodes: `rx=4` (rounded corners), 4 px LED-Strip links (Priority-Farbe)
- Done: `fill: color-mix(in srgb, var(--ff-green) 20%, var(--ff-bg))`
- Blocked: `fill: color-mix(in srgb, var(--ff-red) 20%, var(--ff-bg))` + Puls via CSS `@keyframes`
- Active: `fill: color-mix(in srgb, var(--ff-amber) 20%, var(--ff-bg))`
- Ticket-ID in Monospace Bold, Titel in 11 px truncated
- Zoom + Pan via D3 `zoom()`

**Planungsbüro-Integration:**
- Neuer Tab neben „Backlog" und „In Planung": `<Tab label="Abhängigkeiten" />`
- Daten: SSE-gepollter `GET /api/tickets/graph` (5 s Intervall)
- Legende: 4 Chips (Done / Aktiv / Blockiert / Geplant) in Factory-Token-Farben

**Tasks:**
- [x] D3.js als Dependency prüfen (evtl. schon vorhanden) oder lightweight SVG-Renderer selbst schreiben
- [x] `DependencyGraph.svelte` implementieren (dagre-Layout bevorzugt für klare Kanten)
- [x] Planungsbüro-Tab ergänzen
- [ ] Mobile: Pinch-Zoom + Pan, Nodes ggf. kleiner (80 px)
- [ ] E2E-Test: `tests/e2e/fa-tdr-dag.spec.ts` — prüft dass DAG-Canvas rendert, min. 1 Node sichtbar

---

### TDR-4: Auto-Readiness-Update via API-Webhook (T000636)

**Depends on:** TDR-1 (T000633), TDR-2 (T000634)

**Ziel:** Wenn ein Ticket auf `status=done` gesetzt wird, ruft `PATCH /api/tickets/:id` anschließend `POST /api/tickets/:id/readiness` auf. Dieser Endpunkt setzt bei allen direkten Nachfolgern `abhaengigkeiten_klar=true` sobald alle ihre Vorgänger `done` sind.

**Warum API-Webhook statt DB-Trigger:** Factory-Agents können `PATCH /api/tickets/:id` direkt aufrufen und das Readiness-Update beobachten. DB-Trigger sind für Agents opak, nicht testbar ohne DB-Zugang, und schwer zu debuggen.

**Webhook-Logik (`POST /api/tickets/:id/readiness`):**
```ts
// Alle direkten Nachfolger finden (tickets die id in depends_on haben)
const successors = await db.query(
  `SELECT id, external_id, depends_on FROM tickets.tickets WHERE $1 = ANY(depends_on)`,
  [ticketId]
);
for (const s of successors) {
  const allDone = await allPredecessorsDone(s.depends_on);
  if (allDone) {
    await db.query(`UPDATE tickets.tickets SET abhaengigkeiten_klar=true WHERE id=$1`, [s.id]);
  }
}
```

**Tasks:**
- [x] `POST /api/tickets/[id]/readiness.ts` implementieren
- [ ] `PATCH /api/tickets/[id].ts`: bei `status=done` intern `readiness`-Endpunkt aufrufen
- [x] `website/src/lib/tickets-db.ts`: `allPredecessorsDone(dependsOn: string[])` schreiben
- [x] BATS-Test `tests/unit/readiness-webhook.bats`: Ticket done → Nachfolger `abhaengigkeiten_klar=true`
- [ ] Factory-Dispatcher: nach jedem erfolgreichen Deploy `PATCH status=done` → Readiness-Update läuft automatisch

---

## Implementierungs-Reihenfolge

```
TDR-1 → TDR-2
TDR-1 → TDR-3
TDR-1 + TDR-2 → TDR-4
```

TDR-2 und TDR-3 können parallel nach TDR-1.

---

## Verifikation

### Lokal

```bash
# Graph-API prüfen
curl -s http://localhost:4321/api/tickets/graph | jq '.nodes | length'  # > 0

# DAG-Visualisierung
cd website && pnpm dev
# Browser: http://localhost:4321/admin/planungsbuero → Tab "Abhängigkeiten"
# Prüfen: Dark Canvas, Nodes sichtbar, kritischer Pfad amber

# Readiness-Webhook testen
curl -X PATCH http://localhost:4321/api/tickets/T000633 \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'
# → T000634.abhaengigkeiten_klar sollte true werden

task test:all
```

### CI

```bash
task test:all           # BATS + Vitest + freshness
task workspace:validate
```

### Akzeptanzkriterien

- [ ] `GET /api/tickets/graph` gibt valides JSON mit nodes + edges + criticalPath
- [ ] Factory-Dispatcher überspringt Tickets mit offenen Vorgängern (`blocked:T000xxx` im Log)
- [ ] DAG-Canvas: Dark Background, Node-Farben nach Status (amber/grün/rot), kritischer Pfad in Amber
- [ ] Zoom + Pan funktional (Desktop + Mobile)
- [ ] `PATCH /:id status=done` → alle Nachfolger mit allen-done-Vorgängern bekommen `abhaengigkeiten_klar=true`
- [ ] `task test:all` grün
