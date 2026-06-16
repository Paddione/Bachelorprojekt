// website/src/lib/factory-observability.ts
// Read helpers for the Factory Observability dashboard. Two sources:
//  1) Prometheus HTTP API (server-side proxy) for OTel token/cost/phase metrics.
//  2) The existing ticket phase timeline in Postgres (reused, no new table).
// S2: imports only ./website-db + Node builtins — no API-layer back-imports.
import { pool } from './website-db';

const PROM_BASE =
  process.env.PROMETHEUS_URL ||
  'http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090';

export interface PromMatrix {
  status: string;
  data: { resultType: string; result: Array<{ metric: Record<string, string>; values: [number, string][] }> };
}

export function buildPromQL(panel: string, brand: string): string {
  const b = `brand="${brand.replace(/[^a-z0-9_-]/gi, '')}"`;
  switch (panel) {
    case 'cost':   return `sum by (phase) (increase(claude_code_cost_usage{${b}}[1d]))`;
    case 'tokens': return `sum by (phase) (increase(claude_code_token_usage{${b}}[1d]))`;
    case 'commits':return `sum(increase(claude_code_commit_count{${b}}[1d]))`;
    case 'phase_duration': return `avg by (phase) (factory_phase_duration{${b}})`;
    case 'phase_blocked':  return `sum by (phase) (factory_phase_transition{${b},state="blocked"})`;
    default: return `up`;
  }
}

export async function queryRange(
  query: string, start: number, end: number, step: number,
): Promise<PromMatrix> {
  const u = new URL(`${PROM_BASE}/api/v1/query_range`);
  u.searchParams.set('query', query);
  u.searchParams.set('start', String(start));
  u.searchParams.set('end', String(end));
  u.searchParams.set('step', String(step));
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`prometheus ${res.status}`);
  return (await res.json()) as PromMatrix;
}

export interface PhaseTimelineRow {
  external_id: string; phase: string; state: string; at: string; brand: string;
}

export async function listPhaseTimeline(limit = 200): Promise<PhaseTimelineRow[]> {
  const { rows } = await pool.query(
    `SELECT t.external_id, pe.phase, pe.state, pe.at, t.brand
       FROM tickets.factory_phase_events pe
       JOIN tickets.tickets t ON t.id = pe.ticket_id
      ORDER BY pe.at DESC
      LIMIT $1`,
    [limit],
  );
  return rows as PhaseTimelineRow[];
}
