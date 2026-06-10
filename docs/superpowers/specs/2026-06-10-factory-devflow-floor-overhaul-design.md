# Factory & Dev-Flow Floor Overhaul — Design Spec

**Feature:** `factory-devflow-floor-overhaul`
**Branch:** `feature/factory-devflow-floor-overhaul`
**Datum:** 2026-06-10

---

## Ziel

Der `/dev-status` Factory Floor zeigt heute nur Factory-getriebene Tickets (mit `pipeline_slot`). Dev-flow-execute-Läufe (manuelle Entwickler-Workflows) sind unsichtbar. Ziel: vollständige Telemetrie-Integration sodass `dev-flow-execute` seinen Fortschritt live auf dem Floor widerspiegelt — mit visueller Unterscheidung zu Factory-Tickets und echtem CI-Status auf dem Chip.

---

## Entscheidungen

| Frage | Entscheidung |
|-------|-------------|
| Hall-Layout | C — gemeinsamer Hall, gold=Factory, blau=devflow |
| Phase-Granularität | C — vollständige Events + detail-Strings + CI-Status auf Chip |
| Hall-Query | A — Query erweitern (kein Slot-Zwang für devflow-Tickets) |
| Echtzeit-Updates | B — SSE (`/api/factory-floor/stream`) statt Polling |

---

## Abschnitt 1: Dev-Flow-Execute Telemetrie

### Phase-Event-Mapping

`dev-flow-execute` emittiert 8 Phase-Events mit `--driver devflow`:

| Skill-Schritt | Befehl |
|---------------|--------|
| Schritt 1.5 (Plan gefunden) | `ticket.sh phase $ID plan entered --driver devflow --detail "Plan: <slug> · $TICKET_ID"` |
| Schritt 1.5 (Assets geladen) | `ticket.sh phase $ID plan done --driver devflow --detail "<N> Tasks · Assets geladen"` |
| Schritt 2 (Subagent gespawnt) | `ticket.sh phase $ID implement entered --driver devflow --detail "<N> Tasks · Subagent gestartet"` |
| Schritt 3 (Implementer fertig) | `ticket.sh phase $ID implement done --driver devflow --detail "<N> Dateien geändert"` |
| Schritt 3 (test:all gestartet) | `ticket.sh phase $ID verify entered --driver devflow --detail "task test:all + freshness"` |
| Schritt 3 (Tests grün) | `ticket.sh phase $ID verify done --driver devflow --detail "<N> Tests ✓ · freshness OK"` |
| Schritt 5 (PR erstellt) | `ticket.sh phase $ID deploy entered --driver devflow --detail "PR #<N> · CI watch"` |
| Schritt 5.5 (CI-Retry) | `ticket.sh phase $ID deploy entered --driver devflow --detail "CI attempt <X>/<MAX>"` |
| Schritt 6.5 / 8 (merged+deployed) | `ticket.sh phase $ID deploy done --driver devflow --detail "PR #<N> merged · deployed"` |

### Wichtig: best-effort

Alle `ticket.sh phase`-Aufrufe in dev-flow-execute tragen `|| true` — ein Telemetrie-Fehler darf den Flow nie stoppen. Kein Blocking.

### Bestehende Events

Die bisherigen `implement entered` und `implement done` Events in dev-flow-execute werden durch die obige Tabelle ersetzt (nicht dupliziert). `plan entered` wird neu an Schritt 1.5 hinzugefügt (vor dem bisherigen ersten Event). `verify entered` bleibt, bekommt aber `--detail`.

---

## Abschnitt 2: Hall-Query & Datenmodell

### Query-Erweiterung (`factory-floor.ts` → `activeFeatures()`)

```sql
-- Vorher:
WHERE t.pipeline_slot IS NOT NULL
  AND t.status IN ('in_progress', 'in_review')

-- Nachher:
WHERE t.status IN ('in_progress', 'in_review')
  AND (
    t.pipeline_slot IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM tickets.factory_phase_events e
      WHERE e.ticket_id = t.id
        AND e.driver = 'devflow'
    )
  )
```

### HallItem-Interface-Erweiterung

```typescript
interface HallItem {
  // ... bestehende Felder ...
  driver: 'factory' | 'devflow' | null;   // NEU
  prNumber: number | null;                 // NEU — aus detail-String extrahiert
  ciStatus: 'success' | 'pending' | 'failure' | null;  // NEU — vom API befüllt
}
```

`driver` kommt aus dem neuesten Phase-Event (`e.driver`). `prNumber` wird server-seitig aus dem letzten `deploy`-Phase-Event geparst (Regex: `PR #(\d+)`).

### Slot-Zähler bleibt unberührt

`slotsUsed` und `slotsCap` zählen weiterhin nur `pipeline_slot IS NOT NULL` — devflow-Tickets verfälschen die Kapazitätsanzeige nicht.

---

## Abschnitt 3: Factory Floor UI

### Chip-Design

```svelte
<!-- Factory-Chip (unverändert) -->
<li class:bg-gold={driver === 'factory'} class:text-dark={driver === 'factory'}>
  {extId}
</li>

<!-- devflow-Chip (neu) -->
<li class="border border-blue-400 text-blue-300 bg-blue-950/40"
    title="{extId} · {detail} · seit {minutesSince} Min. in {phase}">
  {extId} 👨‍💻
  {#if ciStatus}
    <span class="ci-badge ci-{ciStatus}" onclick|stopPropagation={() => openPR(prNumber)}>
      {ciStatus === 'success' ? '🟢' : ciStatus === 'failure' ? '🔴' : '🟡'}
    </span>
  {/if}
</li>
```

### Tooltip-Inhalt (title-Attribut)

```
T000582 · PR #1512 · CI attempt 2/5 · seit 8 Min. in deploy
```

Zusammengesetzt aus: `extId`, letztem `detail`-String, `minutesSince(phaseSince)`, aktuellem `phase`.

### Farbschema

| Element | Klassen |
|---------|---------|
| Factory-Chip (aktiv) | `bg-gold text-dark` (unverändert) |
| Factory-Chip (blocked) | `bg-red-500 animate-pulse` (unverändert) |
| devflow-Chip (aktiv) | `border border-blue-400 text-blue-300 bg-blue-950/40` |
| devflow-Chip (blocked) | `border border-red-400 text-red-300 bg-red-950/40 animate-pulse` |
| CI-Badge pending | `bg-yellow-600 text-black rounded px-1 text-[9px]` |
| CI-Badge success | `bg-green-600 text-white rounded px-1 text-[9px]` |
| CI-Badge failure | `bg-red-600 text-white rounded px-1 text-[9px]` |

---

## Abschnitt 4: SSE-Endpoint

### Neuer Endpoint: `GET /api/factory-floor/stream`

```typescript
// website/src/pages/api/factory-floor/stream.ts
export const GET: APIRoute = async ({ locals }) => {
  // Schreibt bei jedem neuen factory_phase_events-Eintrag ein SSE-Event
  // Content-Type: text/event-stream
  // Polling-Intervall server-seitig: 5s
  // Format:
  //   event: phase
  //   data: {"extId":"T000582","phase":"deploy","state":"entered","detail":"PR #1512","driver":"devflow"}
  //
  //   event: heartbeat
  //   data: {"t": <epoch>}
}
```

Der Endpoint pollt alle 5 Sekunden `SELECT MAX(at) FROM tickets.factory_phase_events`. Bei Änderung sendet er das neue Event als SSE. Heartbeat alle 30s um die Verbindung offen zu halten.

### Svelte-Client-Änderung (`FactoryFloor.svelte`)

```typescript
// Ersetzt setInterval
const es = new EventSource('/api/factory-floor/stream', { withCredentials: true });
es.addEventListener('phase', () => reload());       // gezieltes Neu-Laden
es.addEventListener('heartbeat', () => {});         // keepalive, kein Reload
es.onerror = () => setTimeout(() => reconnect(), 5000); // Reconnect bei Fehler
```

`reload()` ruft `/api/factory-floor` neu ab (existierender Fetch). Kein Full-Page-Reload.

### GitHub CI-Status

Der `/api/factory-floor`-Endpoint (Haupt-API, nicht SSE) befüllt `ciStatus` für devflow-Tickets in `deploy`-Phase:

1. Parse `prNumber` aus letztem Phase-Event `detail` (Regex `PR #(\d+)`)
2. Fetch `https://api.github.com/repos/{owner}/{repo}/pulls/{pr}/commits` → letzter Commit-SHA
3. Fetch `https://api.github.com/repos/Paddione/Bachelorprojekt/commits/{sha}/check-runs` mit `Authorization: Bearer ${GITHUB_PAT}`
4. Aggregiere: alle grün → `success`, mind. einer rot → `failure`, sonst → `pending`
5. Cache im In-Memory-Store (TTL 60s) um Rate-Limits zu vermeiden

`GITHUB_PAT` ist bereits in `environments/schema.yaml` registriert — kein neues Token nötig.

---

## Abschnitt 5: Factory pipeline.js — detail-Strings

`pipeline.js` emittiert bereits Phase-Events via `ticket.sh phase`. Ergänzung: jeder Übergang bekommt einen sinnvollen `--detail`-String:

| Phase-Übergang | detail-String |
|----------------|--------------|
| scout/entered | `"Codebase-Analyse gestartet"` |
| scout/done | `"<N> touched_files identifiziert"` |
| design/entered | `"Spec-Generierung"` |
| design/done | `"Spec erstellt"` |
| plan/entered | `"Plan-Erstellung"` |
| plan/done | `"<N> Tasks"` |
| implement/entered | `"Implementierung gestartet"` |
| implement/done | `"<N> Dateien geändert"` |
| verify/entered | `"Tests + Freshness"` |
| verify/done | `"<N> Tests ✓"` |
| deploy/entered | `"PR #<N> erstellt · CI watch"` |
| deploy/done | `"PR #<N> merged"` |

---

## Dateien die sich ändern

| Datei | Änderung |
|-------|----------|
| `.claude/skills/dev-flow-execute/SKILL.md` | 8 Phase-Events mit detail-Strings ergänzen |
| `website/src/lib/factory-floor.ts` | `activeFeatures()` Query + `HallItem` Interface + CI-Status-Fetch |
| `website/src/pages/api/factory-floor.ts` | CI-Status befüllen (prNumber parse + GitHub API) |
| `website/src/pages/api/factory-floor/stream.ts` | NEU — SSE-Endpoint |
| `website/src/components/FactoryFloor.svelte` | SSE-Client + devflow-Chip-Design + CI-Badge |
| `scripts/factory/pipeline.js` | detail-Strings bei Phase-Events ergänzen |
| `environments/schema.yaml` | kein Umbau — `GITHUB_PAT` bereits vorhanden |

---

## Nicht im Scope

- Änderungen am DB-Schema (keine Migration nötig)
- Änderungen am `dispatcher.js` (nur pipeline.js)
- Planungsbüro / `/admin/planungsbuero` (separates Feature)
- Automatisches Setzen von `pipeline_slot` für devflow-Tickets (bewusst ausgelassen)

---

## Testbarkeit

- `factory-floor.test.ts`: neue Unit-Tests für die erweiterte `activeFeatures()`-Query (devflow-Tickets ohne Slot)
- `factory-floor.test.ts`: CI-Status-Aggregation (mock GitHub API)
- E2E-Test (`tests/e2e/`): devflow-Ticket erscheint im Hall nach `ticket.sh phase`-Aufruf mit `driver=devflow`
- SSE-Endpoint: Integration-Test mit `EventSource`-Mock
