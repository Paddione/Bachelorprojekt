# P1 — Backend/Trigger

Rolle: **impl** (Backend/Trigger). Disjunkter Partial des Change `factory-parallel-status`
(T002079). Dieser Partial liefert die pure Ableitungslogik, die beiden Admin-guardeten
Endpoints und die `wakeup.sh`-Konsumtion des Force-Tick-Flags. Test-Abdeckung (vitest gegen
`lib/parallel-status.ts`, bats gegen `wakeup.sh`/`slots.sh`) trägt Partial P3 — hier stehen
bewusst KEINE Failing-Test- oder Verify-Tasks.

Datenfluss (SSOT: `design.md` → „Datenfluss"):

```
GET  /api/factory/parallel-status ─ authGuard ─► pool.query(Aggregat) + read last-tick-at
                                              └─► deriveParallelStatus + deriveNextTickAt ─► JSON
POST /api/factory/force-tick      ─ authGuard ─► writeControl('force-tick-requested', ISO now)
wakeup.sh (nächster Cron-Poll)    ─ read+clear 'force-tick-requested' ... tick ... write 'last-tick-at'
```

Realer psql-Helper der Factory-Skripte: `factory_psql` (liest SQL von stdin, forwardet
`-v key=val`) aus `scripts/factory/lib.sh:40-44`, aktiviert nach `source lib.sh; factory_resolve`.
Reale writeControl-Signatur (exportiert): `writeControl(key, value, setBy='admin-ui')` in
`website/src/lib/factory-floor.ts:79-86`. `readControl` dort ist modul-privat → parallel-status.ts
nutzt eine **eigene** read-Query, koppelt `factory-floor.ts` NICHT.

---

## File `website/src/lib/parallel-status.ts` (net-new)

- Sprache: TypeScript · S1-Limit 500 · Baseline: keine (net-new) · **Budget 500** (komfortabel).
- Pure, DB-freies Modul. Kein Import auf `website-db`/`db-pool`/Astro (S2: keine Zyklen,
  keine Rück-Kopplung auf DB-/API-Schichten). Zeit wird als Argument übergeben (kein `Date.now`
  im Kern), damit P3-vitest deterministisch ohne Zeit-Mocking testen kann.
- CQ02: vollständig typisiert, kein `: any`, kein `as any`.

### Task P1.1 — Pure Ableitungslogik schreiben

- [ ] Lege `website/src/lib/parallel-status.ts` an mit exakt diesen Exports:

```ts
// website/src/lib/parallel-status.ts
// Pure, DB-free derivation logic for the factory parallel-status panel.
// Time is passed in as an argument — no Date.now() in the core so the
// derivations stay deterministic and unit-testable (P3 vitest).

/** Raw aggregate row over tickets.tickets (already ::int-cast in SQL). */
export interface ParallelStatusRow {
  gang_tickets: number;
  slots_claimed: number;
}

/** Shape returned by GET /api/factory/parallel-status. */
export interface ParallelStatus {
  gangTickets: number;
  slotsClaimed: number;
  slotsPerBrand: number;
  nextTickAt: string | null;
}

/** Map the raw aggregate row + config into the wire-shape (minus nextTickAt). */
export function deriveParallelStatus(
  row: ParallelStatusRow | undefined,
  slotsPerBrand: number,
): Omit<ParallelStatus, 'nextTickAt'> {
  return {
    gangTickets: Number(row?.gang_tickets ?? 0),
    slotsClaimed: Number(row?.slots_claimed ?? 0),
    slotsPerBrand,
  };
}

/**
 * Next scheduled tick timestamp (ISO). If lastTickAt is missing/unparseable,
 * fall back to now + intervalSec. `now` is injected for testability.
 */
export function deriveNextTickAt(
  lastTickAt: string | null,
  intervalSec: number,
  now: Date,
): string {
  const base = lastTickAt ? new Date(lastTickAt) : null;
  const anchorMs = base && !Number.isNaN(base.getTime()) ? base.getTime() : now.getTime();
  return new Date(anchorMs + intervalSec * 1000).toISOString();
}

/**
 * Remaining seconds until nextTickAt relative to `now`. Clamped so a due/overdue
 * tick yields <= 0 (UI renders "Tick fällig" + auto-refetch at 0). `now` injected.
 */
export function remainingSeconds(nextTickAt: string | null, now: Date): number {
  if (!nextTickAt) return 0;
  const target = new Date(nextTickAt);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.floor((target.getTime() - now.getTime()) / 1000);
}
```

- [ ] Selbst-Check (P1-lokal, kein STRUCT-Step): `pnpm --dir website exec tsc --noEmit`
      muss für die neue Datei fehlerfrei sein (kein `any`, alle Exports typisiert).
      Die eigentliche Test-Abdeckung liefert P3 (`website/src/lib/parallel-status.test.ts`).

---

## File `website/src/pages/api/factory/parallel-status.ts` (net-new)

- Sprache: TypeScript · S1-Limit 500 · Baseline: keine (net-new) · **Budget 500** (komfortabel).
- Verzeichnis `website/src/pages/api/factory/` existiert noch nicht → wird mit dieser Datei
  angelegt (S4: als Astro-Page automatisch geroutet, kein Orphan).
- Import-Tiefe ab `api/factory/`: **drei** Ebenen hoch zu `src/`, dann `lib/`
  (`'../../../lib/...'`). authGuard/Response-Muster wortwörtlich aus
  `website/src/pages/api/admin/factory-control.ts:68-102`.

### Task P1.2 — GET /api/factory/parallel-status implementieren

- [ ] Lege `website/src/pages/api/factory/parallel-status.ts` an:

```ts
// website/src/pages/api/factory/parallel-status.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { pool } from '../../../lib/website-db';
import {
  deriveParallelStatus,
  deriveNextTickAt,
  type ParallelStatusRow,
} from '../../../lib/parallel-status';

export const prerender = false;

function authGuard(session: Awaited<ReturnType<typeof getSession>>): Response | null {
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;

  const slotsPerBrand = parseInt(process.env.FACTORY_SLOTS_PER_BRAND ?? '3', 10) || 3;
  const intervalSec = parseInt(process.env.FACTORY_TICK_INTERVAL_SEC ?? '300', 10) || 300;

  try {
    // Gang-Zustand: eine read-only Aggregatzeile (Muster aus scripts/factory/slots.sh:23).
    // ::int casts so pg returns numbers (bigint would arrive as string).
    const agg = await pool.query<ParallelStatusRow>(
      `SELECT
         COUNT(*) FILTER (
           WHERE slot_count > 1 AND pipeline_slot IS NOT NULL AND status = 'in_progress'
         )::int AS gang_tickets,
         COALESCE(SUM(slot_count) FILTER (
           WHERE pipeline_slot IS NOT NULL AND status = 'in_progress'
         ), 0)::int AS slots_claimed
       FROM tickets.tickets`,
    );

    // Eigene read-Query (readControl in factory-floor.ts ist modul-privat).
    const ctl = await pool.query<{ value: string }>(
      `SELECT value FROM tickets.factory_control WHERE key = $1 AND brand IS NULL LIMIT 1`,
      ['last-tick-at'],
    );
    const lastTickAt = ctl.rows[0]?.value ?? null;

    const status = {
      ...deriveParallelStatus(agg.rows[0], slotsPerBrand),
      nextTickAt: deriveNextTickAt(lastTickAt, intervalSec, new Date()),
    };

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/factory/parallel-status] GET error:');
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] Response-Kontrakt (Intel `api_contracts`): `{ gangTickets: number, slotsClaimed:
      number, slotsPerBrand: number, nextTickAt: string|null }`. `nextTickAt` ist hier immer
      ein String (deriveNextTickAt fällt nie auf null zurück); der `| null` im Typ bleibt für
      den vom Consumer (P2) tolerierten Grenzfall.

---

## File `website/src/pages/api/factory/force-tick.ts` (net-new)

- Sprache: TypeScript · S1-Limit 500 · Baseline: keine (net-new) · **Budget 500** (komfortabel).
- Nutzt das exportierte `writeControl` aus `factory-floor.ts` (nicht die private readControl).
- Idempotent: mehrfaches Drücken überschreibt nur den Timestamp (design.md → Fehlerbehandlung).

### Task P1.3 — POST /api/factory/force-tick implementieren

- [ ] Lege `website/src/pages/api/factory/force-tick.ts` an:

```ts
// website/src/pages/api/factory/force-tick.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { writeControl } from '../../../lib/factory-floor';

export const prerender = false;

function authGuard(session: Awaited<ReturnType<typeof getSession>>): Response | null {
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;

  const requestedAt = new Date().toISOString();
  try {
    // Global (brand IS NULL) control flag; wakeup.sh reads + clears it next tick.
    await writeControl('force-tick-requested', requestedAt, session!.preferred_username);
    return new Response(JSON.stringify({ ok: true, requestedAt }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/factory/force-tick] POST error:');
    return new Response(JSON.stringify({ error: 'force_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] Response-Kontrakt (Intel `api_contracts`): `{ ok: true, requestedAt: string }`.

---

## File `scripts/factory/wakeup.sh` (edit)

- Sprache: bash · S1-Limit 500 · Ist-LOC **195** · Baseline: keine · **Budget 305**
  (der Diff fügt ~24 Zeilen hinzu → neue LOC ~219, weit unter der wirksamen Schwelle).
- Flag-Handling ist **best-effort** (jede Zeile mit `|| true` bzw. in einer Subshell mit
  `set +e`): es darf einen Tick NIEMALS fail-closed abbrechen (wakeup.sh ist „deliberately
  dumb", Header §1). Das Skript sourcet `lib.sh` NICHT global (würde `set -euo pipefail`-Semantik
  und `factory_resolve`s `exit 2` in den Hauptfluss ziehen) — stattdessen kapselt ein Helper
  das Source + `factory_psql` in einer Subshell.
- Die Control-Keys sind global (`brand IS NULL`), liegen aber physisch in **je einer** Brand-DB
  (`workspace` / `workspace-korczewski`). Analog zu den bestehenden `for _brand in mentolder
  korczewski`-Schleifen im Tick (z.B. Z129, Z136, Z142) werden Read/Clear und der last-tick-at-
  Write über **beide** Brands iteriert, damit ein Force-Request aus einem der beiden Admin-Panels
  greift und beide Panels danach eine frische `nextTickAt`-Berechnung sehen.

### Task P1.4 — Control-psql-Helper + Force-Tick-Read/Clear beim Tick-Start

- [ ] Füge **direkt nach Zeile 58** (dem Start-Post `AGENT_MSG_LABEL=factory … "factory-tick:
      starting …"`) und **vor dem git-crypt-Block Zeile 60** (`# ── git-crypt: …`) folgenden
      Block ein. Der Helper wird auch von Task P1.5 wiederverwendet.

```bash
# ── factory_control helper (best-effort, per brand) ───────────────────────────
# Runs factory_psql for BRAND=$1 in a subshell so lib.sh's `set -euo pipefail`
# and factory_resolve's `exit 2` can never abort this tick. SQL on stdin, extra
# args forwarded (mirrors factory_psql). Stdout is the query result (may be empty).
_control_psql() {
  local brand="$1"; shift
  ( set +e; BRAND="$brand" source "${REPO}/scripts/factory/lib.sh"; factory_resolve; \
    factory_psql "$@" ) 2>/dev/null || true
}

# ── Force-Tick flag: read + clear (both brands) ───────────────────────────────
# The admin "Force next tick" button writes factory_control.force-tick-requested
# (brand IS NULL). We log if present and delete it so it is consumed exactly once.
for _ft_brand in mentolder korczewski; do
  _forced="$(printf '%s' \
    "SELECT value FROM tickets.factory_control WHERE key='force-tick-requested' AND brand IS NULL LIMIT 1;" \
    | _control_psql "$_ft_brand")"
  if [[ -n "${_forced}" ]]; then
    echo "wakeup.sh: forced tick requested (${_ft_brand} @ ${_forced}) — consuming flag" >&2
    printf '%s' \
      "DELETE FROM tickets.factory_control WHERE key='force-tick-requested' AND brand IS NULL;" \
      | _control_psql "$_ft_brand" >/dev/null
  fi
done
```

- [ ] Begründung Platzierung: Der Force-Tick-Request ist ein Einmal-Trigger, der den Poll
      vorzieht — er wird **einmal pro wakeup-Aufruf** vor der idle-retick-Schleife (`while true`
      ab Z93) konsumiert, nicht pro Schleifendurchlauf. Deshalb vor der Schleife, nach dem
      Start-Post.

### Task P1.5 — last-tick-at am Tick-Ende schreiben

- [ ] Füge **direkt nach Zeile 194** (dem `done` der idle-retick-Schleife `while true; do … done`,
      Zeile 194 ist das abschließende `done`) und **vor Zeile 195** (dem Done-Post
      `AGENT_MSG_LABEL=factory … "factory-tick: done"`) folgenden Block ein:

```bash
# ── record last-tick-at (both brands, best-effort) ────────────────────────────
# parallel-status.ts derives nextTickAt = last-tick-at + FACTORY_TICK_INTERVAL_SEC.
# Written after the loop so it reflects the moment this wakeup finished its work.
_last_tick_at="$(date -u +%FT%TZ)"
for _lt_brand in mentolder korczewski; do
  printf '%s' \
    "INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
       VALUES ('last-tick-at', NULL, :'ts', 'wakeup.sh', now())
     ON CONFLICT (key, brand) DO UPDATE SET value = :'ts', set_by = 'wakeup.sh', updated_at = now();" \
    | _control_psql "$_lt_brand" -v ts="${_last_tick_at}" >/dev/null
done
```

- [ ] Der `INSERT … ON CONFLICT (key, brand) DO UPDATE`-Upsert spiegelt exakt das
      writeControl-Muster aus `factory-floor.ts:81-85` (gleiche Unique-Constraint `(key, brand)`).
      `:'ts'` ist ein via `-v ts=…` gebundener psql-Parameter (kein SQL-Interpolieren) — dieselbe
      Technik wie `slots.sh:30` (`-v ext_id=…`).

---

## Scope-Grenzen (nicht in P1)

- Kein UI-Code (`DevStatusTabs.svelte`, `admin/pipeline.astro`) — Partial P2.
- Keine Tests (`parallel-status.test.ts`, `software-factory.bats`) und keine STRUCT2/STRUCT3-
  Verify-Tasks — Partial P3 bzw. der `tasks.md`-Index (vom Orchestrator geschrieben).
- Kein Cron-Interval-Management, kein SSE/Websocket-Push, keine Slot-Historie (design.md → YAGNI).
