// website/src/lib/tickets-db.ts
import { pool } from './website-db';

let schemaReady = false;

export async function initTicketsSchema(): Promise<void> {
  if (schemaReady) return;

  await pool.query(`CREATE SCHEMA IF NOT EXISTS tickets AUTHORIZATION website`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.tickets (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id     TEXT        UNIQUE,
      type            TEXT        NOT NULL CHECK (type IN ('bug','feature','task','project')),
      parent_id       UUID        REFERENCES tickets.tickets(id) ON DELETE SET NULL,
      brand           TEXT        NOT NULL,

      title           TEXT        NOT NULL,
      description     TEXT,
      url             TEXT,
      thesis_tag      TEXT,
      component       TEXT,

      status          TEXT        NOT NULL DEFAULT 'triage'
                      CHECK (status IN ('triage','backlog','in_progress','in_review','blocked','done','archived')),
      resolution      TEXT        CHECK (resolution IN
                        ('fixed','shipped','wontfix','duplicate','cant_reproduce','obsolete')),
      priority        TEXT        NOT NULL DEFAULT 'mittel'  CHECK (priority IN ('hoch','mittel','niedrig')),
      severity        TEXT        CHECK (severity IN ('critical','major','minor','trivial')),

      reporter_id     UUID        REFERENCES customers(id) ON DELETE SET NULL,
      reporter_email  TEXT,
      assignee_id     UUID        REFERENCES customers(id) ON DELETE SET NULL,
      customer_id     UUID        REFERENCES customers(id) ON DELETE SET NULL,

      start_date      DATE,
      due_date        DATE,
      estimate_minutes      INTEGER,
      time_logged_minutes   INTEGER NOT NULL DEFAULT 0,

      triaged_at      TIMESTAMPTZ,
      started_at      TIMESTAMPTZ,
      done_at         TIMESTAMPTZ,
      archived_at     TIMESTAMPTZ,

      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT resolution_only_when_closed CHECK (
        (resolution IS NULL AND status NOT IN ('done','archived'))
        OR status IN ('done','archived')
      )
    )
  `);

  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS notes TEXT`);

  // Test-run linkback columns. Mirrored in `systemtest/db.ts` (the canonical
  // owner — that module also installs FKs to test_runs/test_results once those
  // tables exist). We add the columns here too so a tickets-only init path
  // doesn't break the failure-bridge: the FKs are deferred to ensureSystemtestSchema.
  await pool.query(`
    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS source_test_run_id    TEXT,
      ADD COLUMN IF NOT EXISTS source_test_result_id BIGINT,
      ADD COLUMN IF NOT EXISTS source_test_id        TEXT
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets.tickets (status) WHERE status NOT IN ('done','archived')`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_type_brand_idx ON tickets.tickets (type, brand)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_parent_idx ON tickets.tickets (parent_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_assignee_idx ON tickets.tickets (assignee_id) WHERE assignee_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_customer_idx ON tickets.tickets (customer_id) WHERE customer_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_thesis_tag_idx ON tickets.tickets (thesis_tag) WHERE thesis_tag IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_external_id_idx ON tickets.tickets (external_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_component_idx ON tickets.tickets (component) WHERE component IS NOT NULL`);

  // At most one OPEN ticket per failing system-test step. The failure-bridge
  // looks up by source_test_question_id and reuses the existing open row;
  // this index is the defense-in-depth race guard. Closed tickets (done /
  // archived) are excluded so a regression-on-retest can still open a fresh
  // ticket per the original design.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_open_per_test_question_uq
      ON tickets.tickets (source_test_question_id)
      WHERE source_test_question_id IS NOT NULL AND status NOT IN ('done','archived')
  `);

  // Test-run linkback dedup: at most one OPEN ticket per (run_id, test_id).
  // The test-run failure-bridge reuses the existing open ticket; this index
  // is the race guard.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_open_per_test_run_test_uq
      ON tickets.tickets (source_test_run_id, source_test_id)
      WHERE source_test_run_id IS NOT NULL
        AND source_test_id     IS NOT NULL
        AND status NOT IN ('done','archived')
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_links (
      id          BIGSERIAL PRIMARY KEY,
      from_id     UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      to_id       UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL CHECK (kind IN ('blocks','blocked_by','duplicate_of','relates_to','fixes','fixed_by')),
      pr_number   INTEGER,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by  UUID REFERENCES customers(id),
      UNIQUE (from_id, to_id, kind)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_links_from_idx ON tickets.ticket_links (from_id, kind)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_links_to_idx   ON tickets.ticket_links (to_id, kind)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_links_pr_idx   ON tickets.ticket_links (pr_number) WHERE pr_number IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_activity (
      id          BIGSERIAL PRIMARY KEY,
      ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      actor_id    UUID REFERENCES customers(id),
      actor_label TEXT,
      field       TEXT NOT NULL,
      old_value   JSONB,
      new_value   JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS activity_ticket_idx ON tickets.ticket_activity (ticket_id, created_at)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_comments (
      id           BIGSERIAL PRIMARY KEY,
      ticket_id    UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      author_id    UUID REFERENCES customers(id),
      author_label TEXT NOT NULL,
      kind         TEXT NOT NULL DEFAULT 'comment'
                   CHECK (kind IN ('comment','status_change','system')),
      body         TEXT NOT NULL,
      visibility   TEXT NOT NULL DEFAULT 'internal'
                   CHECK (visibility IN ('internal','public')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON tickets.ticket_comments (ticket_id, created_at)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_attachments (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      filename    TEXT NOT NULL,
      nc_path     TEXT,
      data_url    TEXT,
      mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_size   BIGINT,
      uploaded_by UUID REFERENCES customers(id),
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (nc_path IS NOT NULL OR data_url IS NOT NULL)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_idx ON tickets.ticket_attachments (ticket_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_watchers (
      ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      user_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (ticket_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.tags (
      id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name  TEXT NOT NULL UNIQUE,
      color TEXT,
      brand TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_tags (
      ticket_id UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      tag_id    UUID NOT NULL REFERENCES tickets.tags(id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, tag_id)
    )
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_prevent_cycle() RETURNS trigger AS $$
    DECLARE
      cur UUID := NEW.parent_id;
      depth INT := 0;
    BEGIN
      WHILE cur IS NOT NULL AND depth < 100 LOOP
        IF cur = NEW.id THEN
          RAISE EXCEPTION 'parent_id cycle detected on ticket %', NEW.id;
        END IF;
        SELECT parent_id INTO cur FROM tickets.tickets WHERE id = cur;
        depth := depth + 1;
      END LOOP;
      RETURN NEW;
    END $$ LANGUAGE plpgsql
  `);
  await pool.query(`DROP TRIGGER IF EXISTS trg_tickets_prevent_cycle ON tickets.tickets`);
  await pool.query(`
    CREATE TRIGGER trg_tickets_prevent_cycle
      BEFORE INSERT OR UPDATE OF parent_id ON tickets.tickets
      FOR EACH ROW WHEN (NEW.parent_id IS NOT NULL)
      EXECUTE FUNCTION tickets.fn_prevent_cycle()
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_lifecycle_ts() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'triage' AND NEW.triaged_at IS NULL THEN NEW.triaged_at := now(); END IF;
        IF NEW.status = 'in_progress' AND NEW.started_at IS NULL THEN NEW.started_at := now(); END IF;
        IF NEW.status = 'done' AND NEW.done_at IS NULL THEN NEW.done_at := now(); END IF;
        IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN NEW.archived_at := now(); END IF;
      ELSE
        IF NEW.status <> OLD.status THEN
          IF NEW.status = 'triage'      AND NEW.triaged_at  IS NULL THEN NEW.triaged_at  := now(); END IF;
          IF NEW.status = 'in_progress' AND NEW.started_at  IS NULL THEN NEW.started_at  := now(); END IF;
          IF NEW.status = 'done'        AND NEW.done_at     IS NULL THEN NEW.done_at     := now(); END IF;
          IF NEW.status = 'archived'    AND NEW.archived_at IS NULL THEN NEW.archived_at := now(); END IF;
        END IF;
        NEW.updated_at := now();
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql
  `);
  await pool.query(`DROP TRIGGER IF EXISTS trg_tickets_lifecycle_ts ON tickets.tickets`);
  await pool.query(`
    CREATE TRIGGER trg_tickets_lifecycle_ts
      BEFORE INSERT OR UPDATE ON tickets.tickets
      FOR EACH ROW EXECUTE FUNCTION tickets.fn_lifecycle_ts()
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_audit_log() RETURNS trigger AS $$
    DECLARE
      actor_id_local UUID;
      actor_label_local TEXT;
      diff JSONB := '{}'::jsonb;
      tracked_field TEXT;
    BEGIN
      BEGIN actor_id_local := current_setting('app.user_id', true)::uuid;
      EXCEPTION WHEN OTHERS THEN actor_id_local := NULL; END;
      BEGIN actor_label_local := current_setting('app.user_label', true);
      EXCEPTION WHEN OTHERS THEN actor_label_local := NULL; END;

      IF TG_OP = 'INSERT' THEN
        INSERT INTO tickets.ticket_activity (ticket_id, actor_id, actor_label, field, new_value)
        VALUES (NEW.id, actor_id_local, actor_label_local, '_created', to_jsonb(NEW));
        RETURN NEW;
      END IF;

      FOR tracked_field IN SELECT unnest(ARRAY[
        'status','resolution','priority','severity','assignee_id','customer_id',
        'reporter_id','reporter_email','title','description','url','component',
        'thesis_tag','parent_id','start_date','due_date','estimate_minutes'
      ]) LOOP
        IF (to_jsonb(OLD) -> tracked_field) IS DISTINCT FROM (to_jsonb(NEW) -> tracked_field) THEN
          diff := diff || jsonb_build_object(tracked_field,
            jsonb_build_object('old', to_jsonb(OLD) -> tracked_field,
                               'new', to_jsonb(NEW) -> tracked_field));
        END IF;
      END LOOP;

      IF diff <> '{}'::jsonb THEN
        INSERT INTO tickets.ticket_activity (ticket_id, actor_id, actor_label, field, old_value, new_value)
        VALUES (NEW.id, actor_id_local, actor_label_local, '_updated', NULL, diff);
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql
  `);
  await pool.query(`DROP TRIGGER IF EXISTS trg_tickets_audit_log ON tickets.tickets`);
  await pool.query(`
    CREATE TRIGGER trg_tickets_audit_log
      AFTER INSERT OR UPDATE ON tickets.tickets
      FOR EACH ROW EXECUTE FUNCTION tickets.fn_audit_log()
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.pr_events (
      pr_number    INTEGER PRIMARY KEY,
      title        TEXT NOT NULL,
      description  TEXT,
      category     TEXT NOT NULL,
      scope        TEXT,
      brand        TEXT,
      merged_at    TIMESTAMPTZ NOT NULL,
      merged_by    TEXT,
      status       TEXT NOT NULL DEFAULT 'shipped'
                   CHECK (status IN ('planned','in_progress','shipped','reverted')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS pr_events_merged_at_idx ON tickets.pr_events (merged_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pr_events_brand_idx     ON tickets.pr_events (brand) WHERE brand IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pr_events_category_idx  ON tickets.pr_events (category)`);

  // Per-brand monotonic counter — feeds the BEFORE-INSERT trigger that mints T-numbers.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_counters (
      brand       TEXT PRIMARY KEY,
      last_value  BIGINT NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_assign_external_id() RETURNS trigger AS $$
    DECLARE
      next_v BIGINT;
    BEGIN
      IF NEW.external_id IS NULL THEN
        INSERT INTO tickets.ticket_counters (brand, last_value)
        VALUES (NEW.brand, 1)
        ON CONFLICT (brand) DO UPDATE SET last_value = tickets.ticket_counters.last_value + 1
        RETURNING last_value INTO next_v;
        NEW.external_id := 'T' || LPAD(next_v::text, 6, '0');
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql
  `);
  await pool.query(`DROP TRIGGER IF EXISTS trg_tickets_assign_external_id ON tickets.tickets`);
  await pool.query(`
    CREATE TRIGGER trg_tickets_assign_external_id
      BEFORE INSERT ON tickets.tickets
      FOR EACH ROW EXECUTE FUNCTION tickets.fn_assign_external_id()
  `);

  // Idempotent backfill: any ticket whose external_id is NULL or not in T-format
  // gets a T-number, ordered by created_at within its brand.
  await pool.query(`
    INSERT INTO tickets.ticket_counters (brand, last_value)
    SELECT t.brand,
           COALESCE(MAX(CASE WHEN t.external_id ~ '^T[0-9]+$'
                             THEN CAST(SUBSTRING(t.external_id FROM 2) AS BIGINT)
                             ELSE 0 END), 0)
      FROM tickets.tickets t
     GROUP BY t.brand
    ON CONFLICT (brand) DO NOTHING
  `);
  await pool.query(`
    WITH to_fill AS (
      SELECT t.id, t.brand,
             (SELECT last_value FROM tickets.ticket_counters tc WHERE tc.brand = t.brand) +
             ROW_NUMBER() OVER (PARTITION BY t.brand ORDER BY t.created_at ASC, t.id ASC) AS new_seq
        FROM tickets.tickets t
       WHERE t.external_id IS NULL OR t.external_id !~ '^T[0-9]+$'
    )
    UPDATE tickets.tickets t
       SET external_id = 'T' || LPAD(f.new_seq::text, 6, '0')
      FROM to_fill f
     WHERE t.id = f.id
  `);
  await pool.query(`
    UPDATE tickets.ticket_counters tc
       SET last_value = sub.max_v
      FROM (
        SELECT brand, MAX(CAST(SUBSTRING(external_id FROM 2) AS BIGINT)) AS max_v
          FROM tickets.tickets
         WHERE external_id ~ '^T[0-9]+$'
         GROUP BY brand
      ) sub
     WHERE tc.brand = sub.brand AND tc.last_value < sub.max_v
  `);

  schemaReady = true;
}
