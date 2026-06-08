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
  // latest phase event per ticket via DISTINCT ON, then LEFT JOIN onto the
  // active tickets. Equivalent to a LATERAL top-1 but pg-mem-friendly (it does
  // not resolve correlated LATERAL/scalar subqueries referencing the outer row).
  const r = await pool.query(
    `SELECT t.external_id, t.title, t.priority, t.pipeline_slot, t.retry_count,
            e.phase, e.state, e.detail, e.at
       FROM tickets.tickets t
       LEFT JOIN (
         SELECT DISTINCT ON (ticket_id) ticket_id, phase, state, detail, at
           FROM tickets.factory_phase_events
          ORDER BY ticket_id, at DESC
       ) e ON e.ticket_id = t.id
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
  // Latest 'pr' link per ticket via DISTINCT ON + LEFT JOIN (pg-mem cannot run
  // a correlated scalar subquery referencing the outer alias t.id). LIMIT is cast
  // to int so a string-bound param works under both pg-mem and real Postgres.
  const r = await pool.query(
    `SELECT t.external_id, t.title, t.done_at, l.pr_number
       FROM tickets.tickets t
       LEFT JOIN (
         SELECT DISTINCT ON (from_id) from_id, pr_number
           FROM tickets.ticket_links
          WHERE kind = 'pr' AND pr_number IS NOT NULL
          ORDER BY from_id, created_at DESC
       ) l ON l.from_id = t.id
      WHERE t.status = 'done'
      ORDER BY t.done_at DESC NULLS LAST
      LIMIT $1::int`,
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
