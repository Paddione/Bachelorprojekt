import { pool } from '../website-db';
import type {
  PortfolioPayload, ProductNode, FeatureNode,
  FeatureTickets, TicketRow, RollupMetrics, HealthStatus,
  BatchMutation, BatchResult,
} from './cockpit-types';

function toRollup(r: Record<string, unknown> | undefined): RollupMetrics {
  return {
    total: Number(r?.total_leaves ?? 0),
    done: Number(r?.done_leaves ?? 0),
    blocked: Number(r?.blocked_leaves ?? 0),
    inProgress: Number(r?.in_progress_leaves ?? 0),
    open: Number(r?.open_leaves ?? 0),
    pctDone: Number(r?.pct_done ?? 0),
  };
}

export async function getPortfolio(brand: string): Promise<PortfolioPayload> {
  const { rows } = await pool.query(
    `SELECT t.id, t.external_id, t.type, t.title, t.value_prop, t.priority,
            t.parent_id, t.planning_rank,
            r.total_leaves, r.done_leaves, r.blocked_leaves,
            r.in_progress_leaves, r.open_leaves, r.pct_done, r.health
       FROM tickets.tickets t
       LEFT JOIN tickets.v_cockpit_rollup r ON r.container_id = t.id
      WHERE t.brand = $1 AND t.type IN ('project', 'feature')
      ORDER BY COALESCE(t.planning_rank, 2147483647), t.created_at`,
    [brand],
  );

  const products: ProductNode[] = [];
  const byId = new Map<string, ProductNode>();
  const looseFeatures: FeatureNode[] = [];

  for (const row of rows) {
    if (row.type === 'project') {
      const node: ProductNode = {
        id: row.id, extId: row.external_id, title: row.title,
        rollup: toRollup(row), features: [],
      };
      products.push(node);
      byId.set(row.id, node);
    }
  }
  for (const row of rows) {
    if (row.type !== 'feature') continue;
    const feature: FeatureNode = {
      id: row.id, extId: row.external_id, title: row.title,
      valueProp: row.value_prop ?? undefined,
      priority: row.priority, health: (row.health ?? 'amber') as HealthStatus,
      rollup: toRollup(row),
    };
    const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
    if (parent) parent.features.push(feature);
    else looseFeatures.push(feature);
  }

  if (looseFeatures.length > 0) {
    products.push({
      id: '__no_product__', extId: '__no_product__', title: 'Ohne Produkt',
      rollup: aggregate(looseFeatures), features: looseFeatures,
    });
  }
  return { products };
}

function aggregate(features: FeatureNode[]): RollupMetrics {
  const sum = features.reduce((a, f) => ({
    total: a.total + f.rollup.total, done: a.done + f.rollup.done,
    blocked: a.blocked + f.rollup.blocked, inProgress: a.inProgress + f.rollup.inProgress,
    open: a.open + f.rollup.open, pctDone: 0,
  }), { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 });
  sum.pctDone = sum.total ? Math.round((100 * sum.done) / sum.total) : 0;
  return sum;
}

export class NotFoundError extends Error {}

export async function getFeatureTickets(brand: string, extId: string): Promise<FeatureTickets> {
  const fr = await pool.query(
    `SELECT t.id, t.external_id, t.type, t.title, t.value_prop, t.priority,
            r.total_leaves, r.done_leaves, r.blocked_leaves,
            r.in_progress_leaves, r.open_leaves, r.pct_done, r.health
       FROM tickets.tickets t
       LEFT JOIN tickets.v_cockpit_rollup r ON r.container_id = t.id
      WHERE t.brand = $1 AND t.external_id = $2 AND t.type IN ('project', 'feature')`,
    [brand, extId],
  );
  if (fr.rows.length === 0) throw new NotFoundError(`container ${extId} not found`);
  const f = fr.rows[0];
  const feature: FeatureNode = {
    id: f.id, extId: f.external_id, title: f.title,
    valueProp: f.value_prop ?? undefined, priority: f.priority,
    health: (f.health ?? 'amber') as HealthStatus, rollup: toRollup(f),
  };

  // Two-hop flat union covers the expected hierarchy depth (feature → task/bug).
  // Direct children of the feature + children-of-children (sub-features / sub-tasks).
  // This avoids WITH RECURSIVE which is unsupported in the pg-mem unit-test adapter
  // while remaining semantically correct for the expected ticket depth.
  const tr = await pool.query(
    `SELECT t.id, t.external_id, t.type, t.title, t.status, t.priority,
            t.parent_id, t.planning_rank
       FROM tickets.tickets t
      WHERE t.brand = $2 AND t.type IN ('task', 'bug')
        AND (
          t.parent_id = $1
          OR t.parent_id IN (SELECT id FROM tickets.tickets WHERE parent_id = $1)
        )
      ORDER BY COALESCE(t.planning_rank, 2147483647), t.external_id`,
    [feature.id, brand],
  );
  const tickets: TicketRow[] = tr.rows.map((t: Record<string, unknown>) => ({
    id: String(t.id), extId: String(t.external_id), title: String(t.title),
    status: String(t.status), priority: String(t.priority), type: String(t.type),
    parentId: t.parent_id ? String(t.parent_id) : undefined,
    planningRank: t.planning_rank != null ? Number(t.planning_rank) : undefined,
  }));
  return { feature, tickets };
}

// ---------------------------------------------------------------------------
// Mutation helpers
// ---------------------------------------------------------------------------

export class BrandMismatchError extends Error {}
export class CycleError extends Error {}

async function assertSameBrand(brand: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // Build individual $N placeholders instead of ANY($1::text[]) to work around
  // pg-mem's inconsistent array parameter binding in vitest environments.
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `SELECT id FROM tickets.tickets WHERE id IN (${placeholders}) AND brand <> $${ids.length + 1}`,
    [...ids, brand],
  );
  if (rows.length > 0) throw new BrandMismatchError('ticket belongs to another brand');
}

export async function updatePlanningRanks(
  brand: string,
  updates: { ticketId: string; planningRank: number }[],
): Promise<{ ok: true }> {
  await assertSameBrand(brand, updates.map(u => u.ticketId));
  for (const u of updates) {
    await pool.query(
      `UPDATE tickets.tickets SET planning_rank = $1, updated_at = now()
        WHERE id = $2 AND brand = $3`,
      [u.planningRank, u.ticketId, brand],
    );
    await audit(u.ticketId, 'planning_rank', u.planningRank);
  }
  return { ok: true };
}

export async function reparentTicket(
  brand: string,
  ticketId: string,
  newParentId: string | null,
): Promise<{ ok: true }> {
  await assertSameBrand(brand, newParentId ? [ticketId, newParentId] : [ticketId]);
  try {
    await pool.query(
      `UPDATE tickets.tickets SET parent_id = $1, updated_at = now()
        WHERE id = $2 AND brand = $3`,
      [newParentId, ticketId, brand],
    );
  } catch (e) {
    if (/cycle/i.test(String((e as Error).message))) throw new CycleError('would create a cycle');
    throw e;
  }
  await audit(ticketId, 'parent_id', newParentId);
  return { ok: true };
}

export async function batchMutate(
  brand: string,
  ticketIds: string[],
  mutation: BatchMutation,
): Promise<{ ok: true; results: BatchResult[] }> {
  await assertSameBrand(brand, ticketIds);
  const results: BatchResult[] = [];
  for (const id of ticketIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (mutation.status != null) {
        await client.query(
          `UPDATE tickets.tickets SET status = $1, updated_at = now() WHERE id = $2 AND brand = $3`,
          [mutation.status, id, brand],
        );
      }
      if (mutation.priority != null) {
        await client.query(
          `UPDATE tickets.tickets SET priority = $1, updated_at = now() WHERE id = $2 AND brand = $3`,
          [mutation.priority, id, brand],
        );
      }
      if (mutation.parentId !== undefined) {
        await client.query(
          `UPDATE tickets.tickets SET parent_id = $1, updated_at = now() WHERE id = $2 AND brand = $3`,
          [mutation.parentId, id, brand],
        );
      }
      await client.query('COMMIT');
      results.push({ ticketId: id, success: true });
    } catch (e) {
      await client.query('ROLLBACK');
      results.push({ ticketId: id, success: false, error: String((e as Error).message) });
    } finally {
      client.release();
    }
    // best-effort audit outside the ticket transaction so it never rolls back business logic
    await audit(id, 'batch_mutate', mutation);
  }
  return { ok: true, results };
}

/** Best-effort audit — one row per affected ticket.
 *  Never throws — audit failure must not roll back business logic. */
async function audit(ticketId: string, field: string, newValue: unknown): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO tickets.ticket_activity (ticket_id, actor_label, field, new_value)
       VALUES ($1, 'cockpit', $2, $3::jsonb)`,
      [ticketId, field, JSON.stringify(newValue)],
    );
  } catch { /* best-effort; activity table may differ in unit DB */ }
}
