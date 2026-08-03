import { pool } from '../website-db';
import type { RollupMetrics, HealthStatus } from './cockpit-types';
import { dorScore, DOR_KEYS, type Readiness } from '../planning-office';
import { isLastenheftLocked } from './lastenheft';

export interface ContainerRollup extends RollupMetrics {
  health: HealthStatus;
}

export async function getContainerRollup(
  brand: string, containerId: string,
): Promise<ContainerRollup | null> {
  const { rows } = await pool.query(
    `SELECT r.total_leaves, r.done_leaves, r.blocked_leaves,
            r.in_progress_leaves, r.awaiting_deploy_leaves, r.open_leaves,
            r.pct_done, r.health
       FROM tickets.tickets t
       JOIN tickets.v_cockpit_rollup r ON r.container_id = t.id
      WHERE t.id = $1 AND t.brand = $2 AND t.type IN ('project','feature')`,
    [containerId, brand],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    total: Number(r.total_leaves ?? 0),
    done: Number(r.done_leaves ?? 0),
    blocked: Number(r.blocked_leaves ?? 0),
    inProgress: Number(r.in_progress_leaves ?? 0),
    awaitingDeploy: Number(r.awaiting_deploy_leaves ?? 0),
    open: Number(r.open_leaves ?? 0),
    pctDone: Number(r.pct_done ?? 0),
    health: (r.health ?? 'amber') as HealthStatus,
  };
}

export interface TicketPlan {
  id: number;
  slug: string;
  branch: string | null;
  prNumber: number | null;
  content: string;
  archivedAt: Date | null;
}

export async function getTicketPlan(
  brand: string, ticketId: string,
): Promise<TicketPlan | null> {
  const { rows } = await pool.query(
    `SELECT p.id, p.slug, p.branch, p.pr_number, p.content, p.archived_at
       FROM tickets.ticket_plans p
       JOIN tickets.tickets t ON t.id = p.ticket_id AND t.brand = $2
      WHERE p.ticket_id = $1
      ORDER BY p.archived_at DESC, p.id DESC
      LIMIT 1`,
    [ticketId, brand],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    slug: String(r.slug),
    branch: r.branch ?? null,
    prNumber: r.pr_number != null ? Number(r.pr_number) : null,
    content: String(r.content),
    archivedAt: r.archived_at,
  };
}

export interface ContainerDor {
  valueProp: string | null;
  effort: string | null;
  areas: string[];
  dependsOn: string[];
  readiness: Readiness;
  dorScore: number;
  requirementsList: string[];
  lastenheftLocked: boolean;
}

export async function getContainerDor(
  brand: string, containerId: string,
): Promise<ContainerDor | null> {
  const { rows } = await pool.query(
    `SELECT value_prop, effort, areas, depends_on, readiness, requirements_list
       FROM tickets.tickets
      WHERE id = $1 AND brand = $2 AND type IN ('project','feature')`,
    [containerId, brand],
  );
  const r = rows[0];
  if (!r) return null;
  const readiness: Readiness = r.readiness ?? {};
  return {
    valueProp: r.value_prop ?? null,
    effort: r.effort ?? null,
    areas: r.areas ?? [],
    dependsOn: r.depends_on ?? [],
    readiness,
    dorScore: dorScore(readiness),
    requirementsList: r.requirements_list ?? [],
    lastenheftLocked: isLastenheftLocked(readiness as Record<string, unknown>),
  };
}

export { DOR_KEYS };
