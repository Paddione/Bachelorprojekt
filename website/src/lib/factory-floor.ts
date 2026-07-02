// Software Factory Live-Floor (T-FACTORY-FLOOR) — read-only aggregation DAL.
// Reads tickets.factory_phase_events (current phase per ticket) joined with the
// existing tickets/factory_control tables. PER-BRAND pool, same-namespace only.
// factory-metrics.ts is intentionally left untouched; this is a separate module.
import { pool } from './website-db';
import { officeCount } from './planning-office';
import { mapShippedRow, mapAwaitingRow, isAwaitingDeployLaneVisible } from './factory-floor-lanes';
import type { ShippedItem, AwaitingDeployItem } from './factory-floor-lanes';
export type { ShippedItem, AwaitingDeployItem } from './factory-floor-lanes';


import {
  PHASE_ORDER,
  type Phase,
  type PhaseState,
  type PhaseSegmentState,
  type PhaseProgressSegment,
  phaseProgress,
  type AttentionPayload,
  buildAttention,
  type TimelineEntry,
  phaseDurations,
  type ControlSnapshot,
  type FloorMetrics,
  type PlanningCount,
  type LoadingDockItem,
  type HallItem,
  type StagedItem,
  type ProviderStatus,
  type FloorPayload,
  type PhaseEventRow,
  type Breadcrumb,
  type InjectionKind,
  type InjectionRow,
  type InjectInput,
  type SuggestedFile,
  type TicketDetail,
  parsePrNumber,
  parsePlanRef,
  mapInjection
} from './factory-floor-filters';

export {
  PHASE_ORDER,
  type Phase,
  type PhaseState,
  type PhaseSegmentState,
  type PhaseProgressSegment,
  phaseProgress,
  type AttentionPayload,
  buildAttention,
  type TimelineEntry,
  phaseDurations,
  type ControlSnapshot,
  type FloorMetrics,
  type PlanningCount,
  type LoadingDockItem,
  type HallItem,
  type StagedItem,
  type ProviderStatus,
  type FloorPayload,
  type PhaseEventRow,
  type Breadcrumb,
  type InjectionKind,
  type InjectionRow,
  type InjectInput,
  type SuggestedFile,
  type TicketDetail,
};

// Ordered pipeline-lane SSOT lives in ./tickets/pipeline-order (pure module, no DB
// import). Re-exported here so existing consumers keep importing from factory-floor.
export {
  ALL_TICKET_STATUSES,
  PIPELINE_LANES,
  STATUS_BUCKETS,
} from './tickets/pipeline-order';

export async function writeControl(key: string, value: string, setBy = 'admin-ui'): Promise<void> {
  await pool.query(
    `INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
     VALUES ($1, NULL, $2, $3, now())
     ON CONFLICT (key, brand) DO UPDATE SET value = $2, set_by = $3, updated_at = now()`,
    [key, value, setBy],
  );
}

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
    // A slot only counts as occupied while the ticket is actively running. Terminal
    // tickets (done/archived) can retain a stale pipeline_slot — exclude them so the
    // Leitstand never shows e.g. "8/3" from leaked slots. Mirrors slots.sh's status gate.
    pool.query(
      `SELECT COUNT(*)::int AS n FROM tickets.tickets
        WHERE pipeline_slot IS NOT NULL AND status IN ('in_progress','in_review')`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM tickets.tickets
        WHERE pipeline_slot IS NOT NULL AND status IN ('in_progress','in_review')
          AND updated_at < now() - INTERVAL '20 minutes'`,
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
  const r = await pool.query<{ external_id: string; title: string; priority: string; retry_count: number | null }>(
    `SELECT external_id, title, priority, retry_count
       FROM tickets.tickets
      WHERE type = 'feature' AND status = 'backlog' AND pipeline_slot IS NULL
      ORDER BY CASE priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 WHEN 'niedrig' THEN 3 END,
               created_at`,
  );
  const slotsFull = slotsUsed >= slotsCap;
  return r.rows.map((row) => ({
    extId: row.external_id,
    title: row.title,
    priority: row.priority,
    waitReason:
      (row.retry_count ?? 0) >= 2 ? 'retry erschöpft' : slotsFull ? 'Slot voll' : 'wartet auf Dispatch',
  }));
}

/** Active features (in a slot) joined with their latest phase event. */
export async function getHall(): Promise<HallItem[]> {
  // latest phase event per ticket via DISTINCT ON, then LEFT JOIN. A ticket
  // qualifies for the Hall if it holds a pipeline_slot (Factory) OR if it has
  // at least one driver='devflow' phase event (dev-flow-execute run, no slot).
  const r = await pool.query<{
    external_id: string; title: string; priority: string;
    pipeline_slot: number | null; retry_count: number | null;
    phase: Phase | null; state: PhaseState | null; detail: string | null;
    driver: 'factory' | 'devflow' | null; at: string | null;
  }>(
    `SELECT t.external_id, t.title, t.priority, t.pipeline_slot, t.retry_count,
            e.phase, e.state, e.detail, e.driver, e.at
       FROM tickets.tickets t
       LEFT JOIN (
         SELECT DISTINCT ON (ticket_id) ticket_id, phase, state, detail, driver, at
           FROM tickets.factory_phase_events
          ORDER BY ticket_id, at DESC
       ) e ON e.ticket_id = t.id
       LEFT JOIN (
         SELECT DISTINCT ticket_id FROM tickets.factory_phase_events WHERE driver = 'devflow'
       ) dv ON dv.ticket_id = t.id
      WHERE t.status IN ('in_progress','in_review')
        AND (t.pipeline_slot IS NOT NULL OR dv.ticket_id IS NOT NULL)
      ORDER BY t.pipeline_slot NULLS LAST, t.external_id`,
  );
  return r.rows.map((row) => ({
    extId: row.external_id,
    title: row.title,
    priority: row.priority,
    phase: row.phase ?? null,
    phaseState: row.state ?? null,
    phaseSince: row.at ? new Date(row.at).toISOString() : null,
    retryCount: row.retry_count ?? 0,
    blockReason: row.state === 'blocked' ? (row.detail ?? 'blockiert') : null,
    slot: row.pipeline_slot ?? null,
    driver: row.driver ?? null,
    prNumber: row.driver === 'devflow' ? parsePrNumber(row.detail) : null,
    ciStatus: null,
    phaseProgress: phaseProgress(row.phase ?? null, row.state ?? null),
  }));
}

/** Recently shipped (done) tickets with PR linkage. */
export async function getShipped(limit = 8): Promise<ShippedItem[]> {
  // Latest 'pr' link per ticket via DISTINCT ON + LEFT JOIN (pg-mem cannot run
  // a correlated scalar subquery referencing the outer alias t.id). LIMIT is cast
  // to int so a string-bound param works under both pg-mem and real Postgres.
  // The nested subquery is constrained to done tickets to avoid unbounded scans.
  const r = await pool.query<{ external_id: string; title: string; done_at: string | null; pr_number: number | null }>(
    `SELECT t.external_id, t.title, t.done_at, l.pr_number
       FROM tickets.tickets t
       LEFT JOIN (
         SELECT DISTINCT ON (from_id) from_id, pr_number
           FROM tickets.ticket_links
          WHERE kind = 'pr' AND pr_number IS NOT NULL
            AND from_id IN (
              SELECT id FROM tickets.tickets WHERE status = 'done'
            )
          ORDER BY from_id, created_at DESC
       ) l ON l.from_id = t.id
      WHERE t.status = 'done'
      ORDER BY t.done_at DESC NULLS LAST
      LIMIT $1::int`,
    [limit],
  );
  return r.rows.map((row) => mapShippedRow(row));
}

/** Tickets merged to main but not yet deployed to fleet (the "merge ≠ prod" lane). */
export async function getAwaitingDeploy(limit = 12): Promise<AwaitingDeployItem[]> {
  // Bounded query targeting only awaiting_deploy tickets for performance.
  const r = await pool.query<{ external_id: string; title: string; updated_at: string | null; pr_number: number | null }>(
    `SELECT t.external_id, t.title, t.updated_at, l.pr_number
       FROM tickets.tickets t
       LEFT JOIN (
         SELECT DISTINCT ON (from_id) from_id, pr_number
           FROM tickets.ticket_links
          WHERE kind = 'pr' AND pr_number IS NOT NULL
            AND from_id IN (
              SELECT id FROM tickets.tickets WHERE status = 'awaiting_deploy'
            )
          ORDER BY from_id, created_at DESC
       ) l ON l.from_id = t.id
      WHERE t.status = 'awaiting_deploy'
      ORDER BY t.updated_at DESC NULLS LAST
      LIMIT $1::int`,
    [limit],
  );
  return r.rows.map((row) => mapAwaitingRow(row));
}

/** Plan_staged features (Kommissionierung) with branch/plan parsed from the latest
 *  FACTORY-PLAN-REF comment. Newest first. branch/planPath are null when no ref. */
export async function getStaged(limit = 12): Promise<StagedItem[]> {
  const r = await pool.query<{ external_id: string; title: string; priority: string; created_at: string | null; ref_body: string | null }>(
    `SELECT t.external_id, t.title, t.priority, t.created_at, c.body AS ref_body
       FROM tickets.tickets t
       LEFT JOIN (
         SELECT DISTINCT ON (ticket_id) ticket_id, body
           FROM tickets.ticket_comments
          WHERE body LIKE 'FACTORY-PLAN-REF %'
          ORDER BY ticket_id, created_at DESC
       ) c ON c.ticket_id = t.id
      WHERE t.type = 'feature' AND t.status = 'plan_staged'
      ORDER BY CASE t.priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 WHEN 'niedrig' THEN 3 ELSE 4 END,
               t.created_at DESC
      LIMIT $1::int`,
    [limit],
  );
  return r.rows.map((row) => {
    const { branch, planPath } = parsePlanRef(row.ref_body);
    return {
      extId: row.external_id,
      title: row.title,
      priority: row.priority,
      branch,
      planPath,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    };
  });
}

/** Anzahl planning/plan_staged Tickets; ready = DoR 4/4. */
export async function getPlanningCount(): Promise<PlanningCount> {
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (
         WHERE (readiness->>'spec_skizziert')::bool IS TRUE
           AND (readiness->>'offene_fragen_geklaert')::bool IS TRUE
           AND (readiness->>'abhaengigkeiten_klar')::bool IS TRUE
           AND (readiness->>'aufwand_geschaetzt')::bool IS TRUE
       )::int AS ready
       FROM tickets.tickets
      WHERE status IN ('planning','plan_staged')`,
  );
  return {
    total: r.rows[0]?.total ?? 0,
    ready: r.rows[0]?.ready ?? 0,
  };
}



/** Manuelle Freigabe (Kommissionierung -> Laderampe): flip plan_staged -> backlog.
 *  Idempotent & guarded: nur ein aktuell plan_staged Feature wird verschoben.
 *  Der FACTORY-PLAN-REF-Kommentar besteht bereits (vom Staging) -> nicht erneut schreiben.
 *  Returns true if a row was updated, false otherwise. */
export async function releaseToBacklog(extId: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE tickets.tickets
        SET status = 'backlog', updated_at = now()
      WHERE external_id = $1 AND type = 'feature' AND status = 'plan_staged'`,
    [extId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Deploy eines awaiting_deploy-Tickets abschließen: awaiting_deploy → done.
 *  Setzt resolution='shipped' und done_at. Nur Feature-Tickets mit aktuellem
 *  awaiting_deploy-Status werden akzeptiert. */
export async function deployFromAwaiting(extId: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE tickets.tickets
        SET status = 'done', resolution = 'shipped', done_at = now(), updated_at = now()
      WHERE external_id = $1 AND type = 'feature' AND status = 'awaiting_deploy'`,
    [extId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function getProviderHealth(): Promise<ProviderStatus[]> {
  const { rows } = await pool.query<{
    provider: string; active_agents: number | string; cooldown_until: string | null;
    max_concurrent: number | string; tiers: string[] | null;
  }>(`
    SELECT ph.provider,
           ph.active_agents,
           ph.cooldown_until,
           COALESCE(MAX(pc.max_concurrent), 3) AS max_concurrent,
           COALESCE(array_agg(DISTINCT pc.tier) FILTER (WHERE pc.tier IS NOT NULL), '{}') AS tiers
      FROM tickets.provider_health ph
      LEFT JOIN tickets.provider_config pc ON pc.provider = ph.provider AND pc.enabled = true
     GROUP BY ph.provider, ph.active_agents, ph.cooldown_until
     ORDER BY ph.provider`);
  const now = Date.now();
  return rows.map((r) => ({
    provider: r.provider,
    status: r.cooldown_until && new Date(r.cooldown_until).getTime() > now ? 'cooldown' : 'healthy' as const,
    activeAgents: Number(r.active_agents),
    maxConcurrent: Number(r.max_concurrent),
    cooldownUntil: r.cooldown_until ?? null,
    tiers: r.tiers ?? [],
  }));
}

/** Assemble the full floor payload. slotsCap from FACTORY_GLOBAL_CAP. */
export async function getFloor(slotsCap: number): Promise<FloorPayload> {
  const control = await getControl(slotsCap);
  const [metrics, loadingDock, hall, shipped, awaitingDeploy, staged, officeWaiting, planningCount, providerHealth] = await Promise.all([
    getMetrics(),
    getLoadingDock(control.slotsUsed, control.slotsCap),
    getHall(),
    getShipped(),
    getAwaitingDeploy(),
    getStaged(),
    officeCount(),
    getPlanningCount(),
    getProviderHealth(),
  ]);
  return {
    control, metrics, loadingDock, hall, shipped, awaitingDeploy,
    awaitingDeployVisible: isAwaitingDeployLaneVisible(awaitingDeploy),
    staged, providerHealth,
    officeWaiting, stagedWaiting: staged.length,
    planningCount,
    attention: buildAttention(hall, providerHealth),
    fetchedAt: new Date().toISOString(),
  };
}



/** Full per-ticket detail for the slide-in panel; null if the ext_id is unknown. */
export async function getTicketDetail(extId: string): Promise<TicketDetail | null> {
  const t = await pool.query(
    `SELECT id, external_id, title, status, priority, retry_count, description FROM tickets.tickets WHERE external_id = $1`,
    [extId],
  );
  if (!t.rows.length) return null;
  const row = t.rows[0];
  const [events, breadcrumbs, pr, injections] = await Promise.all([
    pool.query<{ phase: Phase; state: PhaseState; detail: string | null; driver: string; at: string }>(
      `SELECT phase, state, detail, driver, at FROM tickets.factory_phase_events
         WHERE ticket_id = $1 ORDER BY at DESC`,
      [row.id],
    ),
    pool.query<{ author_label: string; body: string; created_at: string }>(
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
    pool.query(
      `SELECT id, phase, kind, title, content, target_files, data_url, nc_path,
               filename, mime_type, injected_by, injected_at, consumed_at
          FROM tickets.ticket_injections
         WHERE ticket_id = $1
         ORDER BY (consumed_at IS NULL) DESC, injected_at DESC LIMIT 20`,
      [row.id],
    ),
  ]);
  let suggested_files: SuggestedFile[] | undefined;
  try {
    const { searchCode } = await import('./codesearch-db');
    const results = await searchCode(row.title, 5);
    suggested_files = results.map(r => ({ path: r.path, score: r.score, snippet: r.snippet }));
  } catch { /* SCS down → no suggested files, ticket detail still works */ }
  return {
    extId: row.external_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    retryCount: row.retry_count ?? 0,
    description: row.description ?? null,
    prNumber: pr.rows[0]?.pr_number ?? null,
    events: events.rows.map((e) => ({
      phase: e.phase, state: e.state, detail: e.detail ?? null, driver: e.driver,
      at: new Date(e.at).toISOString(),
    })),
    breadcrumbs: breadcrumbs.rows.map((b) => ({
      authorLabel: b.author_label, body: b.body, at: new Date(b.created_at).toISOString(),
    })),
    injections: injections.rows.map(mapInjection),
    suggested_files,
  };
}



/** Insert an injection by ticket external_id; no-op (returns null) if the ticket is unknown. */
export async function insertInjection(inp: InjectInput): Promise<InjectionRow | null> {
  const t = await pool.query(`SELECT id FROM tickets.tickets WHERE external_id = $1`, [inp.extId]);
  if (!t.rows.length) return null;
  const r = await pool.query(
    `INSERT INTO tickets.ticket_injections
       (ticket_id, phase, kind, title, content, target_files, data_url, nc_path, filename, mime_type, injected_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, phase, kind, title, content, target_files, data_url, nc_path, filename, mime_type, injected_by, injected_at, consumed_at`,
    [t.rows[0].id, inp.phase ?? null, inp.kind, inp.title ?? null, inp.content ?? null,
     inp.targetFiles ?? null, inp.dataUrl ?? null, inp.ncPath ?? null, inp.filename ?? null,
     inp.mimeType ?? null, inp.injectedBy],
  );
  return mapInjection(r.rows[0]);
}

/** Read-only list of injections (open + recently consumed) for the detail panel. */
export async function getInjections(extId: string, limit = 20): Promise<InjectionRow[]> {
  const r = await pool.query(
    `SELECT i.id, i.phase, i.kind, i.title, i.content, i.target_files, i.data_url, i.nc_path,
            i.filename, i.mime_type, i.injected_by, i.injected_at, i.consumed_at
       FROM tickets.ticket_injections i
       JOIN tickets.tickets t ON t.id = i.ticket_id
      WHERE t.external_id = $1
      ORDER BY (i.consumed_at IS NULL) DESC, i.injected_at DESC
      LIMIT $2::int`,
    [extId, limit],
  );
  return r.rows.map(mapInjection);
}

/** Atomically consume open injections for a phase (or NULL-phase = any boundary). */
export async function consumeInjections(extId: string, phase: Phase): Promise<InjectionRow[]> {
  const r = await pool.query(
    `UPDATE tickets.ticket_injections SET consumed_at = now()
      WHERE consumed_at IS NULL
        AND (phase = $2 OR phase IS NULL)
        AND ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = $1)
      RETURNING id, phase, kind, title, content, target_files, data_url, nc_path, filename, mime_type, injected_by, injected_at, consumed_at`,
    [extId, phase],
  );
  return r.rows.map(mapInjection);
}
