BEGIN;

CREATE TABLE IF NOT EXISTS tickets.ticket_comments (
  id           BIGSERIAL PRIMARY KEY,
  ticket_id    UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES public.customers(id),
  author_label TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'comment'
               CHECK (kind IN ('comment','status_change','system')),
  body         TEXT NOT NULL,
  visibility   TEXT NOT NULL DEFAULT 'internal'
               CHECK (visibility IN ('internal','public')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON tickets.ticket_comments (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS tickets.ticket_plans (
  id          BIGSERIAL PRIMARY KEY,
  ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  branch      TEXT,
  content     TEXT NOT NULL,
  pr_number   INTEGER,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_plans_ticket_idx ON tickets.ticket_plans (ticket_id);

COMMIT;
