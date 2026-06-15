// v_cockpit_rollup — leaf-count rollup per container ticket (Produkt/Feature).
// Recursive CTE walks the parent_id tree from every container down to its leaf
// tickets (type 'task'|'bug' with NO children) and aggregates status counts.
// Computed on read (no cache in MVP). Brand filtering is applied by callers,
// not the view, so the view stays a simple per-container aggregate keyed by id.
export const COCKPIT_ROLLUP_VIEW_SQL = `
    CREATE OR REPLACE VIEW tickets.v_cockpit_rollup AS
    WITH RECURSIVE descendants AS (
      -- seed: every ticket is a descendant of itself (depth 0)
      SELECT id AS container_id, id AS node_id, type, status
      FROM tickets.tickets
      UNION ALL
      SELECT d.container_id, c.id AS node_id, c.type, c.status
      FROM descendants d
      JOIN tickets.tickets c ON c.parent_id = d.node_id
    ),
    leaves AS (
      -- a leaf = task|bug with no children of its own; archived leaves are excluded
      -- (archived = cancelled/obsolete; must not count toward feature progress math)
      SELECT d.container_id, d.node_id, d.status
      FROM descendants d
      WHERE d.node_id <> d.container_id
        AND d.type IN ('task', 'bug')
        AND d.status <> 'archived'
        AND NOT EXISTS (
          SELECT 1 FROM tickets.tickets ch WHERE ch.parent_id = d.node_id
        )
    ),
    agg AS (
      SELECT
        container_id,
        COUNT(*)::int AS total_leaves,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done_leaves,
        COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked_leaves,
        COUNT(*) FILTER (WHERE status IN ('in_progress', 'in_review', 'qa_review'))::int AS in_progress_leaves,
        COUNT(*) FILTER (WHERE status IN ('triage', 'backlog', 'planning', 'plan_staged'))::int AS open_leaves
      FROM leaves
      GROUP BY container_id
    )
    SELECT
      c.id AS container_id,
      COALESCE(a.total_leaves, 0)        AS total_leaves,
      COALESCE(a.done_leaves, 0)         AS done_leaves,
      COALESCE(a.blocked_leaves, 0)      AS blocked_leaves,
      COALESCE(a.in_progress_leaves, 0)  AS in_progress_leaves,
      COALESCE(a.open_leaves, 0)         AS open_leaves,
      COALESCE(
        ROUND(100.0 * a.done_leaves / NULLIF(a.total_leaves, 0))::int, 0
      ) AS pct_done,
      CASE
        WHEN COALESCE(a.blocked_leaves, 0) > 0 THEN 'red'
        WHEN COALESCE(a.total_leaves, 0) > 0
             AND ROUND(100.0 * a.done_leaves / NULLIF(a.total_leaves, 0))::int = 100 THEN 'green'
        ELSE 'amber'
      END AS health
    FROM tickets.tickets c
    LEFT JOIN agg a ON a.container_id = c.id
    WHERE c.type IN ('project', 'feature');
`;

export async function ensureCockpitViews(pool: import('pg').Pool): Promise<void> {
  await pool.query(COCKPIT_ROLLUP_VIEW_SQL);
}
