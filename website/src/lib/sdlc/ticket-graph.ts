import { pool } from './website-db';

interface GraphNode {
  id: string;
  title: string;
  status: string;
  priority: string;
  depth: number;
}

interface GraphEdge {
  from: string;
  to: string;
  type: 'depends_on';
}

interface TicketGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  criticalPath: string[];
}

export async function getTicketGraph(): Promise<TicketGraph> {
  const { rows } = await pool.query(`
    WITH RECURSIVE dep_graph AS (
      SELECT id, external_id, title, status, priority, depends_on, 0 AS depth
      FROM tickets.tickets
      WHERE status NOT IN ('done', 'archived')
        AND depends_on IS NOT NULL AND array_length(depends_on, 1) > 0
      UNION ALL
      SELECT t.id, t.external_id, t.title, t.status, t.priority, t.depends_on, dg.depth + 1
      FROM tickets.tickets t
      JOIN dep_graph dg ON t.external_id = ANY(dg.depends_on)
      WHERE dg.depth < 10
    )
    SELECT DISTINCT ON (external_id) external_id, title, status, priority, depth
    FROM dep_graph
    ORDER BY external_id, depth
  `);

  const { rows: allDeps } = await pool.query(`
    SELECT external_id, depends_on
    FROM tickets.tickets
    WHERE depends_on IS NOT NULL AND array_length(depends_on, 1) > 0
  `);

  interface DepGraphRow {
    external_id: string;
    title: string;
    status: string;
    priority: string;
    depth: number;
  }

  const nodeSet = new Set(rows.map((r: DepGraphRow) => r.external_id));
  const nodes: GraphNode[] = rows.map((r: DepGraphRow) => ({
    id: r.external_id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    depth: r.depth,
  }));

  const edges: GraphEdge[] = [];
  for (const r of allDeps) {
    if (!nodeSet.has(r.external_id)) continue;
    for (const dep of r.depends_on) {
      edges.push({ from: r.external_id, to: dep, type: 'depends_on' });
    }
  }

  const criticalPath = computeCriticalPath(nodes, edges);

  return { nodes, edges, criticalPath };
}

function computeCriticalPath(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  const nodeIds = new Set(nodes.map(n => n.id));

  for (const n of nodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
  }

  for (const e of edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    adj.get(e.to)?.push(e.from);
    inDeg.set(e.from, (inDeg.get(e.from) ?? 0) + 1);
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  for (const n of nodes) {
    dist.set(n.id, 1);
    prev.set(n.id, null);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      const newDist = (dist.get(cur) ?? 0) + 1;
      if (newDist > (dist.get(next) ?? 0)) {
        dist.set(next, newDist);
        prev.set(next, cur);
      }
      inDeg.set(next, (inDeg.get(next) ?? 1) - 1);
      if (inDeg.get(next) === 0) queue.push(next);
    }
  }

  let maxNode: string | null = null;
  let maxDist = 0;
  for (const [id, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      maxNode = id;
    }
  }

  if (!maxNode || maxDist <= 1) return [];

  const path: string[] = [];
  let cur: string | null = maxNode;
  while (cur) {
    path.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return path;
}

