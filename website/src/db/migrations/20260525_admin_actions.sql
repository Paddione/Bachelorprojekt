-- Admin Actions Audit Trail
-- 2026-05-25 — for Gekko-self-service via /admin/platform → Aktionen tab

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id            serial PRIMARY KEY,
  actor         text NOT NULL,
  action        text NOT NULL,
  target        text,
  cluster       text,
  payload       jsonb,
  status        text NOT NULL CHECK (status IN ('in_progress','success','failed','partial_success')),
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS admin_actions_created_at_idx
  ON public.admin_actions (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_actions_concurrent_idx
  ON public.admin_actions (action, target, status)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS admin_actions_actor_idx
  ON public.admin_actions (actor, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.admin_actions TO website;
GRANT USAGE, SELECT ON SEQUENCE public.admin_actions_id_seq TO website;
