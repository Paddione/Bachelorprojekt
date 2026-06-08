// website/src/lib/tickets-db.ts
import { pool, ensureSchemaOnce } from './website-db';
import { MixedEmbeddingModelError } from './knowledge-db';
import type { EmbeddingModel } from './embeddings';

export { MixedEmbeddingModelError };

/** The embedding model this environment writes/queries with. bge-m3 in prod
 *  (LLM_ENABLED=true), voyage-multilingual-2 in dev. Mirrors knowledge-db.ts. */
export function ticketEmbeddingModel(): EmbeddingModel {
  return process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2';
}

let schemaReady = false;

// WARNING: If you manually create or alter tables in production, you MUST run
// it as the `website` role, or run `ALTER TABLE ... OWNER TO website;`.
// Otherwise, this schema init will fail on `CREATE INDEX IF NOT EXISTS` due
// to permission denied. See Ticket T000028.
export async function initTicketsSchema(): Promise<void> {
  if (schemaReady) return;
  return ensureSchemaOnce('tickets', async () => {
    const client = await pool.connect();
    try {
      await client.query(`SELECT pg_advisory_lock(hashtext('init:tickets'))`);
      try {

  await pool.query(`CREATE SCHEMA IF NOT EXISTS tickets AUTHORIZATION website`);

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

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_brand_fkey') THEN
        ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
      END IF;
    END $$
  `);

  // Idempotent column additions for older schema versions where CREATE TABLE IF NOT EXISTS skipped creation
  await pool.query(`
    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('bug','feature','task','project')),
      ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tickets.tickets(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS brand TEXT,
      ADD COLUMN IF NOT EXISTS url TEXT,
      ADD COLUMN IF NOT EXISTS thesis_tag TEXT,
      ADD COLUMN IF NOT EXISTS component TEXT
  `);

  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS notes TEXT`);
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false`);

  // Phase 1 Software Factory: touched_files stores the file paths a feature
  // touches, used by the conflict detector to prevent parallel features from
  // editing the same files. pipeline_slot tracks which parallel slot (1-N)
  // this feature occupies. NULL means the feature is queued but not yet
  // assigned to a slot.
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS touched_files TEXT[]`);
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS pipeline_slot INTEGER`);

  // Phase 3 Software Factory: retry_count tracks how many times the pipeline
  // has retried a failed feature. Reset to 0 on slot-claim; >=2 => block +
  // PushNotification (see pipeline.js CI-red handling). [T000413]
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0`);

  // Phase 3 Software Factory: factory_control is the runtime control plane —
  // global kill-switch, per-brand daily-deploy cap counter, dry-run markers.
  // brand NULL = global. Read fresh per dispatcher tick, fail-closed on error.
  // [T000413]
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.factory_control (
      key        TEXT NOT NULL,
      brand      TEXT,
      value      TEXT NOT NULL,
      set_by     TEXT,
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (key, brand)
    )
  `);

  // Software Factory Live-Floor (T-FACTORY-FLOOR): append-only phase telemetry.
  // Each row is one phase transition emitted best-effort by `ticket.sh phase`
  // from pipeline.js (driver=factory) or dev-flow-execute (driver=devflow).
  // The latest row per ticket = its current phase/state. Never blocks the
  // pipeline — a failed insert is swallowed by the caller.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.factory_phase_events (
      id         BIGSERIAL PRIMARY KEY,
      ticket_id  UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      phase      TEXT NOT NULL CHECK (phase IN ('scout','design','plan','implement','verify','deploy')),
      state      TEXT NOT NULL CHECK (state IN ('entered','done','blocked')),
      detail     TEXT,
      driver     TEXT NOT NULL DEFAULT 'factory' CHECK (driver IN ('factory','devflow')),
      at         TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS factory_phase_events_ticket_at_idx ON tickets.factory_phase_events (ticket_id, at DESC)`);

  await pool.query(`
    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS attention_mode TEXT NOT NULL DEFAULT 'auto'
      CHECK (attention_mode IN ('auto', 'ai_ready', 'needs_human'))
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

  // Test-run linkback columns. Mirrored in `systemtest/db.ts` (the canonical
  // owner — that module also installs FKs to test_runs/test_results /
  // questionnaire_questions once those tables exist). We add the columns here
  // too so a tickets-only init path doesn't break: the unique indexes below
  // reference source_test_question_id and source_test_run_id+source_test_id,
  // and on a fresh DB ensureSystemtestSchema has not yet run. The FKs are
  // deferred to ensureSystemtestSchema.
  await pool.query(`
    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS source_test_assignment_id UUID,
      ADD COLUMN IF NOT EXISTS source_test_question_id   UUID,
      ADD COLUMN IF NOT EXISTS source_test_run_id        TEXT,
      ADD COLUMN IF NOT EXISTS source_test_result_id     BIGINT,
      ADD COLUMN IF NOT EXISTS source_test_id            TEXT
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


  // DEPRECATED (T000402): tickets.ticket_counters was a PER-BRAND monotonic
  // counter that fed the external_id trigger. external_id is GLOBALLY unique
  // (see the UNIQUE constraint on tickets.tickets.external_id), so per-brand
  // counters drifted and re-minted the same T-number across brands, violating
  // the constraint and blocking ticket creation. The single source of truth is
  // now the global sequence tickets.external_id_seq (below). The table is kept
  // as inert legacy history; nothing reads or writes it anymore.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_counters (
      brand       TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT PRIMARY KEY,
      last_value  BIGINT NOT NULL DEFAULT 0
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_counters_brand_fkey') THEN
          ALTER TABLE tickets.ticket_counters ADD CONSTRAINT ticket_counters_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
        END IF;
      END $$;
  `);

  // GLOBAL external_id sequence — the single source of truth for T-numbers.
  // `IF NOT EXISTS` adopts the vestigial live sequence if one was created
  // out-of-band, and creates it otherwise. Owned by `website` so later
  // schema-init queries (run as website) can setval it.
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS tickets.external_id_seq AS BIGINT START 1`);
  await pool.query(`ALTER SEQUENCE tickets.external_id_seq OWNER TO website`);

  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_assign_external_id() RETURNS trigger AS $$
    DECLARE
      next_v BIGINT;
    BEGIN
      IF NEW.external_id IS NULL THEN
        next_v := nextval('tickets.external_id_seq');
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
  // gets a fresh T-number, allocated GLOBALLY above the current global max so it
  // can never collide with an existing id. Ordered by created_at for stable
  // numbering. This only touches NULL / non-T-format rows — it never renumbers a
  // row that already holds a valid T-number.
  await pool.query(`
    WITH to_fill AS (
      SELECT t.id,
             (SELECT COALESCE(MAX(CAST(SUBSTRING(external_id FROM 2) AS BIGINT)), 0)
                FROM tickets.tickets
               WHERE external_id ~ '^T[0-9]+$')
             + ROW_NUMBER() OVER (ORDER BY t.created_at ASC, t.id ASC) AS new_seq
        FROM tickets.tickets t
       WHERE t.external_id IS NULL OR t.external_id !~ '^T[0-9]+$'
    )
    UPDATE tickets.tickets t
       SET external_id = 'T' || LPAD(f.new_seq::text, 6, '0')
      FROM to_fill f
     WHERE t.id = f.id
  `);

  // Seal the sequence above the current global max so future inserts never
  // re-collide with a backfilled or pre-existing id. Idempotent: setval to the
  // observed max on every boot is a no-op once the sequence is already ahead.
  // NOTE (T000402): historical cross-brand DUPLICATE external_ids that already
  // hold valid T-numbers (e.g. T000342/T000399/T000402) are NOT reconciled here
  // — that renumber touches live, externally-referenced ids and is a separate
  // one-shot manual migration. See the PR's HELD-FOR-REVIEW section.
  await pool.query(`
    SELECT setval('tickets.external_id_seq',
                  COALESCE((SELECT MAX(CAST(SUBSTRING(external_id FROM 2) AS BIGINT))
                              FROM tickets.tickets
                             WHERE external_id ~ '^T[0-9]+$'), 1),
                  EXISTS (SELECT 1 FROM tickets.tickets WHERE external_id ~ '^T[0-9]+$'))
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_purge_test_data()
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, tickets
    AS $$
    DECLARE
      result            JSONB := '{}'::jsonb;
      cnt               INT;
      has_scores        BOOLEAN;
      has_answers       BOOLEAN;
      has_test_results  BOOLEAN;
      has_test_runs     BOOLEAN;
      has_pw_reports    BOOLEAN;
      has_billing_inv   BOOLEAN;
      has_src_assn_col  BOOLEAN;
      has_meetings      BOOLEAN;
      has_qts_evidence  BOOLEAN;
      has_inbox_flag    BOOLEAN;
      has_thread_flag   BOOLEAN;
      has_messages_flag BOOLEAN;
      keep_emails       TEXT[] := ARRAY[
                           'patrick@korczewski.de',
                           'p.korczewski@gmail.com',
                           'quamain@web.de'
                         ];
    BEGIN
      -- Probe optional tables / columns.
      SELECT EXISTS(SELECT 1 FROM information_schema.tables
                     WHERE table_schema='public' AND table_name='questionnaire_assignment_scores')
        INTO has_scores;
      SELECT EXISTS(SELECT 1 FROM information_schema.tables
                     WHERE table_schema='public' AND table_name='questionnaire_answers')
        INTO has_answers;
      SELECT EXISTS(SELECT 1 FROM information_schema.tables
                     WHERE table_schema='public' AND table_name='test_results')
        INTO has_test_results;
      SELECT EXISTS(SELECT 1 FROM information_schema.tables
                     WHERE table_schema='public' AND table_name='test_runs')
        INTO has_test_runs;
      SELECT EXISTS(SELECT 1 FROM information_schema.tables
                     WHERE table_schema='public' AND table_name='playwright_reports')
        INTO has_pw_reports;
      SELECT EXISTS(SELECT 1 FROM information_schema.tables
                     WHERE table_schema='public' AND table_name='billing_invoices')
        INTO has_billing_inv;
      SELECT EXISTS(SELECT 1 FROM information_schema.tables
                     WHERE table_schema='public' AND table_name='meetings')
        INTO has_meetings;
      SELECT EXISTS(SELECT 1 FROM information_schema.columns
                     WHERE table_schema='tickets'
                       AND table_name='tickets'
                       AND column_name='source_test_assignment_id')
        INTO has_src_assn_col;
      SELECT EXISTS(SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public'
                       AND table_name='questionnaire_test_status'
                       AND column_name='evidence_id')
        INTO has_qts_evidence;
      SELECT EXISTS(SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public'
                       AND table_name='inbox_items'
                       AND column_name='is_test_data')
        INTO has_inbox_flag;
      SELECT EXISTS(SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public'
                       AND table_name='message_threads'
                       AND column_name='is_test_data')
        INTO has_thread_flag;
      SELECT EXISTS(SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public'
                       AND table_name='messages'
                       AND column_name='is_test_data')
        INTO has_messages_flag;

      ----------------------------------------------------------------------------
      -- 1) Clear FK from questionnaire_test_status to test-data tickets.
      ----------------------------------------------------------------------------
      UPDATE questionnaire_test_status
         SET last_failure_ticket_id = NULL
       WHERE last_failure_ticket_id IN (
               SELECT id FROM tickets.tickets WHERE is_test_data = true
             );
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('questionnaire_test_status_cleared', cnt);

      ----------------------------------------------------------------------------
      -- 2) Null out tickets.source_test_assignment_id refs to test assignments.
      ----------------------------------------------------------------------------
      IF has_src_assn_col THEN
        UPDATE tickets.tickets
           SET source_test_assignment_id = NULL
         WHERE source_test_assignment_id IN (
                 SELECT id FROM questionnaire_assignments WHERE is_test_data = true
               );
        GET DIAGNOSTICS cnt = ROW_COUNT;
        result := result || jsonb_build_object('tickets_assignment_ref_cleared', cnt);
      END IF;

      ----------------------------------------------------------------------------
      -- 3a) NULL out questionnaire_test_status.evidence_id refs we're about to
      --     delete.
      ----------------------------------------------------------------------------
      IF has_qts_evidence THEN
        UPDATE questionnaire_test_status
           SET evidence_id = NULL
         WHERE evidence_id IN (
                 SELECT id FROM questionnaire_test_evidence
                  WHERE assignment_id IN (
                          SELECT id FROM questionnaire_assignments WHERE is_test_data = true
                        )
               );
        GET DIAGNOSTICS cnt = ROW_COUNT;
        result := result || jsonb_build_object('questionnaire_test_status_evidence_cleared', cnt);
      END IF;

      ----------------------------------------------------------------------------
      -- 3b) Delete questionnaire_test_evidence for test-data assignments.
      ----------------------------------------------------------------------------
      DELETE FROM questionnaire_test_evidence
       WHERE assignment_id IN (
               SELECT id FROM questionnaire_assignments WHERE is_test_data = true
             );
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('questionnaire_test_evidence', cnt);

      ----------------------------------------------------------------------------
      -- 4) Delete questionnaire_test_fixtures for test-data assignments.
      ----------------------------------------------------------------------------
      DELETE FROM questionnaire_test_fixtures
       WHERE assignment_id IN (
               SELECT id FROM questionnaire_assignments WHERE is_test_data = true
             );
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('questionnaire_test_fixtures', cnt);

      ----------------------------------------------------------------------------
      -- 5) Delete questionnaire_assignment_scores (if table present).
      ----------------------------------------------------------------------------
      IF has_scores THEN
        DELETE FROM questionnaire_assignment_scores
         WHERE assignment_id IN (
                 SELECT id FROM questionnaire_assignments WHERE is_test_data = true
               );
        GET DIAGNOSTICS cnt = ROW_COUNT;
        result := result || jsonb_build_object('questionnaire_assignment_scores', cnt);
      END IF;

      ----------------------------------------------------------------------------
      -- 6) Delete questionnaire_answers (if table present).
      ----------------------------------------------------------------------------
      IF has_answers THEN
        DELETE FROM questionnaire_answers
         WHERE assignment_id IN (
                 SELECT id FROM questionnaire_assignments WHERE is_test_data = true
               );
        GET DIAGNOSTICS cnt = ROW_COUNT;
        result := result || jsonb_build_object('questionnaire_answers', cnt);
      END IF;

      ----------------------------------------------------------------------------
      -- 6b) ── questionnaire_templates sweep (NEW in v4 / Gap 2). ───────────────
      --     fa-fragebogen.spec.ts INSERTs templates with title 'e2e-*' and
      --     deletes them in afterAll — but a crash leaves them permanently.
      --     Sweep here, before assignments (7), so any FK from assignment →
      --     template is already resolved.
      ----------------------------------------------------------------------------
      DELETE FROM questionnaire_templates WHERE title LIKE 'e2e-%';
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('questionnaire_templates', cnt);

      ----------------------------------------------------------------------------
      -- 7) Delete the test-data assignments themselves.
      ----------------------------------------------------------------------------
      DELETE FROM questionnaire_assignments WHERE is_test_data = true;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('questionnaire_assignments', cnt);

      ----------------------------------------------------------------------------
      -- 8) Drain transient systemtest plumbing.
      ----------------------------------------------------------------------------
      DELETE FROM systemtest_failure_outbox;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('systemtest_failure_outbox', cnt);

      DELETE FROM systemtest_magic_tokens;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('systemtest_magic_tokens', cnt);

      ----------------------------------------------------------------------------
      -- 9) Optional reporting / run-history tables.
      ----------------------------------------------------------------------------
      IF has_pw_reports THEN
        DELETE FROM playwright_reports;
        GET DIAGNOSTICS cnt = ROW_COUNT;
        result := result || jsonb_build_object('playwright_reports', cnt);
      END IF;

      IF has_test_results THEN
        DELETE FROM test_results;
        GET DIAGNOSTICS cnt = ROW_COUNT;
        result := result || jsonb_build_object('test_results', cnt);
      END IF;
      IF has_test_runs THEN
        DELETE FROM test_runs;
        GET DIAGNOSTICS cnt = ROW_COUNT;
        result := result || jsonb_build_object('test_runs', cnt);
      END IF;

      ----------------------------------------------------------------------------
      -- 10) Delete child test-data tickets (non-project).
      ----------------------------------------------------------------------------
      DELETE FROM tickets.tickets
       WHERE is_test_data = true
         AND type <> 'project';
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('tickets_children', cnt);

      ----------------------------------------------------------------------------
      -- 11) Delete project (epic) test-data tickets last.
      ----------------------------------------------------------------------------
      DELETE FROM tickets.tickets
       WHERE is_test_data = true
         AND type = 'project';
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('tickets_projects', cnt);

      ----------------------------------------------------------------------------
      -- 11b) Messaging sweeps.
      --     Order: messages → message_threads → inbox_items.
      ----------------------------------------------------------------------------
      IF has_messages_flag THEN
        DELETE FROM messages WHERE is_test_data = true;
        GET DIAGNOSTICS cnt = ROW_COUNT;
        result := result || jsonb_build_object('messages', cnt);
      END IF;

      IF has_thread_flag THEN
        DELETE FROM message_threads WHERE is_test_data = true;
        GET DIAGNOSTICS cnt = ROW_COUNT;
        result := result || jsonb_build_object('message_threads', cnt);
      END IF;

      IF has_inbox_flag THEN
        DELETE FROM inbox_items WHERE is_test_data = true;
        GET DIAGNOSTICS cnt = ROW_COUNT;
        result := result || jsonb_build_object('inbox_items', cnt);
      END IF;

      ----------------------------------------------------------------------------
      -- 11c) Knowledge Collections test data sweep.
      ----------------------------------------------------------------------------
      DELETE FROM knowledge.collections WHERE name LIKE 'e2e-crawl-%' OR name LIKE 'e2e-webcrawl-%' OR name LIKE 'e2e-%';
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('knowledge_collections', cnt);

      ----------------------------------------------------------------------------
      -- 11d) ── Meetings sweep (NEW in v4 / Gap 1). ─────────────────────────────
      --     booking-flow.ts seeds meetings with meeting_type '[TEST] systemtest-
      --     booking'. These are tracked as fixtures but NOT deleted by the bracket
      --     because fn_purge_test_data had no meetings step — only the hourly
      --     CronJob could reach them. Meanwhile the customer allowlist sweep
      --     (step 12) guards with NOT EXISTS (meetings WHERE customer_id = c.id),
      --     so test customers also leaked.
      --     Fix: sweep meetings by meeting_type LIKE '[TEST]%' before customers.
      ----------------------------------------------------------------------------
      IF has_meetings THEN
        DELETE FROM meetings WHERE meeting_type LIKE '[TEST]%';
        GET DIAGNOSTICS cnt = ROW_COUNT;
        result := result || jsonb_build_object('meetings', cnt);
      END IF;

      ----------------------------------------------------------------------------
      -- 12) Customer allowlist sweep.
      ----------------------------------------------------------------------------
      DELETE FROM customers c
       WHERE c.email <> ALL (keep_emails)
         AND NOT EXISTS (
               SELECT 1 FROM meetings m WHERE m.customer_id = c.id
             )
         AND (
               NOT has_billing_inv
               OR NOT EXISTS (
                    SELECT 1 FROM billing_invoices bi
                     WHERE bi.customer_id = c.id::text
                  )
             )
         AND NOT EXISTS (SELECT 1 FROM chat_room_members      WHERE customer_id        = c.id)
         AND NOT EXISTS (SELECT 1 FROM chat_messages          WHERE sender_customer_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM chat_message_reads     WHERE customer_id        = c.id)
         AND NOT EXISTS (SELECT 1 FROM chat_rooms             WHERE direct_customer_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM document_assignments   WHERE customer_id        = c.id)
         AND NOT EXISTS (SELECT 1 FROM message_threads        WHERE customer_id        = c.id)
         AND NOT EXISTS (SELECT 1 FROM messages               WHERE sender_customer_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM brett_snapshots        WHERE customer_id        = c.id)
         AND NOT EXISTS (SELECT 1 FROM questionnaire_assignments WHERE customer_id     = c.id)
         AND NOT EXISTS (SELECT 1 FROM tickets.tickets        WHERE customer_id        = c.id);
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('customers', cnt);

      RETURN result;
    END;
    $$;
  `);

  await pool.query(`COMMENT ON FUNCTION tickets.fn_purge_test_data() IS 'Idempotent test-data purge. v4 (2026-05-24)'`);
  await pool.query(`GRANT EXECUTE ON FUNCTION tickets.fn_purge_test_data() TO website`);

  // ── INERT future plumbing: pg_notify on new feature tickets ─────────────────
  // Spec §6 Phase 2 (correction A2): NOT CONSUMED in Phase 3. The data plane is
  // one-shot `kubectl exec … psql` (lib.sh:31-35); a LISTEN needs a held
  // connection (cf. dispatcher.js:15). The Cron-poll (schedule.sh, every timer
  // tick) IS the trigger. This NOTIFY exists only so a future long-lived consumer
  // can be wired without a schema change. Idempotent: safe per-pod-boot, both brands.
  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.notify_feature_inserted()
    RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('factory_feature_inserted', NEW.external_id);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS trg_notify_feature_inserted ON tickets.tickets;
  `);
  await pool.query(`
    CREATE TRIGGER trg_notify_feature_inserted
    AFTER INSERT ON tickets.tickets
    FOR EACH ROW
    WHEN (NEW.type = 'feature')
    EXECUTE FUNCTION tickets.notify_feature_inserted();
  `);
      } finally {
        await client.query(`SELECT pg_advisory_unlock(hashtext('init:tickets'))`);
      }
    } finally {
      client.release();
    }

    schemaReady = true;
  });
}

/** Dark-launch gate. Returns true only when an ENABLED flag row exists for
 *  (brand,key). Fails CLOSED (false) on any DB error so a flag-table outage
 *  can never accidentally turn a gated feature on. [T000413] */
export async function isFeatureEnabled(brand: string, key: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT enabled FROM tickets.feature_flags WHERE brand = $1 AND key = $2 LIMIT 1`,
      [brand, key],
    );
    return rows.length > 0 && rows[0].enabled === true;
  } catch {
    return false;
  }
}

