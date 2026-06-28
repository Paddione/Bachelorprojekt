// website/src/lib/tickets/tables/tickets.ts
// Core DDL for tickets schema: tickets.tickets, ticket_links, ticket_activity,
// ticket_comments, ticket_plans, ticket_attachments, ticket_embeddings,
// ticket_watchers, tags, feature_flags, ticket_tags, pr_events, qa_reviews,
// plus related indexes, triggers, and views. Extracted from tickets-db.ts
// (G-RH01 Batch 2 — T001155).
import type { Pool, PoolClient } from 'pg';
import { ensureCockpitViews } from '../cockpit-schema';

export async function applyTicketsCoreSchema(pool: Pool | PoolClient): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.tickets (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id     TEXT        UNIQUE,
      type            TEXT        NOT NULL CHECK (type IN ('bug','feature','task','project')),
      parent_id       UUID        REFERENCES tickets.tickets(id) ON DELETE SET NULL,
      brand           TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT        NOT NULL,

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
      due_date      DATE,
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

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_brand_fkey') THEN
        ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
      END IF;
    END $$
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_effective_attention_mode(t tickets.tickets)
    RETURNS text AS $$
    BEGIN
      IF t.attention_mode != 'auto' THEN
        RETURN t.attention_mode;
      END IF;

      IF t.description IS NOT NULL AND length(t.description) >= 20
         AND t.component IS NOT NULL
         AND t.status IN ('triage', 'backlog', 'in_progress')
         AND t.reporter_email IS NULL THEN
        RETURN 'ai_ready';
      ELSE
        RETURN 'needs_human';
      END IF;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS tickets_attention_mode_idx ON tickets.tickets (attention_mode)
      WHERE status NOT IN ('done', 'archived')
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets.tickets (status) WHERE status NOT IN ('done','archived')`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_type_brand_idx ON tickets.tickets (type, brand)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_parent_idx ON tickets.tickets (parent_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_assignee_idx ON tickets.tickets (assignee_id) WHERE assignee_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_customer_idx ON tickets.tickets (customer_id) WHERE customer_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_thesis_tag_idx ON tickets.tickets (thesis_tag) WHERE thesis_tag IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_external_id_idx ON tickets.tickets (external_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_component_idx ON tickets.tickets (component) WHERE component IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_links (
      id          BIGSERIAL PRIMARY KEY,
      from_id     UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      to_id       UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL CONSTRAINT ticket_links_kind_check CHECK (kind IN ('blocks','blocked_by','duplicate_of','relates_to','fixes','fixed_by','implements','pr')),
      pr_number   INTEGER,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by  UUID REFERENCES customers(id),
      UNIQUE (from_id, to_id, kind)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_links_from_idx ON tickets.ticket_links (from_id, kind)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_links_to_idx   ON tickets.ticket_links (to_id, kind)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_links_pr_idx   ON tickets.ticket_links (pr_number) WHERE pr_number IS NOT NULL`);
  // Extend kind CHECK constraint to include 'implements' and 'pr'.
  // 'implements': track-pr.mjs T-ref links; 'pr': dev-flow PR association links.
  // Idempotent: only runs when 'pr' is not yet in the allowed values.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.check_constraints
         WHERE constraint_schema = 'tickets'
           AND constraint_name LIKE '%ticket_links%kind%'
           AND check_clause NOT LIKE '%''pr''%'
      ) THEN
        ALTER TABLE tickets.ticket_links DROP CONSTRAINT ticket_links_kind_check;
        ALTER TABLE tickets.ticket_links ADD CONSTRAINT ticket_links_kind_check
          CHECK (kind IN ('blocks','blocked_by','duplicate_of','relates_to','fixes','fixed_by','implements','pr'));
      END IF;
    END $$
  `);

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
    CREATE TABLE IF NOT EXISTS tickets.ticket_plans (
      id          BIGSERIAL PRIMARY KEY,
      ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      slug        TEXT NOT NULL,
      branch      TEXT,
      content     TEXT NOT NULL,
      pr_number   INTEGER,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_plans_ticket_idx ON tickets.ticket_plans (ticket_id)`);

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

  // Phase 1 Software Factory: pgvector-backed embedding table for semantic
  // search across ticket content. bge-m3 produces 1024-dimensional vectors.
  // chunk_type classifies the embedded content: summary (title+desc), spec
  // (design docs), decision (architectural choices), lesson (post-mortem).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_embeddings (
      id            BIGSERIAL PRIMARY KEY,
      ticket_id     UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      chunk         TEXT NOT NULL,
      chunk_type    TEXT NOT NULL DEFAULT 'summary'
                    CHECK (chunk_type IN ('summary','spec','decision','lesson')),
      embedding     VECTOR(1024),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_embeddings_ticket_idx ON tickets.ticket_embeddings (ticket_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_embeddings_chunk_type_idx ON tickets.ticket_embeddings (chunk_type)`);

  // Phase 1 Software Factory: tag each embedding row with the model that
  // produced it. bge-m3 (prod) and voyage-multilingual-2 (dev) are both
  // 1024-dim but their vector spaces are NOT interchangeable — search MUST
  // never compare across models (see findSimilarTickets / MixedEmbeddingModelError).
  await pool.query(`ALTER TABLE tickets.ticket_embeddings ADD COLUMN IF NOT EXISTS embedding_model TEXT`);

  // HNSW index for cosine similarity search. bge-m3 embeddings should be
  // normalized before storage so cosine distance is meaningful.
  // m=16, ef_construction=64 are sane defaults for up to ~100k embeddings.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ticket_embeddings_hnsw_idx
      ON tickets.ticket_embeddings
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
  `);

  // Helper function for semantic similarity search.
  // Usage: SELECT * FROM tickets.fn_find_similar(query_embedding, 5);
  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_find_similar(
      query_embedding VECTOR(1024),
      limit_count INTEGER DEFAULT 5
    ) RETURNS TABLE(
      ticket_id UUID,
      external_id TEXT,
      chunk TEXT,
      chunk_type TEXT,
      similarity DOUBLE PRECISION
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        te.ticket_id,
        t.external_id,
        te.chunk,
        te.chunk_type,
        (1 - (te.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity
      FROM tickets.ticket_embeddings te
      JOIN tickets.tickets t ON t.id = te.ticket_id
      ORDER BY te.embedding <=> query_embedding
      LIMIT limit_count;
    END $$ LANGUAGE plpgsql STABLE
  `);

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
      brand TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tags_brand_fkey') THEN
          ALTER TABLE tickets.tags ADD CONSTRAINT tags_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
        END IF;
      END $$;
  `);

  // Phase 3 Software Factory: feature_flags powers dark-launch / canary. Each
  // implement-agent gates new behaviour behind isFeatureEnabled(brand,'<slug>');
  // a flag flipped on enables it. Mirrors the tickets.tags id + brand-FK idiom.
  // [T000413]
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.feature_flags (
      id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      brand      TEXT NOT NULL,
      key        TEXT NOT NULL,
      enabled    BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now(),
      set_by     TEXT,
      UNIQUE (brand, key)
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feature_flags_brand_fkey') THEN
          ALTER TABLE tickets.feature_flags ADD CONSTRAINT feature_flags_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
        END IF;
      END $$;
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
        'touched_files',
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
      brand        TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      merged_at    TIMESTAMPTZ NOT NULL,
      merged_by    TEXT,
      status       TEXT NOT NULL DEFAULT 'shipped'
                   CHECK (status IN ('planned','in_progress','shipped','reverted')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pr_events_brand_fkey') THEN
          ALTER TABLE tickets.pr_events ADD CONSTRAINT pr_events_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
        END IF;
      END $$;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS pr_events_merged_at_idx ON tickets.pr_events (merged_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pr_events_brand_idx     ON tickets.pr_events (brand) WHERE brand IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pr_events_category_idx  ON tickets.pr_events (category)`);

  // Phase 1 Software Factory: metrics view for tracking throughput and cycle
  // time. v_active_features is the Dispatcher's working set — features that
  // are in a non-terminal state and have file-touch data for conflict analysis.
  await pool.query(`
    CREATE OR REPLACE VIEW tickets.v_factory_metrics AS
    SELECT
      date_trunc('day', created_at)::date AS day,
      COUNT(*) FILTER (WHERE status = 'done') AS features_shipped,
      ROUND((AVG(EXTRACT(EPOCH FROM (done_at - created_at))/3600) FILTER (WHERE status = 'done'))::numeric, 1) AS avg_cycle_time_h,
      COUNT(*) FILTER (WHERE status = 'blocked') AS escalations,
      COUNT(*) FILTER (WHERE type = 'feature') AS total_features
    FROM tickets.tickets
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY 1
    ORDER BY 1 DESC
  `);

  await pool.query(`
    CREATE OR REPLACE VIEW tickets.v_active_features AS
    SELECT
      id,
      external_id,
      title,
      priority,
      status,
      touched_files,
      pipeline_slot,
      created_at,
      updated_at
    FROM tickets.tickets
    WHERE type = 'feature'
      AND status IN ('backlog', 'in_progress', 'in_review')
      AND touched_files IS NOT NULL
    ORDER BY
      CASE priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 WHEN 'niedrig' THEN 3 END,
      created_at
  `);

  await ensureCockpitViews(pool as import('pg').Pool);

  // QS-Abnahme [qualitaetssicherung]: menschliche Abnahme-Stufe zwischen deploy und done.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.qa_reviews (
      id             BIGSERIAL PRIMARY KEY,
      ticket_id      UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      criteria       JSONB NOT NULL,
      notes          TEXT,
      verdict        TEXT NOT NULL CHECK (verdict IN ('approved','rejected')),
      re_entry_phase TEXT CHECK (re_entry_phase IN ('scout','implement','verify')),
      reviewed_by    TEXT NOT NULL DEFAULT 'admin',
      reviewed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS qa_reviews_ticket_idx ON tickets.qa_reviews (ticket_id)`);
}
