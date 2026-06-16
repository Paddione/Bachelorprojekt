-- Cockpit Rollup View: leaf-count aggregation per container ticket.
-- Mirrors tickets-db.ts::initTicketsSchema(). Idempotent (CREATE OR REPLACE).
-- MUST be applied to BOTH brand DBs after merge:
--   workspace            (mentolder)
--   workspace-korczewski (korczewski)
CREATE OR REPLACE VIEW tickets.v_cockpit_rollup AS
WITH RECURSIVE descendants AS (
  SELECT id AS container_id, id AS node_id, type, status
  FROM tickets.tickets
  UNION ALL
  SELECT d.container_id, c.id AS node_id, c.type, c.status
  FROM descendants d
  JOIN tickets.tickets c ON c.parent_id = d.node_id
),
leaves AS (
  -- archived leaves excluded: cancelled/obsolete tasks must not affect progress math
  SELECT d.container_id, d.node_id, d.status
  FROM descendants d
  WHERE d.node_id <> d.container_id
    AND d.type IN ('task', 'bug')
    AND d.status <> 'archived'
    AND NOT EXISTS (SELECT 1 FROM tickets.tickets ch WHERE ch.parent_id = d.node_id)
),
agg AS (
  SELECT
    container_id,
    COUNT(*)::int AS total_leaves,
    COUNT(*) FILTER (WHERE status = 'done')::int AS done_leaves,
    COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked_leaves,
    COUNT(*) FILTER (WHERE status IN ('in_progress', 'in_review', 'qa_review'))::int AS in_progress_leaves,
    COUNT(*) FILTER (WHERE status = 'awaiting_deploy')::int AS awaiting_deploy_leaves,
    COUNT(*) FILTER (WHERE status IN ('triage', 'backlog', 'planning', 'plan_staged'))::int AS open_leaves
  FROM leaves
  GROUP BY container_id
)
SELECT
  c.id AS container_id,
  COALESCE(a.total_leaves, 0)       AS total_leaves,
  COALESCE(a.done_leaves, 0)        AS done_leaves,
  COALESCE(a.blocked_leaves, 0)     AS blocked_leaves,
  COALESCE(a.in_progress_leaves, 0) AS in_progress_leaves,
  COALESCE(a.awaiting_deploy_leaves, 0) AS awaiting_deploy_leaves,
  COALESCE(a.open_leaves, 0)        AS open_leaves,
  COALESCE(ROUND(100.0 * a.done_leaves / NULLIF(a.total_leaves, 0))::int, 0) AS pct_done,
  CASE
    WHEN COALESCE(a.blocked_leaves, 0) > 0 THEN 'red'
    WHEN COALESCE(a.total_leaves, 0) > 0
         AND ROUND(100.0 * a.done_leaves / NULLIF(a.total_leaves, 0))::int = 100 THEN 'green'
    ELSE 'amber'
  END AS health
FROM tickets.tickets c
LEFT JOIN agg a ON a.container_id = c.id
WHERE c.type IN ('project', 'feature');
