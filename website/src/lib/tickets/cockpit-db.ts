import { pool } from '../website-db';
import type {
  PortfolioPayload, ProductNode, FeatureNode,
  FeatureTickets, TicketRow, RollupMetrics, HealthStatus,
  BatchMutation, BatchResult, OpenSpecProposal,
} from './cockpit-types';
import openspecStatusMap from '../../data/openspec-status.json';
import { ALL_TICKETS_ID, NO_FEATURE_ID, NO_PRODUCT_ID } from './cockpit-ids';

function toRollup(r: Record<string, unknown> | undefined): RollupMetrics {
  return {
    total: Number(r?.total_leaves ?? 0),
    done: Number(r?.done_leaves ?? 0),
    blocked: Number(r?.blocked_leaves ?? 0),
    inProgress: Number(r?.in_progress_leaves ?? 0),
    awaitingDeploy: Number(r?.awaiting_deploy_leaves ?? 0),
    open: Number(r?.open_leaves ?? 0),
    pctDone: Number(r?.pct_done ?? 0),
  };
}

export const PORTFOLIO_MAX_ROWS = 1000;

// Synthetic aggregate buckets surface task/bug *leaves* that the feature-centric
// cockpit would otherwise hide:
//   - ALL_TICKETS_ID ("Alle Tickets"): every leaf of the brand, regardless of
//     feature linkage — the flat "see all my tickets" view (T000877 follow-up).
//   - NO_FEATURE_ID  ("Ohne Feature"): parentless leaves only (T000848); a
//     subset of Alle Tickets, surfaced only when it is a genuine subset.


function rollupHealth(r: RollupMetrics): HealthStatus {
  if (r.blocked > 0) return 'red';
  if (r.total > 0 && r.pctDone === 100) return 'green';
  return 'amber';
}

// Rollup over brand-scoped task/bug leaves. Bucket logic mirrors
// tickets.v_cockpit_rollup (archived excluded; qa_review counts as in-progress)
// so the synthetic bucket reads consistently with real features. When
// `orphanOnly` is set the rollup is restricted to parentless leaves.
async function fetchLeafRollup(brand: string, orphanOnly: boolean): Promise<RollupMetrics> {
  const { rows } = await pool.query(
    `SELECT
       SUM(CASE WHEN status <> 'archived' THEN 1 ELSE 0 END) AS total_leaves,
       SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_leaves,
       SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked_leaves,
       SUM(CASE WHEN status IN ('in_progress','in_review','qa_review') THEN 1 ELSE 0 END) AS in_progress_leaves,
       SUM(CASE WHEN status = 'awaiting_deploy' THEN 1 ELSE 0 END) AS awaiting_deploy_leaves,
       SUM(CASE WHEN status IN ('triage','backlog','planning','plan_staged') THEN 1 ELSE 0 END) AS open_leaves
     FROM tickets.tickets
     WHERE brand = $1 AND type IN ('task', 'bug')${orphanOnly ? ' AND parent_id IS NULL' : ''}`,
    [brand],
  );
  const r = rows[0] ?? {};
  const total = Number(r.total_leaves ?? 0);
  const done = Number(r.done_leaves ?? 0);
  return {
    total, done,
    blocked: Number(r.blocked_leaves ?? 0),
    inProgress: Number(r.in_progress_leaves ?? 0),
    awaitingDeploy: Number(r.awaiting_deploy_leaves ?? 0),
    open: Number(r.open_leaves ?? 0),
    pctDone: total ? Math.round((100 * done) / total) : 0,
  };
}

function syntheticBucket(id: string, title: string, rollup: RollupMetrics): FeatureNode {
  return {
    id, extId: id, title,
    priority: 'mittel', health: rollupHealth(rollup), rollup,
    nextStep: false, discarded: false, majorFeature: false, synthetic: true,
  };
}

// Load the leaves for a synthetic bucket. `orphanOnly` selects the "Ohne Feature"
// semantics; otherwise it is the full "Alle Tickets" list across every feature.
async function getLeafTickets(
  brand: string, id: string, title: string, orphanOnly: boolean,
): Promise<FeatureTickets> {
  const feature = syntheticBucket(id, title, await fetchLeafRollup(brand, orphanOnly));
  const tr = await pool.query(
    `SELECT t.id, t.external_id, t.type, t.title, t.status, t.priority,
            t.parent_id, t.planning_rank
       FROM tickets.tickets t
      WHERE t.brand = $1 AND t.type IN ('task', 'bug')
        AND t.status <> 'archived'${orphanOnly ? ' AND t.parent_id IS NULL' : ''}
      ORDER BY COALESCE(t.planning_rank, 2147483647), t.external_id
      LIMIT $2`,
    [brand, PORTFOLIO_MAX_ROWS],
  );
  const tickets: TicketRow[] = tr.rows.map((t: Record<string, unknown>) => ({
    id: String(t.id), extId: String(t.external_id), title: String(t.title),
    status: String(t.status), priority: String(t.priority), type: String(t.type),
    parentId: t.parent_id ? String(t.parent_id) : undefined,
    planningRank: t.planning_rank != null ? Number(t.planning_rank) : undefined,
  }));
  return { feature, tickets: mergeOpenSpec(tickets) };
}

export async function getPortfolio(brand: string): Promise<PortfolioPayload> {
  const { rows } = await pool.query(
    `SELECT t.id, t.external_id, t.type, t.title, t.value_prop, t.priority,
            t.parent_id, t.planning_rank,
            t.next_step, t.discarded, t.major_feature, t.suggestion_comment,
            r.total_leaves, r.done_leaves, r.blocked_leaves,
            r.in_progress_leaves, r.open_leaves, r.pct_done, r.health
       FROM tickets.tickets t
       LEFT JOIN tickets.v_cockpit_rollup r ON r.container_id = t.id
      WHERE t.brand = $1 AND t.type IN ('project', 'feature')
      ORDER BY COALESCE(t.planning_rank, 2147483647), t.created_at
      LIMIT $2`,
    [brand, PORTFOLIO_MAX_ROWS],
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
      nextStep: Boolean(row.next_step),
      discarded: Boolean(row.discarded),
      majorFeature: Boolean(row.major_feature),
      suggestionComment: row.suggestion_comment ?? undefined,
    };
    const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
    if (parent) parent.features.push(feature);
    else looseFeatures.push(feature);
  }

  if (looseFeatures.length > 0) {
    products.push({
      id: NO_PRODUCT_ID, extId: NO_PRODUCT_ID, title: 'Ohne Produkt',
      rollup: aggregate(looseFeatures), features: looseFeatures,
    });
  }

  // Surface parentless task/bug leaves under a synthetic "Ohne Feature" bucket
  // (T000848). Only shown when it is a genuine SUBSET of "Alle Tickets" — when
  // every leaf is parentless the two buckets are identical, so it is dropped to
  // avoid a confusing duplicate.
  const orphanRollup = await fetchLeafRollup(brand, true);
  const allRollup = await fetchLeafRollup(brand, false);
  if (orphanRollup.total > 0 && orphanRollup.total < allRollup.total) {
    products.push({
      id: NO_FEATURE_ID, extId: NO_FEATURE_ID, title: 'Ohne Feature',
      rollup: orphanRollup, features: [syntheticBucket(NO_FEATURE_ID, 'Ohne Feature', orphanRollup)],
    });
  }

  // Prepend the flat "Alle Tickets" bucket: every task/bug leaf of the brand,
  // regardless of feature linkage. This is the PM's primary entry point and the
  // cockpit's default landing — when no ticket is nested under a feature
  // (mentolder), it is the only place work is visible at all. (T000877)
  if (allRollup.total > 0) {
    products.unshift({
      id: ALL_TICKETS_ID, extId: ALL_TICKETS_ID, title: 'Alle Tickets',
      rollup: allRollup, features: [syntheticBucket(ALL_TICKETS_ID, 'Alle Tickets', allRollup)],
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

/** Attach openspecProposals from the static JSON map onto ticket rows.
 *  Pure — mutates `tickets` in place and returns the same array. */
function mergeOpenSpec(tickets: TicketRow[]): TicketRow[] {
  const map = openspecStatusMap as Record<string, Array<{ slug: string; status: string }>>;
  for (const t of tickets) {
    const entries = map[t.extId];
    if (entries && entries.length > 0) {
      t.openspecProposals = entries as OpenSpecProposal[];
    }
  }
  return tickets;
}

export class NotFoundError extends Error {}

export async function getFeatureTickets(brand: string, extId: string): Promise<FeatureTickets> {
  if (extId === ALL_TICKETS_ID) return getLeafTickets(brand, ALL_TICKETS_ID, 'Alle Tickets', false);
  if (extId === NO_FEATURE_ID) return getLeafTickets(brand, NO_FEATURE_ID, 'Ohne Feature', true);
  const fr = await pool.query(
    `SELECT t.id, t.external_id, t.type, t.title, t.value_prop, t.priority,
            t.next_step, t.discarded, t.major_feature, t.suggestion_comment,
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
    nextStep: Boolean(f.next_step), discarded: Boolean(f.discarded),
    majorFeature: Boolean(f.major_feature),
    suggestionComment: f.suggestion_comment ?? undefined,
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
  return { feature, tickets: mergeOpenSpec(tickets) };
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
  if (mutation.enqueue === true) {
    throw new Error('enqueue_not_implemented: Factory enqueue via batch is not yet supported');
  }
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

export async function setFeatureAction(
  brand: string,
  featureId: string,
  action: string,
  value?: boolean | string,
): Promise<{ ok: true }> {
  await assertSameBrand(brand, [featureId]);
  let column: string;
  let newValue: unknown;
  if (action === 'next_step') {
    column = 'next_step'; newValue = value ?? true;
  } else if (action === 'discard') {
    column = 'discarded'; newValue = value ?? true;
  } else if (action === 'major') {
    column = 'major_feature'; newValue = value ?? true;
  } else if (action === 'comment') {
    column = 'suggestion_comment'; newValue = value ?? '';
  } else {
    throw new Error(`unknown action: ${action}`);
  }
  await pool.query(
    `UPDATE tickets.tickets SET ${column} = $1, updated_at = now()
      WHERE id = $2 AND brand = $3`,
    [newValue, featureId, brand],
  );
  await audit(featureId, column, newValue);
  return { ok: true };
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
