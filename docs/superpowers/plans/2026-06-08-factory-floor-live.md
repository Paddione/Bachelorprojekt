---
title: Factory Floor Live-Visualisierung ("Fabrikhalle") Implementation Plan
ticket_id: T000518
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Factory Floor Live-Visualisierung ("Fabrikhalle") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Baue die bestehende `/dev-status`-Admin-Seite zu einer read-only Live-Visualisierung der Software Factory aus, die pro Ticket die aktuelle Pipeline-Phase, den Blockier-Grund und die fertiggestellten Tickets als "Fabrikhalle" zeigt.

**Architecture:** Eine neue append-only Tabelle `tickets.factory_phase_events` (Phasen-Telemetrie) wird vom neuen `ticket.sh phase`-Subcommand befüllt, der best-effort aus `pipeline.js` (`--driver factory`) und `dev-flow-execute` (`--driver devflow`) gefeuert wird. Eine neue DAL `website/src/lib/factory-floor.ts` aggregiert daraus + aus bestehenden Tabellen ein konsolidiertes JSON, das `GET /api/factory-floor` ausliefert und die neue Svelte-5-Komponente `FactoryFloor.svelte` alle 4 s pollt. Deko-Assets liegen graceful unter `website/public/factory/*.svg` mit Inline-Fallback.

**Tech Stack:** Astro 6, Svelte 5 (`$state`/`$derived`), PostgreSQL (`tickets`-Schema via `pg`-Pool), Bash (`ticket.sh`, `psql` via `kubectl exec`), Vitest + pg-mem, BATS, Playwright (Projekt `website`).

---

## Entschiedene offene Punkte (aus der Spec, hier festgeschrieben)

1. **Detail-Daten:** Das konsolidierte Floor-JSON enthält für die Halle die *aktuelle* Phase/State/Dauer (kompakt). Die **vollständige Detail-Timeline** (alle Phasen-Events + Breadcrumbs + PR-Link) kommt aus einem **separaten, schlanken Endpoint `GET /api/factory-floor/[extId]`** (lazy bei Klick). Begründung: hält das 4-s-Poll-JSON klein, das Detail wird nur on-demand pro Ticket geladen.
2. **Aufruf-Stellen `pipeline.js`:** Je `phase('X')`-Aufruf wird unmittelbar nach dem `phase()`-Call ein `entered`-Event und am erfolgreichen Phasen-Ende ein `done`-Event gefeuert; an jedem `return { status: 'blocked', ... }` ein `blocked`-Event mit `--detail` = `reason`. Die Calls laufen über einen kleinen Inline-Helper `phaseEvent(phase, state, detail)`, der `child_process.execSync(... || true)` nutzt und **niemals wirft**.
3. **Aufruf-Stellen `dev-flow-execute`:** Schritt 1.5 (`in_progress`) → `implement entered`; Schritt 3 (lokale Verifikation) → `implement done` + `verify entered`; Schritt 6.5 (Ticket done) → `deploy done`. Alle mit `--driver devflow` und mit `|| true` angehängt.
4. **Init-Pfad:** `factory_phase_events` wird idempotent in `initTicketsSchema()` (`website/src/lib/tickets-db.ts`) angelegt — `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`, exakt nach dem Muster der bestehenden `pr_events`/`factory_control`-Blöcke. Keine separate Migration.

---

## File Structure

**Neu:**
- `website/src/lib/factory-floor.ts` — DAL: kleine, fokussierte Query-Helper (Leitstand, Laderampe, Halle, Versand, Detail). Verantwortung: ausschließlich Lese-Aggregation für das Floor-Dashboard. `factory-metrics.ts` bleibt unangetastet.
- `website/src/lib/factory-floor.test.ts` — Vitest + pg-mem für die DAL-Ableitungen.
- `website/src/pages/api/factory-floor.ts` — konsolidiertes Floor-JSON (admin-gated).
- `website/src/pages/api/factory-floor/[extId].ts` — Detail-Timeline eines Tickets (admin-gated).
- `website/src/components/FactoryFloor.svelte` — die "Halle"-Komponente (5 Sektionen + Slide-in-Detail).
- `website/public/factory/MANIFEST.md` — Asset-Manifest für Claude Design (D1).
- `tests/local/FA-SF-40-ticket-phase-cli.bats` — BATS arg-validation für `ticket.sh phase`.
- `tests/e2e/specs/fa-factory-floor.spec.ts` — Playwright-Smoke (Projekt `website`).

**Geändert:**
- `website/src/lib/tickets-db.ts` — `factory_phase_events`-Tabelle + Index im `initTicketsSchema()`-Body.
- `scripts/ticket.sh` — neuer `cmd_phase` + Dispatch-Eintrag + Usage-Zeile.
- `scripts/factory/pipeline.js` — `phaseEvent`-Helper + Calls an den 6 Phasen-Grenzen.
- `.claude/skills/dev-flow-execute/SKILL.md` — `ticket.sh phase`-Calls in Schritt 1.5 / 3 / 6.5.
- `website/src/pages/dev-status.astro` — bindet `FactoryFloor.svelte` ein (ersetzt das `FactoryDashboard`).

---

## Task 1: Schema — `tickets.factory_phase_events`

**Files:**
- Modify: `website/src/lib/tickets-db.ts` (im `initTicketsSchema()`-Body, nach dem `factory_control`-Block bei ~Zeile 125)
- Test: `website/src/lib/factory-floor.test.ts` (Tabelle wird im pg-mem-Setup von Task 4 mit-erstellt; hier nur der Schema-DDL-Block)

- [x] **Step 1: DDL-Block in `initTicketsSchema()` einfügen**

In `website/src/lib/tickets-db.ts` direkt nach dem schließenden ` ` ``)`` des `CREATE TABLE IF NOT EXISTS tickets.factory_control (...)`-Blocks (aktuell Zeile ~125) einfügen:

```typescript
  // Software Factory Live-Floor (T-FACTORY-FLOOR): append-only phase telemetry.
  // Each row is one phase transition emitted best-effort by `ticket.sh phase`
  // from pipeline.js (driver=factory) or dev-flow-execute (driver=devflow).
  // The latest row per ticket = its current phase/state. Never blocks the
  // pipeline — a failed insert is swallowed by the caller.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.factory_phase_events (
      id         BIGSERIAL PRIMARY KEY,
      ticket_id  UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      phase      TEXT NOT NULL CHECK (phase IN ('scout','design','plan','implement','verify','deploy')),
      state      TEXT NOT NULL CHECK (state IN ('entered','done','blocked')),
      detail     TEXT,
      driver     TEXT NOT NULL DEFAULT 'factory' CHECK (driver IN ('factory','devflow')),
      at         TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS factory_phase_events_ticket_at_idx ON tickets.factory_phase_events (ticket_id, at DESC)`);
```

- [x] **Step 2: TypeScript-Kompilierung prüfen**

Run: `cd website && npx tsc --noEmit -p tsconfig.json 2>&1 | grep tickets-db || echo "tickets-db clean"`
Expected: `tickets-db clean` (keine Typfehler im geänderten Block).

- [x] **Step 3: Commit**

```bash
git add website/src/lib/tickets-db.ts
git commit -m "feat(factory-floor): add tickets.factory_phase_events schema [T-FACTORY-FLOOR]"
```

---

## Task 2: `ticket.sh phase` Subcommand

**Files:**
- Modify: `scripts/ticket.sh` (neuer `cmd_phase` vor dem Dispatch-`case`; Dispatch-Eintrag + Usage-Zeile)
- Test: `tests/local/FA-SF-40-ticket-phase-cli.bats`

- [x] **Step 1: BATS-Test schreiben (offline arg-validation, validate-before-DB)**

Erstelle `tests/local/FA-SF-40-ticket-phase-cli.bats`:

```bash
#!/usr/bin/env bats
# FA-SF-40: offline arg-validation for the `ticket.sh phase` subcommand. [T-FACTORY-FLOOR]
# All cases validate BEFORE _pgpod, so they are deterministic without a cluster (CI-safe).
setup() { load 'test_helper.bash'; }

@test "FA-SF-40: phase requires ext_id, phase and state" {
  run bash scripts/ticket.sh phase
  [ "$status" -eq 2 ]
  [[ "$output" =~ "Usage" ]]
}
@test "FA-SF-40: phase rejects an invalid phase name" {
  run bash scripts/ticket.sh phase T000001 frobnicate entered
  [ "$status" -eq 2 ]
  [[ "$output" =~ "phase must be one of" ]]
}
@test "FA-SF-40: phase rejects an invalid state" {
  run bash scripts/ticket.sh phase T000001 scout sideways
  [ "$status" -eq 2 ]
  [[ "$output" =~ "state must be one of" ]]
}
@test "FA-SF-40: phase rejects an invalid driver" {
  run bash scripts/ticket.sh phase T000001 scout entered --driver gemini
  [ "$status" -eq 2 ]
  [[ "$output" =~ "driver must be one of" ]]
}
@test "FA-SF-40: dispatch usage lists phase" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "phase" ]]
}
```

- [x] **Step 2: Test laufen lassen — muss FEHLSCHLAGEN (Subcommand existiert noch nicht)**

Run: `cd /tmp/wt-factory-floor-live && ./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-40-ticket-phase-cli.bats`
Expected: FAIL — `phase` ist unbekanntes Kommando (`Unknown command: phase`, status 1 statt 2; bzw. Usage listet `phase` nicht).

- [x] **Step 3: `cmd_phase` implementieren**

In `scripts/ticket.sh` direkt vor der `if [[ $# -lt 1 ]]; then`-Zeile (aktuell ~Zeile 578) einfügen:

```bash
cmd_phase() {
  # Positional: <ext_id> <phase> <state>; then optional --detail / --driver.
  local id="" phase="" state="" detail="" driver="factory"
  if [[ $# -ge 1 && "$1" != --* ]]; then id="$1"; shift; fi
  if [[ $# -ge 1 && "$1" != --* ]]; then phase="$1"; shift; fi
  if [[ $# -ge 1 && "$1" != --* ]]; then state="$1"; shift; fi
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --detail) detail="$2"; shift 2 ;;
      --driver) driver="$2"; shift 2 ;;
      *)        echo "Unknown phase option: $1" >&2; exit 2 ;;
    esac
  done
  # Validate BEFORE _pgpod so bad-arg errors are deterministic without a cluster (FA-SF-40).
  if [[ -z "$id" || -z "$phase" || -z "$state" ]]; then
    echo "Usage: $0 phase <ext_id> <phase> <state> [--detail \"...\"] [--driver factory|devflow]" >&2; exit 2
  fi
  case "$phase" in scout|design|plan|implement|verify|deploy) ;;
    *) echo "ERROR: phase must be one of scout|design|plan|implement|verify|deploy." >&2; exit 2 ;; esac
  case "$state" in entered|done|blocked) ;;
    *) echo "ERROR: state must be one of entered|done|blocked." >&2; exit 2 ;; esac
  case "$driver" in factory|devflow) ;;
    *) echo "ERROR: driver must be one of factory|devflow." >&2; exit 2 ;; esac
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v phase="$phase" -v state="$state" -v detail="$detail" -v driver="$driver" <<'EOF' >/dev/null
INSERT INTO tickets.factory_phase_events (ticket_id, phase, state, detail, driver)
SELECT id, :'phase', :'state', NULLIF(:'detail',''), :'driver'
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  echo "phase recorded: $id $phase/$state (driver=$driver)"
}
```

- [x] **Step 4: Dispatch-Eintrag + Usage-Zeile ergänzen**

In `scripts/ticket.sh` die Usage-Zeile (aktuell ~Zeile 580) erweitern — am Ende der `Commands: ...`-Liste `, phase` anhängen:

```bash
  echo "Commands: create, update-status, add-comment, archive-plan, get-attachments, get, set-touched-files, set-pipeline-slot, release-slot, touch, enqueue, retry-count, factory-control, dryrun-mark, dryrun-check, feature-flag, phase" >&2
```

Und im `case "$cmd" in`-Block (nach `feature-flag)` ~Zeile 601) ergänzen:

```bash
  phase)             cmd_phase "$@" ;;
```

- [x] **Step 5: Test laufen lassen — muss PASSEN**

Run: `cd /tmp/wt-factory-floor-live && ./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-40-ticket-phase-cli.bats`
Expected: PASS (5/5).

- [x] **Step 6: Full factory bats grün halten**

Run: `cd /tmp/wt-factory-floor-live && task test:factory`
Expected: alle FA-SF-*.bats PASS (inkl. der neuen FA-SF-40).

- [x] **Step 7: Commit**

```bash
git add scripts/ticket.sh tests/local/FA-SF-40-ticket-phase-cli.bats
git commit -m "feat(factory-floor): ticket.sh phase telemetry subcommand + FA-SF-40 [T-FACTORY-FLOOR]"
```

---

## Task 3: DAL — `factory-floor.ts` (Leitstand, Laderampe, Halle, Versand)

**Files:**
- Create: `website/src/lib/factory-floor.ts`

> TDD-Hinweis: Tests für diese DAL stehen in Task 4 (sie brauchen das pg-mem-Setup). Diese Task schreibt die Implementierung; Task 4 verifiziert sie rot→grün. Reihenfolge so gewählt, weil die pg-mem-Fixture exakt die hier verwendeten Spalten/Queries spiegeln muss.

- [x] **Step 1: DAL-Datei mit Typen + Query-Helpern anlegen**

Erstelle `website/src/lib/factory-floor.ts`:

```typescript
// Software Factory Live-Floor (T-FACTORY-FLOOR) — read-only aggregation DAL.
// Reads tickets.factory_phase_events (current phase per ticket) joined with the
// existing tickets/factory_control tables. PER-BRAND pool, same-namespace only.
// factory-metrics.ts is intentionally left untouched; this is a separate module.
import { pool } from './website-db';

const PHASE_ORDER = ['scout', 'design', 'plan', 'implement', 'verify', 'deploy'] as const;
export type Phase = (typeof PHASE_ORDER)[number];
export type PhaseState = 'entered' | 'done' | 'blocked';

export interface ControlSnapshot {
  killSwitch: boolean;
  slotsUsed: number;
  slotsCap: number;
  dailyCap: number;
  dailyUsed: number;
  dryRun: boolean;
  watchdogStale: number;
}
export interface FloorMetrics { shippedToday: number; avgCycleH: number | null; }
export interface LoadingDockItem { extId: string; title: string; priority: string; waitReason: string; }
export interface HallItem {
  extId: string; title: string; priority: string;
  phase: Phase | null; phaseState: PhaseState | null; phaseSince: string | null;
  retryCount: number; blockReason: string | null; slot: number | null;
}
export interface ShippedItem { extId: string; title: string; doneAt: string | null; prNumber: number | null; }
export interface FloorPayload {
  control: ControlSnapshot;
  metrics: FloorMetrics;
  loadingDock: LoadingDockItem[];
  hall: HallItem[];
  shipped: ShippedItem[];
  fetchedAt: string;
}

/** Reads a factory_control value (key, global brand=NULL row), default on absence. */
async function readControl(key: string, fallback: string): Promise<string> {
  const r = await pool.query(
    `SELECT value FROM tickets.factory_control WHERE key = $1 AND brand IS NULL LIMIT 1`,
    [key],
  );
  return r.rows[0]?.value ?? fallback;
}

/** Global health strip: kill-switch, slot usage, daily cap, dry-run, watchdog-stale. */
export async function getControl(slotsCap: number): Promise<ControlSnapshot> {
  const [killVal, capVal, dailyUsedVal, dryVal, slotsRow, staleRow] = await Promise.all([
    readControl('killswitch', 'off'),
    readControl('daily-cap', '5'),
    readControl(`daily-deploys:${new Date().toISOString().slice(0, 10)}`, '0'),
    readControl('dry-run', 'off'),
    pool.query(`SELECT COUNT(*)::int AS n FROM tickets.tickets WHERE pipeline_slot IS NOT NULL`),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM tickets.tickets
        WHERE pipeline_slot IS NOT NULL AND updated_at < now() - INTERVAL '20 minutes'`,
    ),
  ]);
  return {
    killSwitch: killVal === 'on',
    slotsUsed: slotsRow.rows[0]?.n ?? 0,
    slotsCap,
    dailyCap: parseInt(capVal, 10) || 0,
    dailyUsed: parseInt(dailyUsedVal, 10) || 0,
    dryRun: dryVal === 'on',
    watchdogStale: staleRow.rows[0]?.n ?? 0,
  };
}

/** Throughput + cycle-time for today (today = newest v_factory_metrics day). */
export async function getMetrics(): Promise<FloorMetrics> {
  const r = await pool.query(
    `SELECT features_shipped, avg_cycle_time_h FROM tickets.v_factory_metrics ORDER BY day DESC LIMIT 1`,
  );
  const row = r.rows[0];
  return {
    shippedToday: row?.features_shipped ?? 0,
    avgCycleH: row?.avg_cycle_time_h != null ? Number(row.avg_cycle_time_h) : null,
  };
}

/** Backlog features waiting for a slot, with a derived wait reason. */
export async function getLoadingDock(slotsUsed: number, slotsCap: number): Promise<LoadingDockItem[]> {
  const r = await pool.query(
    `SELECT external_id, title, priority, retry_count
       FROM tickets.tickets
      WHERE type = 'feature' AND status = 'backlog' AND pipeline_slot IS NULL
      ORDER BY CASE priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 WHEN 'niedrig' THEN 3 END,
               created_at`,
  );
  const slotsFull = slotsUsed >= slotsCap;
  return r.rows.map((row: any) => ({
    extId: row.external_id,
    title: row.title,
    priority: row.priority,
    waitReason:
      (row.retry_count ?? 0) >= 2 ? 'retry erschöpft' : slotsFull ? 'Slot voll' : 'wartet auf Dispatch',
  }));
}

/** Active features (in a slot) joined with their latest phase event. */
export async function getHall(): Promise<HallItem[]> {
  const r = await pool.query(
    `SELECT t.external_id, t.title, t.priority, t.pipeline_slot, t.retry_count,
            e.phase, e.state, e.detail, e.at
       FROM tickets.tickets t
       LEFT JOIN LATERAL (
         SELECT phase, state, detail, at
           FROM tickets.factory_phase_events
          WHERE ticket_id = t.id
          ORDER BY at DESC LIMIT 1
       ) e ON TRUE
      WHERE t.pipeline_slot IS NOT NULL
      ORDER BY t.pipeline_slot`,
  );
  return r.rows.map((row: any) => ({
    extId: row.external_id,
    title: row.title,
    priority: row.priority,
    phase: row.phase ?? null,
    phaseState: row.state ?? null,
    phaseSince: row.at ? new Date(row.at).toISOString() : null,
    retryCount: row.retry_count ?? 0,
    blockReason: row.state === 'blocked' ? (row.detail ?? 'blockiert') : null,
    slot: row.pipeline_slot ?? null,
  }));
}

/** Recently shipped (done) tickets with PR linkage. */
export async function getShipped(limit = 8): Promise<ShippedItem[]> {
  const r = await pool.query(
    `SELECT t.external_id, t.title, t.done_at,
            (SELECT pr_number FROM tickets.ticket_links
              WHERE from_id = t.id AND kind = 'pr' AND pr_number IS NOT NULL
              ORDER BY created_at DESC LIMIT 1) AS pr_number
       FROM tickets.tickets t
      WHERE t.status = 'done'
      ORDER BY t.done_at DESC NULLS LAST
      LIMIT $1`,
    [limit],
  );
  return r.rows.map((row: any) => ({
    extId: row.external_id,
    title: row.title,
    doneAt: row.done_at ? new Date(row.done_at).toISOString() : null,
    prNumber: row.pr_number ?? null,
  }));
}

/** Assemble the full floor payload. slotsCap from FACTORY_GLOBAL_CAP. */
export async function getFloor(slotsCap: number): Promise<FloorPayload> {
  const control = await getControl(slotsCap);
  const [metrics, loadingDock, hall, shipped] = await Promise.all([
    getMetrics(),
    getLoadingDock(control.slotsUsed, control.slotsCap),
    getHall(),
    getShipped(),
  ]);
  return { control, metrics, loadingDock, hall, shipped, fetchedAt: new Date().toISOString() };
}
```

- [x] **Step 2: TypeScript-Kompilierung prüfen**

Run: `cd website && npx tsc --noEmit -p tsconfig.json 2>&1 | grep factory-floor || echo "factory-floor clean"`
Expected: `factory-floor clean`.

- [x] **Step 3: Commit**

```bash
git add website/src/lib/factory-floor.ts
git commit -m "feat(factory-floor): factory-floor.ts read-only DAL [T-FACTORY-FLOOR]"
```

---

## Task 4: Vitest + pg-mem für `factory-floor.ts`

**Files:**
- Create: `website/src/lib/factory-floor.test.ts`

- [x] **Step 1: Test mit pg-mem-Fixture schreiben (Muster wie `factory-metrics.test.ts`)**

Erstelle `website/src/lib/factory-floor.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('pg', () => {
  const { newDb } = require('pg-mem') as typeof import('pg-mem');
  const mem = newDb();
  mem.public.none(`
    CREATE SCHEMA tickets;
    CREATE TABLE tickets.tickets (
      id text, external_id text, type text, title text, priority text, status text,
      pipeline_slot int, retry_count int, done_at timestamptz, created_at timestamptz, updated_at timestamptz);
    CREATE TABLE tickets.factory_phase_events (
      id serial, ticket_id text, phase text, state text, detail text, driver text, at timestamptz);
    CREATE TABLE tickets.factory_control (key text, brand text, value text, set_by text, updated_at timestamptz);
    CREATE TABLE tickets.ticket_links (
      id serial, from_id text, to_id text, kind text, pr_number int, created_at timestamptz);
    CREATE VIEW tickets.v_factory_metrics AS
      SELECT day, features_shipped, avg_cycle_time_h FROM (VALUES
        ('2026-06-08'::date, 3, 4.2::numeric)) AS v(day, features_shipped, avg_cycle_time_h);

    -- one active ticket in a slot, latest event = implement/entered
    INSERT INTO tickets.tickets VALUES
      ('h1','T000459','feature','Hall feature','hoch','in_progress',1,0,NULL, now(), now()),
      -- one blocked active ticket, latest event = verify/blocked
      ('b1','T000460','feature','Blocked feature','mittel','in_progress',2,1,NULL, now(), now()),
      -- one backlog feature waiting (no slot)
      ('d1','T000480','feature','Dock feature','niedrig','backlog',NULL,0,NULL, now(), now()),
      -- one shipped ticket
      ('s1','T000467','feature','Shipped feature','mittel','done',NULL,0, now(), now(), now());
    INSERT INTO tickets.factory_phase_events (ticket_id, phase, state, detail, driver, at) VALUES
      ('h1','scout','done',NULL,'factory', now() - INTERVAL '10 min'),
      ('h1','implement','entered',NULL,'factory', now() - INTERVAL '2 min'),
      ('b1','verify','blocked','2 HIGH review findings','factory', now() - INTERVAL '1 min');
    INSERT INTO tickets.factory_control (key, brand, value) VALUES
      ('killswitch', NULL, 'off'),
      ('daily-cap', NULL, '5');
    INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number, created_at) VALUES
      ('s1','s1','pr', 1422, now());
  `);
  const { Pool } = mem.adapters.createPg();
  return { default: { Pool }, Pool };
});
vi.mock('./tickets-db', () => ({
  initTicketsSchema: vi.fn().mockResolvedValue(undefined),
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}));

import { getHall, getLoadingDock, getShipped, getMetrics, getControl } from './factory-floor';

describe('factory-floor DAL', () => {
  it('getHall derives the latest phase/state per active ticket and the block reason', async () => {
    const hall = await getHall();
    const byId = Object.fromEntries(hall.map((h) => [h.extId, h]));
    expect(byId['T000459'].phase).toBe('implement');
    expect(byId['T000459'].phaseState).toBe('entered');
    expect(byId['T000459'].blockReason).toBeNull();
    expect(byId['T000460'].phase).toBe('verify');
    expect(byId['T000460'].phaseState).toBe('blocked');
    expect(byId['T000460'].blockReason).toBe('2 HIGH review findings');
    expect(byId['T000460'].retryCount).toBe(1);
  });

  it('getLoadingDock returns backlog features with a wait reason', async () => {
    const dock = await getLoadingDock(2, 3); // slots not full
    expect(dock.map((d) => d.extId)).toEqual(['T000480']);
    expect(dock[0].waitReason).toBe('wartet auf Dispatch');
  });

  it('getLoadingDock reports "Slot voll" when slotsUsed >= slotsCap', async () => {
    const dock = await getLoadingDock(3, 3);
    expect(dock[0].waitReason).toBe('Slot voll');
  });

  it('getShipped returns done tickets with PR linkage', async () => {
    const shipped = await getShipped();
    expect(shipped.map((s) => s.extId)).toEqual(['T000467']);
    expect(shipped[0].prNumber).toBe(1422);
  });

  it('getMetrics reports today throughput + cycle time', async () => {
    const m = await getMetrics();
    expect(m.shippedToday).toBe(3);
    expect(m.avgCycleH).toBe(4.2);
  });

  it('getControl maps killswitch + slot usage + daily cap', async () => {
    const c = await getControl(3);
    expect(c.killSwitch).toBe(false);
    expect(c.slotsCap).toBe(3);
    expect(c.slotsUsed).toBe(2); // h1 + b1 in slots
    expect(c.dailyCap).toBe(5);
  });
});
```

- [x] **Step 2: Test laufen lassen — erwarte PASS (DAL existiert aus Task 3)**

Run: `cd website && npx vitest run src/lib/factory-floor.test.ts`
Expected: PASS (6/6). Falls eine pg-mem-Inkompatibilität auftritt (z. B. `LATERAL`/`INTERVAL`-Parsing), passe die Query in `factory-floor.ts` minimal an, bis Test + echte Postgres-Semantik beide erfüllt sind — niemals die Assertion abschwächen.

- [x] **Step 3: Commit**

```bash
git add website/src/lib/factory-floor.test.ts
git commit -m "test(factory-floor): pg-mem unit tests for the floor DAL [T-FACTORY-FLOOR]"
```

---

## Task 5: API — `GET /api/factory-floor` (konsolidiertes JSON)

**Files:**
- Create: `website/src/pages/api/factory-floor.ts`

- [x] **Step 1: Endpoint anlegen (admin-gated, Muster wie `factory-metrics.ts`)**

Erstelle `website/src/pages/api/factory-floor.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../lib/auth';
import { getFloor } from '../../lib/factory-floor';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const slotsCap = parseInt(process.env.FACTORY_GLOBAL_CAP ?? '3', 10);
  try {
    const payload = await getFloor(slotsCap);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/factory-floor]', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
```

- [x] **Step 2: TypeScript-Kompilierung prüfen**

Run: `cd website && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "api/factory-floor" || echo "endpoint clean"`
Expected: `endpoint clean`.

- [x] **Step 3: Commit**

```bash
git add website/src/pages/api/factory-floor.ts
git commit -m "feat(factory-floor): GET /api/factory-floor consolidated JSON [T-FACTORY-FLOOR]"
```

---

## Task 6: DAL-Detail + Endpoint `GET /api/factory-floor/[extId]`

**Files:**
- Modify: `website/src/lib/factory-floor.ts` (Detail-Helper anhängen)
- Modify: `website/src/lib/factory-floor.test.ts` (Detail-Test ergänzen)
- Create: `website/src/pages/api/factory-floor/[extId].ts`

- [x] **Step 1: Detail-Test schreiben (an bestehende factory-floor.test.ts anhängen)**

Am Ende von `website/src/lib/factory-floor.test.ts`, vor der schließenden `});` des `describe`, ergänzen:

```typescript
  it('getTicketDetail returns the full phase timeline + breadcrumbs + PR for a ticket', async () => {
    const { getTicketDetail } = await import('./factory-floor');
    const detail = await getTicketDetail('T000459');
    expect(detail).not.toBeNull();
    expect(detail!.extId).toBe('T000459');
    // two events for h1 (scout/done, implement/entered), newest first
    expect(detail!.events.length).toBe(2);
    expect(detail!.events[0].phase).toBe('implement');
    expect(detail!.retryCount).toBe(0);
  });

  it('getTicketDetail returns null for an unknown ticket', async () => {
    const { getTicketDetail } = await import('./factory-floor');
    expect(await getTicketDetail('T999999')).toBeNull();
  });
```

> Hinweis: Die pg-mem-Fixture in Task 4 enthält bereits keine `ticket_comments`-Tabelle. Füge sie im `mem.public.none(...)`-DDL-Block dieser Datei hinzu (eine Zeile: `CREATE TABLE tickets.ticket_comments (id serial, ticket_id text, author_label text, kind text, body text, visibility text, created_at timestamptz);`), damit der Breadcrumb-Join in `getTicketDetail` läuft. Keine Test-Zeilen nötig (leere Breadcrumb-Liste ist ein valider Fall).

- [x] **Step 2: Detail-Helper in `factory-floor.ts` anhängen**

Am Ende von `website/src/lib/factory-floor.ts` ergänzen:

```typescript
export interface PhaseEventRow { phase: Phase; state: PhaseState; detail: string | null; driver: string; at: string; }
export interface Breadcrumb { authorLabel: string; body: string; at: string; }
export interface TicketDetail {
  extId: string; title: string; status: string; priority: string;
  retryCount: number; prNumber: number | null;
  events: PhaseEventRow[];
  breadcrumbs: Breadcrumb[];
}

/** Full per-ticket detail for the slide-in panel; null if the ext_id is unknown. */
export async function getTicketDetail(extId: string): Promise<TicketDetail | null> {
  const t = await pool.query(
    `SELECT id, external_id, title, status, priority, retry_count FROM tickets.tickets WHERE external_id = $1`,
    [extId],
  );
  if (!t.rows.length) return null;
  const row = t.rows[0];
  const [events, breadcrumbs, pr] = await Promise.all([
    pool.query(
      `SELECT phase, state, detail, driver, at FROM tickets.factory_phase_events
        WHERE ticket_id = $1 ORDER BY at DESC`,
      [row.id],
    ),
    pool.query(
      `SELECT author_label, body, created_at FROM tickets.ticket_comments
        WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 8`,
      [row.id],
    ),
    pool.query(
      `SELECT pr_number FROM tickets.ticket_links
        WHERE from_id = $1 AND kind = 'pr' AND pr_number IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [row.id],
    ),
  ]);
  return {
    extId: row.external_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    retryCount: row.retry_count ?? 0,
    prNumber: pr.rows[0]?.pr_number ?? null,
    events: events.rows.map((e: any) => ({
      phase: e.phase, state: e.state, detail: e.detail ?? null, driver: e.driver,
      at: new Date(e.at).toISOString(),
    })),
    breadcrumbs: breadcrumbs.rows.map((b: any) => ({
      authorLabel: b.author_label, body: b.body, at: new Date(b.created_at).toISOString(),
    })),
  };
}
```

- [x] **Step 3: Test laufen lassen — muss PASSEN**

Run: `cd website && npx vitest run src/lib/factory-floor.test.ts`
Expected: PASS (8/8).

- [x] **Step 4: Detail-Endpoint anlegen**

Erstelle `website/src/pages/api/factory-floor/[extId].ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { getTicketDetail } from '../../../lib/factory-floor';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  const extId = params.extId ?? '';
  try {
    const detail = await getTicketDetail(extId);
    if (!detail) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(detail), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/factory-floor/[extId]]', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
};
```

- [x] **Step 5: TypeScript-Kompilierung prüfen**

Run: `cd website && npx tsc --noEmit -p tsconfig.json 2>&1 | grep factory-floor || echo "detail clean"`
Expected: `detail clean`.

- [x] **Step 6: Commit**

```bash
git add website/src/lib/factory-floor.ts website/src/lib/factory-floor.test.ts website/src/pages/api/factory-floor/[extId].ts
git commit -m "feat(factory-floor): ticket detail DAL + GET /api/factory-floor/[extId] [T-FACTORY-FLOOR]"
```

---

## Task 7: Pipeline-Instrumentierung — `pipeline.js`

**Files:**
- Modify: `scripts/factory/pipeline.js`

> Telemetrie ist best-effort: der Helper darf NIE werfen. `pipeline.js` ist ein Workflow-Script (keine ESM-Imports erlaubt) — `child_process.execSync` wird inline via `require` geholt, in `try/catch` gekapselt.

- [x] **Step 1: `phaseEvent`-Helper definieren**

In `scripts/factory/pipeline.js` innerhalb der `async function main()`, direkt nach der Zeile, die `A` / `REPO` / `A.ticket_id` verfügbar macht (vor `phase('Scout')`, aktuell ~Zeile 170), einfügen:

```javascript
// Best-effort live-floor telemetry. NEVER throws — a failed insert must not
// kill the pipeline (T-FACTORY-FLOOR). One INSERT per phase boundary.
function phaseEvent(ph, state, detail) {
  try {
    const { execSync } = require('child_process')
    const d = detail ? ` --detail ${JSON.stringify(String(detail).slice(0, 240))}` : ''
    execSync(`bash ${REPO}/scripts/ticket.sh phase ${A.ticket_id} ${ph} ${state} --driver factory${d}`,
      { stdio: 'ignore', timeout: 15000 })
  } catch { /* telemetry is best-effort; swallow */ }
}
```

- [x] **Step 2: Calls an den 6 Phasen-Grenzen einsetzen**

Jeweils direkt **nach** dem bestehenden `phase('X')`-Aufruf ein `entered`, und an den Phasen-Enden ein `done`/`blocked`:

- Nach `phase('Scout')` (~Z.173): `phaseEvent('scout', 'entered')` — nach erfolgreichem `scout:persist` (~Z.199): `phaseEvent('scout', 'done')`
- Nach `phase('Design')` (~Z.207): `phaseEvent('design', 'entered')` — nach `specPath = design.trim()` (~Z.225): `phaseEvent('design', 'done')`
- Nach `phase('Plan')` (~Z.231 und ~Z.305 im REUSE-Zweig): `phaseEvent('plan', 'entered')` — nach `tasks = plan.tasks` / `tasks = reuse.tasks`: `phaseEvent('plan', 'done')`
- Im Conflict-Block vor `return { status: 'blocked', reason: 'file-overlap', ... }` (~Z.256): `phaseEvent('plan', 'blocked', 'file-overlap: ' + String(conflict).slice(0,120))`
- Nach `phase('Implement')` (~Z.327): `phaseEvent('implement', 'entered')` — nach der `for`-Schleife (~Z.380, vor `phase('Verify')`): `phaseEvent('implement', 'done')`
- Vor `return { status: 'blocked', reason: 'worktree-setup', ... }` (~Z.348): `phaseEvent('implement', 'blocked', 'worktree-setup')`
- Nach `phase('Verify')` (~Z.384): `phaseEvent('verify', 'entered')` — nach dem `blocking.length`-Block, wenn NICHT geblockt (direkt vor `phase('Deploy')`, ~Z.424): `phaseEvent('verify', 'done')`
- Vor `return { status: 'blocked', reason: 'review-findings', ... }` (~Z.421): `phaseEvent('verify', 'blocked', blocking.length + ' HIGH/CRITICAL finding(s)')`
- Nach `phase('Deploy')` (~Z.425): `phaseEvent('deploy', 'entered')` — im DRY_RUN-Zweig vor `return { status: 'dry-run', ... }` (~Z.437): `phaseEvent('deploy', 'done', 'dry-run')`
- Am erfolgreichen Ende des Deploy-Agent-Pfades (nach dem `const deploy = await agent(...)`-Block, beim erfolgreichen Abschluss von `main()`): `phaseEvent('deploy', 'done')`. Falls der Deploy-Pfad ein `return { status: 'blocked', reason: 'deploy-guard', ... }` enthält: davor `phaseEvent('deploy', 'blocked', 'deploy-guard')`.

> Exakte Zeilennummern können nach vorherigen Tasks driften — orientiere dich an den `phase('X')`-Strings und den `return { status: 'blocked', reason: ... }`-Stellen, nicht an den Nummern.

- [x] **Step 3: Offline-Lint (Workflow-Script bleibt parsbar)**

Run: `cd /tmp/wt-factory-floor-live && node --check scripts/factory/pipeline.js`
Expected: kein Output (Syntax OK).

- [x] **Step 4: Factory-Dry-Run-Gate grün halten**

Run: `cd /tmp/wt-factory-floor-live && task test:factory`
Expected: alle FA-SF-*.bats PASS.

- [x] **Step 5: Commit**

```bash
git add scripts/factory/pipeline.js
git commit -m "feat(factory-floor): best-effort phase telemetry in pipeline.js [T-FACTORY-FLOOR]"
```

---

## Task 8: dev-flow-execute-Instrumentierung

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md`

> Telemetrie hier ebenfalls best-effort: jeder Call mit `|| true` und `--driver devflow`, damit ein Insert-Fehler den manuellen Flow nie stoppt.

- [x] **Step 1: Schritt 1.5 — `implement entered`**

In `.claude/skills/dev-flow-execute/SKILL.md`, im Codeblock von **Schritt 1.5** nach der `update-status --status in_progress`-Zeile ergänzen:

```bash
# Live-Floor-Telemetrie (best-effort; --driver devflow; darf den Flow nie stoppen)
./scripts/ticket.sh phase "$TICKET_ID" implement entered --driver devflow || true
```

- [x] **Step 2: Schritt 3 — `implement done` + `verify entered`**

In **Schritt 3 (Lokale Verifikation)**, am Anfang des Codeblocks (vor `task workspace:validate`) ergänzen:

```bash
./scripts/ticket.sh phase "$TICKET_ID" implement done --driver devflow || true
./scripts/ticket.sh phase "$TICKET_ID" verify entered --driver devflow || true
```

- [x] **Step 3: Schritt 6.5 — `deploy done`**

In **Schritt 6.5 (Ticket abschließen)**, im Codeblock nach der `update-status --status done`-Zeile ergänzen:

```bash
./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow || true
```

- [x] **Step 4: Commit**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "feat(factory-floor): instrument dev-flow-execute with phase telemetry [T-FACTORY-FLOOR]"
```

---

## Task 9: Frontend — `FactoryFloor.svelte`

**Files:**
- Create: `website/src/components/FactoryFloor.svelte`

- [ ] **Step 1: Komponente anlegen (Svelte 5 `$state`, 4-s-Poll, graceful Assets)**

Erstelle `website/src/components/FactoryFloor.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Phase = 'scout' | 'design' | 'plan' | 'implement' | 'verify' | 'deploy';
  interface ControlSnapshot { killSwitch: boolean; slotsUsed: number; slotsCap: number; dailyCap: number; dailyUsed: number; dryRun: boolean; watchdogStale: number; }
  interface FloorMetrics { shippedToday: number; avgCycleH: number | null; }
  interface LoadingDockItem { extId: string; title: string; priority: string; waitReason: string; }
  interface HallItem { extId: string; title: string; priority: string; phase: Phase | null; phaseState: 'entered'|'done'|'blocked'|null; phaseSince: string | null; retryCount: number; blockReason: string | null; slot: number | null; }
  interface ShippedItem { extId: string; title: string; doneAt: string | null; prNumber: number | null; }
  interface FloorPayload { control: ControlSnapshot; metrics: FloorMetrics; loadingDock: LoadingDockItem[]; hall: HallItem[]; shipped: ShippedItem[]; fetchedAt: string; }

  interface PhaseEventRow { phase: Phase; state: string; detail: string | null; driver: string; at: string; }
  interface Breadcrumb { authorLabel: string; body: string; at: string; }
  interface TicketDetail { extId: string; title: string; status: string; priority: string; retryCount: number; prNumber: number | null; events: PhaseEventRow[]; breadcrumbs: Breadcrumb[]; }

  let { initial }: { initial: FloorPayload | null } = $props();

  const POLL_MS = 4000;
  const STATIONS: { key: Phase; label: string }[] = [
    { key: 'scout', label: 'Scout' }, { key: 'design', label: 'Design' }, { key: 'plan', label: 'Plan' },
    { key: 'implement', label: 'Implement' }, { key: 'verify', label: 'Verify' }, { key: 'deploy', label: 'Deploy' },
  ];

  let data = $state<FloorPayload | null>(initial);
  let stale = $state(false);
  let selected = $state<string | null>(null);
  let detail = $state<TicketDetail | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    try {
      const res = await fetch('/api/factory-floor', { credentials: 'same-origin' });
      if (!res.ok) { stale = true; return; }
      data = await res.json() as FloorPayload;
      stale = false;
    } catch { stale = true; }
  }

  async function openDetail(extId: string) {
    selected = extId; detail = null;
    try {
      const res = await fetch(`/api/factory-floor/${encodeURIComponent(extId)}`, { credentials: 'same-origin' });
      if (res.ok) detail = await res.json() as TicketDetail;
    } catch { /* keep panel open with a spinner */ }
  }
  function closeDetail() { selected = null; detail = null; }

  function hallAt(station: Phase): HallItem[] {
    return data?.hall.filter((h) => h.phase === station) ?? [];
  }
  function assetFallback(e: Event) { (e.currentTarget as HTMLImageElement).style.display = 'none'; }

  onMount(() => { if (!initial) refresh(); timer = setInterval(refresh, POLL_MS); });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

<div class="text-light" data-testid="factory-floor">
  {#if !data}
    <p class="text-muted">Fabrikhalle lädt…</p>
  {:else}
    {#if stale}
      <div class="mb-3 text-sm text-amber-400/80" data-testid="floor-stale">Veraltet — letzter Stand wird gezeigt.</div>
    {/if}

    <!-- ① Leitstand -->
    <div class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6" data-testid="floor-leitstand">
      <div class="rounded-xl p-3" class:bg-red-500={data.control.killSwitch} class:bg-white={!data.control.killSwitch} class:bg-opacity-5={!data.control.killSwitch}>
        <p class="text-muted text-xs">Kill-Switch</p><p class="text-xl font-bold">{data.control.killSwitch ? 'AN' : 'aus'}</p>
      </div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Slots</p><p class="text-xl font-bold" data-testid="floor-slots">{data.control.slotsUsed}/{data.control.slotsCap}</p></div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Daily-Cap</p><p class="text-xl font-bold">{data.control.dailyUsed}/{data.control.dailyCap}</p></div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Durchsatz heute</p><p class="text-xl font-bold">{data.metrics.shippedToday}</p></div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Ø Zyklus</p><p class="text-xl font-bold">{data.metrics.avgCycleH ?? '–'}h</p></div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Watchdog-Stale</p><p class="text-xl font-bold">{data.control.watchdogStale}</p></div>
    </div>

    <div class="flex flex-col lg:flex-row gap-4">
      <!-- ② Laderampe -->
      <div class="lg:w-1/5" data-testid="floor-loadingdock">
        <h3 class="font-semibold mb-2">Laderampe</h3>
        {#if data.loadingDock.length === 0}
          <p class="text-muted text-sm">Leer.</p>
        {:else}
          <ul class="space-y-1">
            {#each data.loadingDock as d (d.extId)}
              <li class="rounded bg-white/5 px-2 py-1 text-sm">
                <span class="font-mono">{d.extId}</span> — {d.title}
                <span class="block text-muted text-xs">⏳ {d.waitReason}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- ③ Die Halle -->
      <div class="lg:w-3/5" data-testid="floor-hall">
        <h3 class="font-semibold mb-2">Halle</h3>
        {#if data.hall.length === 0}
          <p class="text-muted text-sm">Fabrik im Leerlauf.</p>
        {/if}
        <div class="grid grid-cols-6 gap-2">
          {#each STATIONS as st (st.key)}
            <div class="rounded-lg bg-white/5 p-2 min-h-24">
              <img src={`/factory/station-${st.key}.svg`} alt="" class="h-8 mx-auto mb-1" onerror={assetFallback} />
              <p class="text-center text-xs text-muted mb-1">{st.label}</p>
              {#each hallAt(st.key) as w (w.extId)}
                <button
                  onclick={() => openDetail(w.extId)}
                  data-testid="floor-workpiece"
                  class="block w-full text-left rounded px-1 py-0.5 text-xs mb-1 transition-all"
                  class:bg-gold={w.phaseState !== 'blocked'}
                  class:text-dark={w.phaseState !== 'blocked'}
                  class:bg-red-500={w.phaseState === 'blocked'}
                  class:animate-pulse={w.phaseState === 'blocked'}>
                  {w.extId}{w.phaseState === 'blocked' ? ' ⛔' : ''}
                </button>
              {/each}
            </div>
          {/each}
        </div>
      </div>

      <!-- ④ Versand -->
      <div class="lg:w-1/5" data-testid="floor-shipped">
        <h3 class="font-semibold mb-2">Versand</h3>
        {#if data.shipped.length === 0}
          <p class="text-muted text-sm">Noch nichts versandt.</p>
        {:else}
          <ul class="space-y-1">
            {#each data.shipped as s (s.extId)}
              <li class="rounded bg-white/5 px-2 py-1 text-sm">
                <span class="font-mono">{s.extId}</span> — {s.title}
                {#if s.prNumber}<span class="block text-muted text-xs">PR #{s.prNumber}</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <!-- ⑤ Detail-Panel (Slide-in) -->
    {#if selected}
      <div class="fixed inset-y-0 right-0 w-full max-w-md bg-dark-light border-l border-white/10 p-5 overflow-y-auto z-50" data-testid="floor-detail">
        <button onclick={closeDetail} class="float-right text-muted">✕</button>
        <h3 class="font-bold mb-3">{selected}</h3>
        {#if !detail}
          <p class="text-muted text-sm">Lädt…</p>
        {:else}
          <p class="mb-2">{detail.title}</p>
          <p class="text-muted text-sm mb-3">Status: {detail.status} · Priorität: {detail.priority} · Retries: {detail.retryCount}{#if detail.prNumber} · PR #{detail.prNumber}{/if}</p>
          <h4 class="font-semibold mt-3 mb-1">Phasen-Timeline</h4>
          <ul class="space-y-1 text-sm">
            {#each detail.events as e}
              <li class="rounded bg-white/5 px-2 py-1">
                <span class="font-mono">{e.phase}/{e.state}</span>
                <span class="text-muted text-xs"> · {new Date(e.at).toLocaleString('de-DE')} · {e.driver}</span>
                {#if e.detail}<span class="block text-muted text-xs">{e.detail}</span>{/if}
              </li>
            {/each}
          </ul>
          {#if detail.breadcrumbs.length}
            <h4 class="font-semibold mt-3 mb-1">Breadcrumbs</h4>
            <ul class="space-y-1 text-sm">
              {#each detail.breadcrumbs as b}
                <li class="rounded bg-white/5 px-2 py-1"><span class="text-muted text-xs">{b.authorLabel}:</span> {b.body}</li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    {/if}
  {/if}
</div>
```

- [ ] **Step 2: TypeScript/Svelte-Check**

Run: `cd website && npx svelte-check --tsconfig tsconfig.json 2>&1 | grep -i "factory-floor\|FactoryFloor" || echo "FactoryFloor clean"`
Expected: `FactoryFloor clean` (keine Fehler in der Komponente; Warnungen aus Bestandscode ignorieren).

- [ ] **Step 3: Commit**

```bash
git add website/src/components/FactoryFloor.svelte
git commit -m "feat(factory-floor): FactoryFloor.svelte live hall component [T-FACTORY-FLOOR]"
```

---

## Task 10: `dev-status.astro` auf `FactoryFloor` umstellen

**Files:**
- Modify: `website/src/pages/dev-status.astro`

- [ ] **Step 1: Astro-Seite anpassen (SSR-Initialload via `getFloor`)**

Ersetze den Inhalt von `website/src/pages/dev-status.astro` durch:

```astro
---
import AdminLayout from '../layouts/AdminLayout.astro';
import { getSession, isAdmin } from '../lib/auth';
import FactoryFloor from '../components/FactoryFloor.svelte';
import { getFloor } from '../lib/factory-floor';

export const prerender = false;

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(`/api/auth/login?redirect=${encodeURIComponent(Astro.url.pathname)}`);
// Dashboard gating reuses the isAdmin() username allowlist (PORTAL_ADMIN_USERNAME),
// a documented deviation from the /dev-access group model (no groups claim on the
// website session). See spec D-DASH.
if (!isAdmin(session)) return Astro.redirect('/admin');

const slotsCap = parseInt(process.env.FACTORY_GLOBAL_CAP ?? '3', 10);

let initial = null;
try { initial = await getFloor(slotsCap); } catch { initial = null; }
---

<AdminLayout title="Factory Status">
  <section class="pt-6 pb-12 bg-dark min-h-screen">
    <div class="max-w-7xl mx-auto px-6">
      <h1 class="text-2xl font-bold mb-6">Software Factory — Fabrikhalle (Live)</h1>
      <FactoryFloor client:load {initial} />
    </div>
  </section>
</AdminLayout>
```

> `FactoryDashboard.svelte` und `factory-metrics.ts`/`api/factory-metrics.ts` bleiben unangetastet im Repo (keine Löschung) — sie sind nicht mehr von `/dev-status` referenziert, aber stören nicht und sind durch eigene Tests gedeckt.

- [ ] **Step 2: Astro-Build/Typecheck**

Run: `cd website && npx astro check 2>&1 | grep -i "dev-status" || echo "dev-status clean"`
Expected: `dev-status clean`.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/dev-status.astro
git commit -m "feat(factory-floor): wire dev-status to FactoryFloor [T-FACTORY-FLOOR]"
```

---

## Task 11: Asset-Manifest (D1)

**Files:**
- Create: `website/public/factory/MANIFEST.md`

- [ ] **Step 1: Manifest schreiben**

Erstelle `website/public/factory/MANIFEST.md`:

```markdown
# Factory Floor — Asset-Manifest (D1)

Deko-Assets für `/dev-status` (FactoryFloor.svelte). **Graceful:** fehlt eine
Datei, blendet die Komponente das `<img>` per `onerror` aus und der CSS-Platzhalter
greift. Stabile Pfade → Asset-Swap ohne Code-Änderung. `public/` wird beim
Website-Deploy automatisch mitgezogen.

## Palette (mentolder Brass-Gold + Ink)
- Gold: `oklch(0.80 0.09 75)` (`--color-gold` aus `website/src/styles/global.css`)
- Gold-light: `oklch(0.86 0.09 75)` (`--color-gold-light`)
- Ink/Dunkel: `#0b111c` (`--color-dark`), `#101826` (`--color-dark-light`)
- Blockiert/Rot: Tailwind `red-500`
- Hintergrund: **transparent** (Komponente liegt auf `bg-dark`)

## Benötigte Dateien (alle SVG, transparenter Hintergrund)

| Pfad | Zweck | Maße (Richtwert) |
|------|-------|------------------|
| `station-scout.svg`     | Stations-Icon Scout      | 64×64 |
| `station-design.svg`    | Stations-Icon Design     | 64×64 |
| `station-plan.svg`      | Stations-Icon Plan       | 64×64 |
| `station-implement.svg` | Stations-Icon Implement  | 64×64 |
| `station-verify.svg`    | Stations-Icon Verify     | 64×64 |
| `station-deploy.svg`    | Stations-Icon Deploy     | 64×64 |
| `conveyor.svg`          | Fließband-Textur (tilebar) | 320×24 |
| `workpiece-idle.svg`    | Werkstück, wartend       | 32×32 |
| `workpiece-active.svg`  | Werkstück, in Bearbeitung| 32×32 |
| `workpiece-blocked.svg` | Werkstück, blockiert (rot)| 32×32 |
| `workpiece-done.svg`    | Werkstück, fertig        | 32×32 |
| `hall-backdrop.svg`     | (optional) Hallen-Hintergrund | 1280×400 |

## Hinweise für Claude Design
- Icons monochrom in Gold auf transparent (die Komponente setzt den Hintergrund).
- Werkstück-States visuell klar trennbar (Form/Farbe), nicht nur per Farbe (a11y).
- Keine eingebetteten Rasterbilder; reines SVG, < 8 KB pro Datei.
```

- [ ] **Step 2: Commit**

```bash
git add website/public/factory/MANIFEST.md
git commit -m "docs(factory-floor): asset manifest for the hall (D1) [T-FACTORY-FLOOR]"
```

---

## Task 12: Playwright-Smoke (Projekt `website`)

**Files:**
- Create: `tests/e2e/specs/fa-factory-floor.spec.ts`

> Der Smoke prüft Rendering + Detail-Interaktion gegen die Live-/Dev-Umgebung mit Admin-Session (wie die bestehenden `fa-admin-*`-Specs). Er fängt nur Fixture-/Smoke-Fälle ab; die DAL-Logik ist bereits durch Task 4/6 unit-getestet.

- [ ] **Step 1: Smoke-Spec schreiben (Muster wie `tests/e2e/specs/fa-admin-live.spec.ts`)**

Erstelle `tests/e2e/specs/fa-factory-floor.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

// Smoke: /dev-status renders the Fabrikhalle and the detail panel opens on click.
// Runs in the `website` project (uses its stored admin auth state).
test.describe('FactoryFloor /dev-status', () => {
  test('renders the hall sections', async ({ page }) => {
    await page.goto('/dev-status');
    await expect(page.getByTestId('factory-floor')).toBeVisible();
    await expect(page.getByTestId('floor-leitstand')).toBeVisible();
    await expect(page.getByTestId('floor-hall')).toBeVisible();
    await expect(page.getByTestId('floor-shipped')).toBeVisible();
    await expect(page.getByTestId('floor-slots')).toBeVisible();
  });

  test('clicking a workpiece opens the detail panel (when any active ticket exists)', async ({ page }) => {
    await page.goto('/dev-status');
    const workpiece = page.getByTestId('floor-workpiece').first();
    if ((await workpiece.count()) === 0) test.skip(true, 'no active workpiece in the hall');
    await workpiece.click();
    await expect(page.getByTestId('floor-detail')).toBeVisible();
  });
});
```

- [ ] **Step 2: Spec parst (offline check; Live-Run passiert im nightly e2e)**

Run: `cd /tmp/wt-factory-floor-live && npx tsc --noEmit tests/e2e/specs/fa-factory-floor.spec.ts 2>&1 | grep -v "Cannot find module '@playwright" || echo "spec parses"`
Expected: `spec parses` (Modulauflösung von `@playwright/test` außerhalb des e2e-tsconfig wird ignoriert; entscheidend ist syntaktische Korrektheit).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/specs/fa-factory-floor.spec.ts
git commit -m "test(factory-floor): playwright smoke for /dev-status hall [T-FACTORY-FLOOR]"
```

---

## Task 13: Voller Offline-Gate + Freshness

**Files:** keine (Verifikation + generierte Artefakte)

- [ ] **Step 1: Voller Offline-Test-Gate**

Run: `cd /tmp/wt-factory-floor-live && task test:all`
Expected: alle Subtasks PASS (insbesondere `test:factory` mit FA-SF-40 und `test:unit` mit den Vitest-Floor-Tests).

- [ ] **Step 2: Freshness-Artefakte regenerieren (sonst rot in CI)**

Run: `cd /tmp/wt-factory-floor-live && task freshness:regenerate`
Expected: generierte Artefakte (test-inventory.json, route-manifest.json, …) aktualisiert. Die neuen Routen `/api/factory-floor` und `/api/factory-floor/[extId]` sollten im route-manifest erscheinen.

- [ ] **Step 3: Geänderte generierte Artefakte committen (falls vorhanden)**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore(factory-floor): refresh generated artifacts [T-FACTORY-FLOOR]"
```

- [ ] **Step 4: Vitest gezielt grün bestätigen**

Run: `cd website && npx vitest run src/lib/factory-floor.test.ts`
Expected: PASS (8/8).

---

## Self-Review (gegen die Spec)

**Spec-Coverage:**
- A (Live-Phasen) → Tasks 1, 2, 3, 4, 5, 7, 8, 9, 10 (Schema, CLI, DAL, API, Instrumentierung beider Driver, Halle-Frontend).
- B (Blocking-Sichtbarkeit) → `blocked`-Events in `pipeline.js` (Task 7), `blockReason`/`retryCount`/`waitReason` in DAL (Task 3/4), Leitstand-Guards (Kill-Switch/Daily-Cap/Dry-Run/Watchdog-Stale) in `getControl` (Task 3) + Leitstand-Strip (Task 9).
- D1 (Deko-Assets graceful) → graceful `<img onerror>` in `FactoryFloor.svelte` (Task 9) + `MANIFEST.md` (Task 11).
- Non-Goals C + D2 → **bewusst NICHT im Plan** (vertagt).
- Best-effort-Telemetrie → `phaseEvent` swallow (Task 7), `|| true` (Task 8), validate-before-DB (Task 2).
- Detail-Variante → separater `[extId]`-Endpoint (Task 6), wie in den offenen Punkten entschieden.
- Tests → Vitest+pg-mem (Task 4/6), BATS FA-SF-40 (Task 2), Playwright-Smoke (Task 12), in `task test:factory`/`test:all` eingehängt (FA-SF-40 liegt unter `tests/local/FA-SF-*.bats`, das `test:factory` glob-matcht → automatisch eingehängt).

**Placeholder-Scan:** keine TBD/TODO; jeder Code-Step enthält vollständigen Code.

**Typ-Konsistenz:** `FloorPayload`/`HallItem`/`TicketDetail` identisch in DAL (Task 3/6), API (Task 5/6), Frontend (Task 9). Funktionsnamen `getFloor`/`getTicketDetail`/`getControl`/`getHall`/`getLoadingDock`/`getShipped`/`getMetrics` durchgehend gleich. `ticket.sh phase`-Signatur identisch in CLI (Task 2), pipeline.js (Task 7), dev-flow-execute (Task 8).
