---
title: "Factory Parallel-Status — Gang-Sichtbarkeit + Force-Tick (E2E-Proof T002074)"
ticket_id: "T002079"
plan_ref: "openspec/changes/factory-parallel-status/tasks.md"
domains: [website, test]
status: planning
---

# Factory Parallel-Status — Design

## WARUM (Purpose)

T002074 (PR #3100) hat die parallele Partialplan-Pipeline geliefert: Gang-Scheduling
über `tickets.tickets.slot_count`, Partials und den Bonsai-Provider. Der End-to-End-Nachweis
steht aber noch aus — es gibt noch keinen *echten* 3-Partial-Durchstich, der Gang-Claim und
die drei Bonsai-Subagenten gemeinsam auslöst.

Dieses Feature ist genau dieses Proof-Vehikel: ein bewusst kleines, synthetisches Feature,
dessen Wert doppelt ist. (1) Als **Dogfood** der neuen zweistufigen Plan-Phase (Decompose →
paralleler Fan-out) — der Plan zerfällt sauber in drei disjunkte Partials und wird mit
`--partials 3` gestaget, sodass der Gang-Scheduler beim Execute alle drei Slots gemeinsam
claimt. (2) Als **operativer Mehrwert**: Es macht den Gang-Zustand erstmals in der Admin-UI
sichtbar (Parallel-Status-Panel) und gibt Operatoren einen „Force next tick"-Knopf mit
Countdown, statt auf den Cron-Poll zu warten.

## WAS (Scope)

Drei disjunkte Surfaces, geschnitten als drei Partials:

### P1 — Backend / Trigger
- **`website/src/pages/api/factory/parallel-status.ts`** (net-new): Admin-guardeter
  `GET`-Endpoint. Liefert den aggregierten Gang-Zustand als JSON.
- **`website/src/pages/api/factory/force-tick.ts`** (net-new): Admin-guardeter `POST`-Endpoint.
  Schreibt das `factory_control`-Flag `force-tick-requested=<ISO-Timestamp>` via `writeControl`.
- **`website/src/lib/parallel-status.ts`** (net-new): pure, DB-freie Ableitungslogik
  (`deriveParallelStatus`, `deriveNextTickAt`) — die testbare Kernlogik beider Endpoints.
- **`scripts/factory/wakeup.sh`** (edit): konsumiert das Force-Tick-Flag beim Tick-Start
  (lesen → loggen → löschen) und schreibt am Tick-Ende `last-tick-at=<now>` in `factory_control`.

### P2 — UI
- **`website/src/components/DevStatusTabs.svelte`** (edit): neuer Tab `parallel` (inline-Panel,
  gemäß Nutzerentscheid). Client-seitiger `fetch('/api/factory/parallel-status')`, rendert
  `gang_tickets`/`slots_claimed`/`slots_per_brand`, einen Countdown-Timer auf `nextTickAt`
  (bei 0 → „Tick fällig" + Auto-Refetch) und einen „Force next tick"-Button
  (`POST /api/factory/force-tick` → Refetch).
- **`website/src/pages/admin/pipeline.astro`** (edit): `parallel` zu `Tab`-Union und
  `ALLOWED`-Liste hinzufügen (Wiring, damit `?tab=parallel` deep-linkbar ist).

### P3 — Tests (Tests-Rolle, letztes Partial, trägt STRUCT2-Failing-Test)
- **`website/src/lib/parallel-status.test.ts`** (net-new): vitest gegen die pure Logik aus
  `lib/parallel-status.ts` — Ableitung des Aggregats aus Roh-Rows, `nextTickAt`-Berechnung,
  Countdown-Grenzfall (verbleibende Zeit ≤ 0 → „fällig").
- **`tests/spec/software-factory.bats`** (edit): STRUCT2-Failing-Test-Block für die bislang
  **ungetestete** `slot_count`-Gang-Logik von `scripts/factory/slots.sh` (`claim-gang`
  all-or-nothing) plus das Force-Tick-Flag-Handling in `wakeup.sh` (Flag wird gelesen +
  geräumt). Rot→grün.

## Datenfluss

```
Admin-UI (DevStatusTabs.svelte, Tab "parallel")
  │  GET /api/factory/parallel-status
  ▼
parallel-status.ts ── authGuard(getSession/isAdmin) ──► pool.query(tickets.tickets aggregate)
  │                                                       + readControl('last-tick-at')
  ▼  deriveParallelStatus(rows) + deriveNextTickAt(lastTickAt, intervalSec)
{ gangTickets, slotsClaimed, slotsPerBrand, nextTickAt } ──► JSON

Admin-UI "Force next tick"-Button
  │  POST /api/factory/force-tick
  ▼
force-tick.ts ── authGuard ──► writeControl('force-tick-requested', <ISO now>)
                                          │
                                          ▼ (nächster Cron-Poll)
                              wakeup.sh: read flag → log "forced" → clear flag
                                         ... tick ...
                                         write control 'last-tick-at' = now
```

## Aggregat-Query (Gang-Zustand)

Eine read-only Aggregatzeile auf `tickets.tickets` (Muster aus `scripts/factory/slots.sh`):

```sql
SELECT
  COUNT(*) FILTER (
    WHERE slot_count > 1 AND pipeline_slot IS NOT NULL AND status = 'in_progress'
  ) AS gang_tickets,
  COALESCE(SUM(slot_count) FILTER (
    WHERE pipeline_slot IS NOT NULL AND status = 'in_progress'
  ), 0) AS slots_claimed;
```

`slots_per_brand` kommt aus `FACTORY_SLOTS_PER_BRAND` (Default 3). `nextTickAt` wird aus dem
Control-Key `last-tick-at` + `FACTORY_TICK_INTERVAL_SEC` (Default 300) abgeleitet; fehlt
`last-tick-at`, Fallback `now + intervalSec`.

## Fehlerbehandlung

- Endpoints: `authGuard` → 401 (keine Session) / 403 (nicht Admin), analog `factory-control.ts`.
  DB-Fehler → `locals.requestLogger.error({ err }, ...)` + 500 `{ error: 'fetch_failed' }`.
- `force-tick.ts`: idempotent — mehrfaches Drücken überschreibt nur den Timestamp; kein Fehler.
- `wakeup.sh`: Flag-Handling ist best-effort (`|| true`), darf einen Tick nie fail-closed
  abbrechen; `last-tick-at`-Write ebenso best-effort.
- UI: fetch-Fehler → Panel zeigt Fehlermeldung statt Zahlen; Button disabled während Request.

## Testing

- **Pure Logik (vitest, DB-frei):** `deriveParallelStatus`, `deriveNextTickAt` und die
  Countdown-Restzeit sind reine Funktionen → deterministisch testbar mit injizierten
  Zeitwerten (kein `Date.now`-Mocking im Kern; Zeit wird als Argument übergeben).
- **Gang-Logik (bats):** `slot_count`/`claim-gang` all-or-nothing gegen die Test-DB
  (`_skip_if_no_db`), Force-Tick-Flag-Handling in `wakeup.sh` offline (DRY_RUN).
- **STRUCT2:** Der bats-Block ist der rot→grün-Failing-Test (`expected: FAIL` vor der
  wakeup.sh-Änderung).

## Nicht im Scope (YAGNI)

- Kein neues Cron-Interval-Management, keine UI zum Ändern von `FACTORY_TICK_INTERVAL_SEC`.
- Kein Websocket/SSE-Live-Push — der Countdown ist client-seitig; Refetch bei 0 reicht.
- Keine Historie/Charts der Slot-Auslastung — nur der Momentanzustand.
- Kein separates ParallelStatusPanel.svelte — Panel bleibt inline in DevStatusTabs.svelte
  (Nutzerentscheid; Datei ist mit 114 Zeilen weit unter dem 500er-S1-Limit).
