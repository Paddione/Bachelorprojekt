--
-- PostgreSQL database dump
--

\restrict yong47TuUB3w74bHX2KuTP10TsbdXyHTMFdPYzfCeLMdmuSfahJmymWd7ELxTMp

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg12+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: applications; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA applications;


--
-- Name: assets; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA assets;


--
-- Name: audit; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA audit;


--
-- Name: bachelorprojekt; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA bachelorprojekt;


--
-- Name: brett; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA brett;


--
-- Name: bugs; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA bugs;


--
-- Name: coaching; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA coaching;


--
-- Name: knowledge; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA knowledge;


--
-- Name: model_registry; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA model_registry;


--
-- Name: platform; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA platform;


--
-- Name: sessions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA sessions;


--
-- Name: studio; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA studio;


--
-- Name: superpowers; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA superpowers;


--
-- Name: tickets; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA tickets;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: asset_type; Type: TYPE; Schema: assets; Owner: -
--

CREATE TYPE assets.asset_type AS ENUM (
    'image',
    'audio',
    'video',
    'document',
    'model_3d'
);


--
-- Name: billing_invoices_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_invoices_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      -- T015362: Testdaten sind vom GoBD-Schutz ausgenommen, damit der
      -- Purge-Pfad sie entfernen kann. Echtdaten bleiben unantastbar.
      IF OLD.locked = true AND OLD.is_test_data = false THEN
        IF NEW.net_amount   IS DISTINCT FROM OLD.net_amount   OR
           NEW.tax_rate     IS DISTINCT FROM OLD.tax_rate     OR
           NEW.tax_amount   IS DISTINCT FROM OLD.tax_amount   OR
           NEW.gross_amount IS DISTINCT FROM OLD.gross_amount OR
           NEW.tax_mode     IS DISTINCT FROM OLD.tax_mode     OR
           NEW.customer_id  IS DISTINCT FROM OLD.customer_id  OR
           NEW.issue_date   IS DISTINCT FROM OLD.issue_date   OR
           NEW.due_date     IS DISTINCT FROM OLD.due_date     OR
           NEW.number       IS DISTINCT FROM OLD.number       OR
           NEW.brand        IS DISTINCT FROM OLD.brand        OR
           (OLD.hash_sha256 IS NOT NULL AND NEW.hash_sha256 IS DISTINCT FROM OLD.hash_sha256)
        THEN
          RAISE EXCEPTION 'GoBD: locked invoice % cannot be modified', OLD.id;
        END IF;
      END IF;
      RETURN NEW;
    END $$;


--
-- Name: billing_invoices_no_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_invoices_no_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      -- T015362: Testdaten sind vom GoBD-Schutz ausgenommen (Purge-Pfad).
      IF OLD.locked = true AND OLD.is_test_data = false THEN
        RAISE EXCEPTION 'GoBD: locked invoice % cannot be deleted', OLD.id;
      END IF;
      RETURN OLD;
    END $$;


--
-- Name: billing_lines_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_lines_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE inv_locked boolean; inv_is_test boolean;
    BEGIN
      SELECT locked, is_test_data INTO inv_locked, inv_is_test FROM billing_invoices
        WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
      -- T015362: Testdaten sind vom GoBD-Schutz ausgenommen (Purge-Pfad).
      IF inv_locked = true AND COALESCE(inv_is_test, false) = false THEN
        RAISE EXCEPTION 'GoBD: cannot modify lines of locked invoice %', COALESCE(NEW.invoice_id, OLD.invoice_id);
      END IF;
      RETURN COALESCE(NEW, OLD);
    END $$;


--
-- Name: trg_systemtest_epic_auto_close(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_systemtest_epic_auto_close() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.parent_id IS NOT NULL
         AND NEW.status IN ('done', 'archived')
         AND (OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NOT EXISTS (
          SELECT 1 FROM tickets.tickets
           WHERE parent_id = NEW.parent_id
             AND id        <> NEW.id
             AND status    NOT IN ('done', 'archived')
        ) THEN
          UPDATE tickets.tickets
             SET status     = 'done',
                 resolution = 'shipped',
                 updated_at = now()
           WHERE id     = NEW.parent_id
             AND status NOT IN ('done', 'archived');
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$;


--
-- Name: trg_systemtest_retest(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_systemtest_retest() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.resolution = 'fixed'
         AND (OLD.resolution IS DISTINCT FROM 'fixed')
         AND NEW.source_test_assignment_id IS NOT NULL THEN
        UPDATE questionnaire_test_status
           SET retest_pending_at = now(),
               retest_attempt    = retest_attempt + 1
         WHERE last_assignment_id = NEW.source_test_assignment_id
           AND question_id        = NEW.source_test_question_id;
      END IF;
      RETURN NEW;
    END;
    $$;


--
-- Name: cockpit_notify(); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.cockpit_notify() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      PERFORM pg_notify('cockpit_events', json_build_object(
        'domain', TG_ARGV[0],
        'op',     TG_OP,
        'at',     extract(epoch from now())
      )::text);
      RETURN NEW;
    END;
    $$;


--
-- Name: fn_assign_external_id(); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.fn_assign_external_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      next_v BIGINT;
    BEGIN
      IF NEW.external_id IS NULL THEN
        next_v := nextval('tickets.external_id_seq');
        NEW.external_id := 'T' || LPAD(next_v::text, 6, '0');
      END IF;
      RETURN NEW;
    END $$;


--
-- Name: fn_audit_log(); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.fn_audit_log() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
    END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: tickets; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    type text NOT NULL,
    brand text NOT NULL,
    title text NOT NULL,
    description text,
    component text,
    status text DEFAULT 'triage'::text NOT NULL,
    resolution text,
    priority text DEFAULT 'mittel'::text NOT NULL,
    severity text,
    notes text,
    is_test_data boolean DEFAULT false NOT NULL,
    attention_mode text DEFAULT 'auto'::text NOT NULL,
    time_logged_minutes integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_test_run_id text,
    source_test_result_id bigint,
    source_test_id text,
    source_test_assignment_id uuid,
    source_test_question_id uuid,
    parent_id uuid,
    url text,
    thesis_tag text,
    reporter_id uuid,
    reporter_email text,
    assignee_id uuid,
    customer_id uuid,
    start_date date,
    due_date date,
    estimate_minutes integer,
    triaged_at timestamp with time zone,
    started_at timestamp with time zone,
    done_at timestamp with time zone,
    archived_at timestamp with time zone,
    ai_question text,
    human_answer text,
    touched_files text[],
    pipeline_slot integer,
    retry_count integer DEFAULT 0 NOT NULL,
    value_prop text,
    effort text,
    areas text[],
    depends_on text[],
    planning_rank integer,
    readiness jsonb,
    pinned boolean DEFAULT false NOT NULL,
    grilling_answers jsonb,
    next_step boolean DEFAULT false NOT NULL,
    discarded boolean DEFAULT false NOT NULL,
    major_feature boolean DEFAULT false NOT NULL,
    suggestion_comment text,
    grilling_meta jsonb,
    requirements_list text[],
    scout_drift numeric,
    scout_drift_at timestamp with time zone,
    slot_count integer DEFAULT 1 NOT NULL,
    scope text,
    pipeline_slot_meta jsonb,
    CONSTRAINT chk_brand_tickets CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text]))),
    CONSTRAINT resolution_only_when_closed CHECK ((((resolution IS NULL) AND (status <> ALL (ARRAY['done'::text, 'archived'::text, 'legacy'::text]))) OR (status = ANY (ARRAY['done'::text, 'archived'::text, 'legacy'::text])))),
    CONSTRAINT tickets_attention_mode_check CHECK ((attention_mode = ANY (ARRAY['auto'::text, 'ai_ready'::text, 'needs_human'::text]))),
    CONSTRAINT tickets_effort_check CHECK (((effort IS NULL) OR (effort = ANY (ARRAY['klein'::text, 'mittel'::text, 'gross'::text])))),
    CONSTRAINT tickets_priority_check CHECK ((priority = ANY (ARRAY['hoch'::text, 'mittel'::text, 'niedrig'::text]))),
    CONSTRAINT tickets_resolution_check CHECK ((resolution = ANY (ARRAY['fixed'::text, 'shipped'::text, 'wontfix'::text, 'duplicate'::text, 'cant_reproduce'::text, 'obsolete'::text]))),
    CONSTRAINT tickets_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'major'::text, 'minor'::text, 'trivial'::text]))),
    CONSTRAINT tickets_status_check CHECK ((status = ANY (ARRAY['triage'::text, 'planning'::text, 'plan_staged'::text, 'backlog'::text, 'in_progress'::text, 'in_review'::text, 'qa_review'::text, 'blocked'::text, 'awaiting_deploy'::text, 'done'::text, 'archived'::text]))),
    CONSTRAINT tickets_type_check CHECK ((type = ANY (ARRAY['fix'::text, 'feat'::text, 'chore'::text, 'project'::text, 'incident'::text, 'docs'::text, 'refactor'::text, 'perf'::text, 'test'::text, 'ci'::text, 'build'::text, 'bug'::text, 'feature'::text, 'task'::text])))
);


--
-- Name: fn_effective_attention_mode(tickets.tickets); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.fn_effective_attention_mode(t tickets.tickets) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
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
    $$;


--
-- Name: fn_find_similar(public.vector, integer); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.fn_find_similar(query_embedding public.vector, limit_count integer DEFAULT 5) RETURNS TABLE(ticket_id uuid, external_id text, chunk text, chunk_type text, similarity double precision)
    LANGUAGE plpgsql STABLE
    AS $$
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
    END $$;


--
-- Name: fn_guard_github_coordinate(); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.fn_guard_github_coordinate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'tickets'
    AS $$
    DECLARE object_kind text; BEGIN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'github coordinate history is append-only'; END IF;
      SELECT kind INTO object_kind FROM tickets.github_objects WHERE id=NEW.github_object_id;
      IF object_kind = 'advisory' THEN RAISE EXCEPTION 'advisories cannot have coordinates'; END IF;
      IF TG_OP = 'UPDATE' AND (NEW.github_object_id IS DISTINCT FROM OLD.github_object_id OR NEW.repository_node_id IS DISTINCT FROM OLD.repository_node_id OR NEW.repository_owner IS DISTINCT FROM OLD.repository_owner OR NEW.repository_name IS DISTINCT FROM OLD.repository_name OR NEW.object_number IS DISTINCT FROM OLD.object_number OR NEW.url IS DISTINCT FROM OLD.url OR NEW.valid_from IS DISTINCT FROM OLD.valid_from OR NEW.valid_until IS NULL OR OLD.valid_until IS NOT NULL OR NEW.valid_until <= OLD.valid_from) THEN RAISE EXCEPTION 'only an open coordinate can be closed'; END IF;
      RETURN NEW;
    END $$;


--
-- Name: fn_guard_github_object_identity(); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.fn_guard_github_object_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'tickets'
    AS $$
    BEGIN IF NEW.github_node_id IS DISTINCT FROM OLD.github_node_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.provider_ref IS DISTINCT FROM OLD.provider_ref THEN RAISE EXCEPTION 'github object identity is immutable'; END IF; RETURN NEW; END $$;


--
-- Name: fn_guard_github_relation_history(); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.fn_guard_github_relation_history() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'tickets'
    AS $$
    BEGIN RAISE EXCEPTION 'github relation history is append-only'; END $$;


--
-- Name: fn_guard_work_item_ref(); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.fn_guard_work_item_ref() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'tickets'
    AS $$
    DECLARE object_kind text; BEGIN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'work item reference history is append-only'; END IF;
      SELECT kind INTO object_kind FROM tickets.github_objects WHERE id=NEW.github_object_id;
      IF object_kind = 'pull_request' THEN RAISE EXCEPTION 'pull requests cannot be work item references'; END IF;
      IF TG_OP = 'INSERT' AND NEW.role='alias' AND (NEW.reason IS NULL OR btrim(NEW.reason)='') THEN RAISE EXCEPTION 'aliases require a reason'; END IF;
      IF TG_OP = 'UPDATE' AND (OLD.role <> 'canonical' OR OLD.valid_until IS NOT NULL OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.github_object_id IS DISTINCT FROM OLD.github_object_id OR NEW.role IS DISTINCT FROM OLD.role OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.valid_from IS DISTINCT FROM OLD.valid_from OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.valid_until IS NULL OR NEW.valid_until <= OLD.valid_from) THEN RAISE EXCEPTION 'only an open canonical reference can be closed'; END IF;
      RETURN NEW;
    END $$;


--
-- Name: fn_lifecycle_ts(); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.fn_lifecycle_ts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
    END $$;


--
-- Name: fn_prevent_cycle(); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.fn_prevent_cycle() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
    END $$;


--
-- Name: fn_purge_test_data(); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.fn_purge_test_data() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'tickets'
    AS $_$
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
  has_qts           BOOLEAN;
  has_assignments   BOOLEAN;
  has_test_evidence BOOLEAN;
  has_test_fixtures BOOLEAN;
  has_templates     BOOLEAN;
  has_systest_out   BOOLEAN;
  has_systest_tok   BOOLEAN;
  has_inbox_flag    BOOLEAN;
  has_thread_flag   BOOLEAN;
  has_messages_flag BOOLEAN;
  has_coaching_flag BOOLEAN;
  has_is_test_data  BOOLEAN;
  has_billing_test  BOOLEAN;
  has_billing_cust_test BOOLEAN;
  has_billing_audit BOOLEAN;
  has_billing_dunnings  BOOLEAN;
  has_billing_payments  BOOLEAN;
  has_billing_lines BOOLEAN;
  cust_sql          TEXT;
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
  -- T015362: Spalten-Probes fuer den Billing-Testdaten-Sweep. Fehlt die
  -- Kennzeichnung (altes Schema), bleibt es beim bisherigen Schutz — der
  -- Sweep wird NICHT aggressiver, nur weil die Migration noch nicht lief.
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='billing_invoices' AND column_name='is_test_data')
    INTO has_billing_test;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='billing_customers' AND column_name='is_test_data')
    INTO has_billing_cust_test;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='billing_audit_log')
    INTO has_billing_audit;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='billing_invoice_dunnings')
    INTO has_billing_dunnings;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='billing_invoice_payments')
    INTO has_billing_payments;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='billing_invoice_line_items')
    INTO has_billing_lines;
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
 SELECT to_regclass('questionnaire_test_status') IS NOT NULL INTO has_qts;
 SELECT to_regclass('questionnaire_assignments') IS NOT NULL INTO has_assignments;
 SELECT to_regclass('questionnaire_test_evidence') IS NOT NULL INTO has_test_evidence;
 SELECT to_regclass('questionnaire_test_fixtures') IS NOT NULL INTO has_test_fixtures;
 SELECT to_regclass('questionnaire_templates') IS NOT NULL INTO has_templates;
 SELECT to_regclass('systemtest_failure_outbox') IS NOT NULL INTO has_systest_out;
 SELECT to_regclass('systemtest_magic_tokens') IS NOT NULL INTO has_systest_tok;
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
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='coaching'
                   AND table_name='sessions'
                   AND column_name='is_test_data')
    INTO has_coaching_flag;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='tickets'
                   AND table_name='tickets'
                   AND column_name='is_test_data')
    INTO has_is_test_data;

  ----------------------------------------------------------------------------
  -- 1) Clear FK from questionnaire_test_status to test-data tickets.
  ----------------------------------------------------------------------------
  IF has_qts THEN
    UPDATE questionnaire_test_status
       SET last_failure_ticket_id = NULL
     WHERE last_failure_ticket_id IN (
             SELECT id FROM tickets.tickets WHERE is_test_data = true
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_test_status_cleared', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 2) Null out tickets.source_test_assignment_id refs to test assignments.
  ----------------------------------------------------------------------------
  IF has_src_assn_col AND has_assignments THEN
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
  IF has_qts_evidence AND has_qts AND has_test_evidence AND has_assignments THEN
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
  IF has_test_evidence AND has_assignments THEN
    DELETE FROM questionnaire_test_evidence
     WHERE assignment_id IN (
             SELECT id FROM questionnaire_assignments WHERE is_test_data = true
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_test_evidence', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 4) Delete questionnaire_test_fixtures for test-data assignments.
  ----------------------------------------------------------------------------
  IF has_test_fixtures AND has_assignments THEN
    DELETE FROM questionnaire_test_fixtures
     WHERE assignment_id IN (
             SELECT id FROM questionnaire_assignments WHERE is_test_data = true
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_test_fixtures', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 5) Delete questionnaire_assignment_scores (if table present).
  ----------------------------------------------------------------------------
  IF has_scores AND has_assignments THEN
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
  IF has_answers AND has_assignments THEN
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
  IF has_templates THEN
    DELETE FROM questionnaire_templates WHERE title LIKE 'e2e-%';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_templates', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 7) Delete the test-data assignments themselves.
  ----------------------------------------------------------------------------
  IF has_assignments THEN
    DELETE FROM questionnaire_assignments WHERE is_test_data = true;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_assignments', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 8) Drain transient systemtest plumbing.
  ----------------------------------------------------------------------------
  IF has_systest_out THEN
    DELETE FROM systemtest_failure_outbox;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('systemtest_failure_outbox', cnt);
  END IF;

  IF has_systest_tok THEN
    DELETE FROM systemtest_magic_tokens;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('systemtest_magic_tokens', cnt);
  END IF;

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
  -- 9b) ── Unmarked-canonical-identity sweep (NEW in v5 / T001453). ──────────
  --     Re-mark unmarked rows with suite-only identities, then let the
  --     flag-based deletes below sweep them.
  ----------------------------------------------------------------------------
  UPDATE tickets.tickets
     SET is_test_data = true
   WHERE is_test_data = false
     AND (
           reporter_email ~* '@example\.(com|org|net|invalid)$'
        OR reporter_email ~* '\.invalid$'
        OR title LIKE 'E2E notification test — Playwright%'
         );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('tickets_remarked_unmarked', cnt);

  IF has_inbox_flag THEN
    UPDATE inbox_items
       SET is_test_data = true
     WHERE is_test_data = false
       AND (
             payload->>'email' ~* '@example\.(com|org|net|invalid)$'
          OR payload->>'email' ~* '\.invalid$'
          OR payload->>'name'  =  '[TEST] E2E User'
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('inbox_remarked_unmarked', cnt);
  END IF;

  IF has_coaching_flag THEN
    UPDATE coaching.sessions
       SET is_test_data = true
     WHERE is_test_data = false
       AND (
             title LIKE 'FA-%'
          OR title LIKE 'e2e-%'
          OR title LIKE '%E2E%'
          OR title LIKE 'Session E2E%'
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('coaching_sessions_remarked', cnt);
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
  -- 11e) ── Coaching sessions sweep (NEW in v6 / T001638). ──────────────────
  --     coaching.sessions.is_test_data flags seed/E2E-created sessions.
  --     Guarded by has_coaching_flag: the function may be (re)created before
  --     the 2026-07-08 column migration ran — an unguarded sweep would then
  --     abort the whole purge. Delete child steps first (explicit, for an
  --     auditable count), then the parent sessions.
  ----------------------------------------------------------------------------
  IF has_coaching_flag THEN
    DELETE FROM coaching.session_steps
     USING coaching.sessions s
     WHERE session_id = s.id AND s.is_test_data;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('coaching_session_steps', cnt);

    DELETE FROM coaching.sessions WHERE is_test_data;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('coaching_sessions', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 11f) ── Billing test-data sweep (NEW in v9 / T015362). ──────────────────
  --     Systemtests erzeugten Rechnungen in der Prod-DB; kein Mechanismus
  --     raeumte sie ab, weil (a) die is_test_data-Spalte fehlte und (b) die
  --     GoBD-Trigger jede gelockte Rechnung unantastbar machten. Seit
  --     T015362 markieren die Erzeugungspfade is_test_data=true und die
  --     Trigger exempten Testdaten. Dieser Sweep loescht Kinder zuerst
  --     (audit/dunnings/payments haben FKs ohne CASCADE), dann Positionen,
  --     dann Rechnungen, dann Test-Kunden — ohne Trigger-Deaktivierung.
  ----------------------------------------------------------------------------
  IF has_billing_inv AND has_billing_test THEN
    IF has_billing_audit THEN
      DELETE FROM billing_audit_log a USING billing_invoices bi
       WHERE a.invoice_id = bi.id AND bi.is_test_data;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('billing_audit_log', cnt);
    END IF;

    IF has_billing_dunnings THEN
      DELETE FROM billing_invoice_dunnings d USING billing_invoices bi
       WHERE d.invoice_id = bi.id AND bi.is_test_data;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('billing_invoice_dunnings', cnt);
    END IF;

    IF has_billing_payments THEN
      DELETE FROM billing_invoice_payments p USING billing_invoices bi
       WHERE p.invoice_id = bi.id AND bi.is_test_data;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('billing_invoice_payments', cnt);
    END IF;

    IF has_billing_lines THEN
      DELETE FROM billing_invoice_line_items li USING billing_invoices bi
       WHERE li.invoice_id = bi.id AND bi.is_test_data;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('billing_invoice_line_items', cnt);
    END IF;

    DELETE FROM billing_invoices WHERE is_test_data;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('billing_invoices', cnt);
  END IF;

  IF has_billing_cust_test THEN
    DELETE FROM billing_customers WHERE is_test_data;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('billing_customers', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 12) Customer allowlist sweep.
  --
  --     Dynamisch zusammengesetzt (T002894). Ein fehlendes optionales Relation
  --     laesst sich NICHT per Boolescher Kurzschluss-Bedingung entschaerfen —
  --     die frueher hier stehende Form
  --         AND (NOT has_billing_inv OR NOT EXISTS (SELECT 1 FROM billing_invoices ...))
  --     hat nie geschuetzt: PostgreSQL loest Relationsnamen beim Parsen/Planen
  --     auf, also BEVOR irgendein Boolescher Ausdruck ausgewertet wird. Fehlt
  --     die Tabelle, scheitert das Statement mit
  --     `relation "billing_invoices" does not exist`, unabhaengig vom Wert von
  --     has_billing_inv. Der Guard muss deshalb den TEXT des Statements
  --     steuern, nicht seinen Wahrheitswert.
  --
  --     Weglassen ist semantisch exakt: existiert die Tabelle nicht, kann kein
  --     Kunde eine Zeile darin haben, die NOT EXISTS-Bedingung waere ohnehin
  --     TRUE, und `TRUE AND x` ist `x`. Der Sweep wird durch das Weglassen also
  --     nicht aggressiver — was hier zaehlt, weil das Statement `customers`
  --     loescht.
  --
  --     T015362: Testrechnungen schuetzen den Kunden nicht mehr. Der Guard
  --     zaehlt nur noch Echtrechnungen (`bi.is_test_data = false`); ein Kunde,
  --     dessen Rechnungen ausschliesslich Testdaten sind, wird mitgesweeped.
  --     Fehlt die Spalte (has_billing_test = false), greift der alte Schutz
  --     weiter — das Statement darf auf Bestaenden ohne Migration nicht an
  --     `column "is_test_data" does not exist` scheitern.
  ----------------------------------------------------------------------------
  cust_sql :=
    'DELETE FROM customers c'
    || ' WHERE c.email <> ALL ($1)'
    || '   AND NOT EXISTS (SELECT 1 FROM meetings m           WHERE m.customer_id      = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM chat_room_members    WHERE customer_id        = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM chat_messages        WHERE sender_customer_id = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM chat_message_reads   WHERE customer_id        = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM chat_rooms           WHERE direct_customer_id = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM document_assignments WHERE customer_id        = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM message_threads      WHERE customer_id        = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM messages             WHERE sender_customer_id = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM brett_snapshots      WHERE customer_id        = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM tickets.tickets      WHERE customer_id        = c.id)';

  IF has_billing_inv AND has_billing_test THEN
    cust_sql := cust_sql
      || '   AND NOT EXISTS (SELECT 1 FROM billing_invoices bi'
      || '                 WHERE bi.customer_id = c.id::text AND bi.is_test_data = false)';
  ELSIF has_billing_inv THEN
    -- Fallback ohne is_test_data-Spalte: alter Schutz (jede Rechnung schuetzt).
    cust_sql := cust_sql
      || '   AND NOT EXISTS (SELECT 1 FROM billing_invoices bi WHERE bi.customer_id = c.id::text)';
  END IF;

  IF has_assignments THEN
    cust_sql := cust_sql
      || '   AND NOT EXISTS (SELECT 1 FROM questionnaire_assignments WHERE customer_id = c.id)';
  END IF;

  EXECUTE cust_sql USING keep_emails;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('customers', cnt);

  RETURN result;
END;
$_$;


--
-- Name: FUNCTION fn_purge_test_data(); Type: COMMENT; Schema: tickets; Owner: -
--

COMMENT ON FUNCTION tickets.fn_purge_test_data() IS 'Idempotent test-data purge. v8 (2026-08-09, T002894): adds to_regclass guards for all tables absent on local k3d dev (questionnaire + systemtest schemas — 7 tables).';


--
-- Name: fn_validate_github_relation(); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.fn_validate_github_relation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'tickets'
    AS $$
    DECLARE from_kind text; to_kind text; has_cycle boolean; BEGIN
      SELECT kind INTO from_kind FROM tickets.github_objects WHERE id=NEW.from_object_id;
      SELECT kind INTO to_kind FROM tickets.github_objects WHERE id=NEW.to_object_id;
      IF NEW.kind IN ('implements','closes') AND (from_kind <> 'pull_request' OR to_kind NOT IN ('issue','advisory')) THEN RAISE EXCEPTION 'delivery relations require pull request to issue or advisory'; END IF;
      IF NEW.kind IN ('duplicate_of','replaces','transferred_to') AND from_kind <> to_kind THEN RAISE EXCEPTION 'redirect relations require equal object kinds'; END IF;
      IF NEW.kind IN ('duplicate_of','replaces','transferred_to') THEN
        PERFORM pg_advisory_xact_lock(hashtext('tickets:github-identity-redirects'));
        WITH RECURSIVE walk(id) AS (SELECT NEW.to_object_id UNION SELECT r.to_object_id FROM tickets.github_object_relations r JOIN walk w ON r.from_object_id=w.id WHERE r.kind IN ('duplicate_of','replaces','transferred_to')) SELECT EXISTS(SELECT 1 FROM walk WHERE id=NEW.from_object_id) INTO has_cycle;
        IF has_cycle THEN RAISE EXCEPTION 'redirect relation would create a cycle'; END IF;
      END IF; RETURN NEW;
    END $$;


--
-- Name: notify_feature_inserted(); Type: FUNCTION; Schema: tickets; Owner: -
--

CREATE FUNCTION tickets.notify_feature_inserted() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      PERFORM pg_notify('factory_feature_inserted', NEW.external_id);
      RETURN NEW;
    END;
    $$;


--
-- Name: dossiers; Type: TABLE; Schema: applications; Owner: -
--

CREATE TABLE applications.dossiers (
    id integer NOT NULL,
    job_id integer NOT NULL,
    artifact_path text NOT NULL,
    kind text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dossiers_kind_check CHECK ((kind = ANY (ARRAY['resume'::text, 'cover_letter'::text])))
);


--
-- Name: dossiers_id_seq; Type: SEQUENCE; Schema: applications; Owner: -
--

CREATE SEQUENCE applications.dossiers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dossiers_id_seq; Type: SEQUENCE OWNED BY; Schema: applications; Owner: -
--

ALTER SEQUENCE applications.dossiers_id_seq OWNED BY applications.dossiers.id;


--
-- Name: jobs; Type: TABLE; Schema: applications; Owner: -
--

CREATE TABLE applications.jobs (
    id integer NOT NULL,
    company text NOT NULL,
    role_title text NOT NULL,
    source_url text,
    raw_text text NOT NULL,
    requirements text,
    status text DEFAULT 'found'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    match_score numeric(5,2),
    match_evidence_ids text[],
    CONSTRAINT jobs_status_check CHECK ((status = ANY (ARRAY['found'::text, 'drafting'::text, 'applied'::text, 'interviewing'::text, 'offered'::text, 'rejected'::text, 'withdrawn'::text])))
);


--
-- Name: jobs_id_seq; Type: SEQUENCE; Schema: applications; Owner: -
--

CREATE SEQUENCE applications.jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: applications; Owner: -
--

ALTER SEQUENCE applications.jobs_id_seq OWNED BY applications.jobs.id;


--
-- Name: timeline; Type: TABLE; Schema: applications; Owner: -
--

CREATE TABLE applications.timeline (
    id integer NOT NULL,
    job_id integer NOT NULL,
    event_type text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: timeline_id_seq; Type: SEQUENCE; Schema: applications; Owner: -
--

CREATE SEQUENCE applications.timeline_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: timeline_id_seq; Type: SEQUENCE OWNED BY; Schema: applications; Owner: -
--

ALTER SEQUENCE applications.timeline_id_seq OWNED BY applications.timeline.id;


--
-- Name: generation_jobs; Type: TABLE; Schema: assets; Owner: -
--

CREATE TABLE assets.generation_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    prompt_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    skin_id text,
    error_msg text,
    created_at timestamp with time zone DEFAULT now(),
    stage text DEFAULT 'queued'::text NOT NULL,
    CONSTRAINT generation_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'error'::text])))
);


--
-- Name: registry; Type: TABLE; Schema: assets; Owner: -
--

CREATE TABLE assets.registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type assets.asset_type NOT NULL,
    file_path text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_log; Type: TABLE; Schema: audit; Owner: -
--

CREATE TABLE audit.audit_log (
    id bigint NOT NULL,
    actor_id text,
    actor_email text,
    action text NOT NULL,
    target_type text,
    target_id text,
    ip inet,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: audit; Owner: -
--

CREATE SEQUENCE audit.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: audit; Owner: -
--

ALTER SEQUENCE audit.audit_log_id_seq OWNED BY audit.audit_log.id;


--
-- Name: components; Type: TABLE; Schema: bachelorprojekt; Owner: -
--

CREATE TABLE bachelorprojekt.components (
    id bigint NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    area text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    cluster text DEFAULT 'both'::text NOT NULL,
    url text,
    hostname text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT components_cluster_check CHECK ((cluster = ANY (ARRAY['mentolder'::text, 'korczewski'::text, 'both'::text]))),
    CONSTRAINT components_kind_check CHECK ((kind = ANY (ARRAY['physical'::text, 'non-physical'::text]))),
    CONSTRAINT components_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'deprecated'::text])))
);


--
-- Name: components_id_seq; Type: SEQUENCE; Schema: bachelorprojekt; Owner: -
--

CREATE SEQUENCE bachelorprojekt.components_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: components_id_seq; Type: SEQUENCE OWNED BY; Schema: bachelorprojekt; Owner: -
--

ALTER SEQUENCE bachelorprojekt.components_id_seq OWNED BY bachelorprojekt.components.id;


--
-- Name: features; Type: TABLE; Schema: bachelorprojekt; Owner: -
--

CREATE TABLE bachelorprojekt.features (
    id integer NOT NULL,
    pr_number integer,
    title text NOT NULL,
    description text,
    category text DEFAULT 'feature'::text NOT NULL,
    scope text,
    brand text,
    requirement_id text,
    merged_at timestamp with time zone DEFAULT now() NOT NULL,
    merged_by text,
    status text DEFAULT 'merged'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: features_id_seq; Type: SEQUENCE; Schema: bachelorprojekt; Owner: -
--

CREATE SEQUENCE bachelorprojekt.features_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: features_id_seq; Type: SEQUENCE OWNED BY; Schema: bachelorprojekt; Owner: -
--

ALTER SEQUENCE bachelorprojekt.features_id_seq OWNED BY bachelorprojekt.features.id;


--
-- Name: pipeline; Type: TABLE; Schema: bachelorprojekt; Owner: -
--

CREATE TABLE bachelorprojekt.pipeline (
    id integer NOT NULL,
    req_id text NOT NULL,
    stage text NOT NULL,
    entered_at timestamp with time zone DEFAULT now(),
    notes text,
    CONSTRAINT pipeline_stage_check CHECK ((stage = ANY (ARRAY['idea'::text, 'implementation'::text, 'testing'::text, 'documentation'::text, 'archive'::text])))
);


--
-- Name: pipeline_id_seq; Type: SEQUENCE; Schema: bachelorprojekt; Owner: -
--

CREATE SEQUENCE bachelorprojekt.pipeline_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pipeline_id_seq; Type: SEQUENCE OWNED BY; Schema: bachelorprojekt; Owner: -
--

ALTER SEQUENCE bachelorprojekt.pipeline_id_seq OWNED BY bachelorprojekt.pipeline.id;


--
-- Name: requirements; Type: TABLE; Schema: bachelorprojekt; Owner: -
--

CREATE TABLE bachelorprojekt.requirements (
    id text NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    description text,
    criteria text,
    test_case text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: software_events; Type: TABLE; Schema: bachelorprojekt; Owner: -
--

CREATE TABLE bachelorprojekt.software_events (
    id bigint NOT NULL,
    pr_number integer NOT NULL,
    service text NOT NULL,
    area text NOT NULL,
    kind text NOT NULL,
    confidence numeric(3,2) DEFAULT 1.0 NOT NULL,
    classifier text NOT NULL,
    classified_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT software_events_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT software_events_kind_check CHECK ((kind = ANY (ARRAY['added'::text, 'removed'::text, 'changed'::text, 'irrelevant'::text])))
);


--
-- Name: software_events_id_seq; Type: SEQUENCE; Schema: bachelorprojekt; Owner: -
--

CREATE SEQUENCE bachelorprojekt.software_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: software_events_id_seq; Type: SEQUENCE OWNED BY; Schema: bachelorprojekt; Owner: -
--

ALTER SEQUENCE bachelorprojekt.software_events_id_seq OWNED BY bachelorprojekt.software_events.id;


--
-- Name: test_results; Type: TABLE; Schema: bachelorprojekt; Owner: -
--

CREATE TABLE bachelorprojekt.test_results (
    id integer NOT NULL,
    req_id text NOT NULL,
    result text NOT NULL,
    run_at timestamp with time zone DEFAULT now(),
    details text,
    CONSTRAINT test_results_result_check CHECK ((result = ANY (ARRAY['pass'::text, 'fail'::text, 'skip'::text])))
);


--
-- Name: test_results_id_seq; Type: SEQUENCE; Schema: bachelorprojekt; Owner: -
--

CREATE SEQUENCE bachelorprojekt.test_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: test_results_id_seq; Type: SEQUENCE OWNED BY; Schema: bachelorprojekt; Owner: -
--

ALTER SEQUENCE bachelorprojekt.test_results_id_seq OWNED BY bachelorprojekt.test_results.id;


--
-- Name: v_latest_tests; Type: VIEW; Schema: bachelorprojekt; Owner: -
--

CREATE VIEW bachelorprojekt.v_latest_tests AS
 SELECT DISTINCT ON (req_id) req_id,
    result,
    run_at,
    details
   FROM bachelorprojekt.test_results
  ORDER BY req_id, run_at DESC;


--
-- Name: v_pipeline_status; Type: VIEW; Schema: bachelorprojekt; Owner: -
--

CREATE VIEW bachelorprojekt.v_pipeline_status AS
 SELECT r.id,
    r.name,
    r.category,
    COALESCE(p.stage, 'idea'::text) AS current_stage,
    p.entered_at AS stage_since
   FROM (bachelorprojekt.requirements r
     LEFT JOIN bachelorprojekt.pipeline p ON (((p.req_id = r.id) AND (p.entered_at = ( SELECT max(p2.entered_at) AS max
           FROM bachelorprojekt.pipeline p2
          WHERE (p2.req_id = r.id))))));


--
-- Name: v_open_issues; Type: VIEW; Schema: bachelorprojekt; Owner: -
--

CREATE VIEW bachelorprojekt.v_open_issues AS
 SELECT id,
    name,
    category,
    current_stage,
    stage_since
   FROM bachelorprojekt.v_pipeline_status
  WHERE (current_stage <> 'archive'::text)
  ORDER BY category, id;


--
-- Name: v_progress_summary; Type: VIEW; Schema: bachelorprojekt; Owner: -
--

CREATE VIEW bachelorprojekt.v_progress_summary AS
 SELECT current_stage AS stage,
    count(*) AS count
   FROM bachelorprojekt.v_pipeline_status
  GROUP BY current_stage
  ORDER BY (array_position(ARRAY['idea'::text, 'implementation'::text, 'testing'::text, 'documentation'::text, 'archive'::text], current_stage));


--
-- Name: questionnaire_assignment_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_assignment_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    dimension_id uuid NOT NULL,
    final_score integer NOT NULL,
    threshold_mid integer,
    threshold_high integer,
    level text,
    snapshot_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: questionnaire_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    template_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    coach_notes text DEFAULT ''::text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    dismiss_reason text,
    project_id uuid,
    archived_at timestamp with time zone,
    is_test_data boolean DEFAULT false NOT NULL
);


--
-- Name: questionnaire_dimensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_dimensions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    threshold_mid integer,
    threshold_high integer,
    score_multiplier integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: questionnaire_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_system_test boolean DEFAULT false NOT NULL
);


--
-- Name: questionnaire_test_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_test_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    question_id uuid NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    replay_path text,
    partial boolean DEFAULT false NOT NULL,
    console_log jsonb,
    network_log jsonb,
    recorded_from timestamp with time zone,
    recorded_to timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: v_questionnaire_kpi; Type: VIEW; Schema: bachelorprojekt; Owner: -
--

CREATE VIEW bachelorprojekt.v_questionnaire_kpi AS
 SELECT a.id AS assignment_id,
    a.customer_id,
    a.template_id,
    t.title AS template_title,
    t.is_system_test,
    a.assigned_at,
    a.submitted_at,
    a.archived_at,
    s.dimension_id,
    d.name AS dimension_name,
    s.final_score,
    s.threshold_mid,
    s.threshold_high,
    s.level,
    ev.evidence_count,
    ev.latest_evidence_id
   FROM ((((public.questionnaire_assignments a
     JOIN public.questionnaire_templates t ON ((t.id = a.template_id)))
     JOIN public.questionnaire_assignment_scores s ON ((s.assignment_id = a.id)))
     JOIN public.questionnaire_dimensions d ON ((d.id = s.dimension_id)))
     LEFT JOIN LATERAL ( SELECT (count(*))::integer AS evidence_count,
            (array_agg(e.id ORDER BY e.attempt DESC, e.created_at DESC))[1] AS latest_evidence_id
           FROM public.questionnaire_test_evidence e
          WHERE (e.assignment_id = a.id)) ev ON (true))
  WHERE (a.status = 'archived'::text);


--
-- Name: v_software_history; Type: VIEW; Schema: bachelorprojekt; Owner: -
--

CREATE VIEW bachelorprojekt.v_software_history AS
 SELECT e.id,
    e.pr_number,
    f.merged_at,
    f.title,
    f.brand,
    f.merged_by,
    e.service,
    e.area,
    e.kind,
    e.confidence,
    e.classifier,
    e.classified_at,
    e.notes
   FROM (bachelorprojekt.software_events e
     JOIN bachelorprojekt.features f ON ((f.pr_number = e.pr_number)))
  WHERE (e.kind <> 'irrelevant'::text)
  ORDER BY f.merged_at DESC, e.id DESC;


--
-- Name: v_software_stack; Type: VIEW; Schema: bachelorprojekt; Owner: -
--

CREATE VIEW bachelorprojekt.v_software_stack AS
 WITH last_event AS (
         SELECT DISTINCT ON (software_events.service) software_events.service,
            software_events.area,
            software_events.kind,
            software_events.classified_at,
            software_events.pr_number
           FROM bachelorprojekt.software_events
          WHERE (software_events.kind <> 'irrelevant'::text)
          ORDER BY software_events.service, software_events.classified_at DESC, software_events.id DESC
        )
 SELECT service,
    area,
    classified_at AS as_of,
    pr_number AS last_pr
   FROM last_event
  WHERE (kind <> 'removed'::text)
  ORDER BY area, service;


--
-- Name: v_timeline; Type: VIEW; Schema: bachelorprojekt; Owner: -
--

CREATE VIEW bachelorprojekt.v_timeline AS
 SELECT f.id,
    (f.merged_at)::date AS day,
    f.merged_at,
    f.pr_number,
    f.title,
    f.description,
    f.category,
    f.scope,
    f.brand,
    f.requirement_id,
    r.name AS requirement_name,
    r.category AS requirement_category
   FROM (bachelorprojekt.features f
     LEFT JOIN bachelorprojekt.requirements r ON ((r.id = f.requirement_id)))
  ORDER BY f.merged_at DESC;


--
-- Name: board_templates; Type: TABLE; Schema: brett; Owner: -
--

CREATE TABLE brett.board_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand text NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    state jsonb NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_by_user text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    CONSTRAINT board_templates_category_check CHECK ((char_length(category) <= 50)),
    CONSTRAINT board_templates_description_check CHECK ((char_length(description) <= 500)),
    CONSTRAINT board_templates_name_check CHECK ((char_length(name) <= 100)),
    CONSTRAINT chk_brand_board_templates CHECK ((brand = 'mentolder'::text))
);


--
-- Name: coaching_templates; Type: TABLE; Schema: brett; Owner: -
--

CREATE TABLE brett.coaching_templates (
    id text NOT NULL,
    brand text NOT NULL,
    name text NOT NULL,
    description text,
    steps jsonb NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_coaching_templates CHECK ((brand = 'mentolder'::text))
);


--
-- Name: bug_tickets; Type: TABLE; Schema: bugs; Owner: -
--

CREATE TABLE bugs.bug_tickets (
    ticket_id text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    category text NOT NULL,
    reporter_email text NOT NULL,
    description text NOT NULL,
    url text,
    brand text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolution_note text,
    screenshots_json jsonb,
    fixed_in_pr integer,
    fixed_at timestamp with time zone,
    CONSTRAINT bug_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'archived'::text])))
);


--
-- Name: books; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.books (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    knowledge_collection_id uuid NOT NULL,
    title text NOT NULL,
    author text,
    source_filename text NOT NULL,
    license_note text,
    ingested_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: drafts; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    knowledge_chunk_id uuid NOT NULL,
    template_kind text NOT NULL,
    suggested_payload jsonb NOT NULL,
    classifier_model text NOT NULL,
    classifier_version text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    reject_reason text,
    resulting_snippet_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT drafts_status_check CHECK ((status = ANY (ARRAY['open'::text, 'accepted'::text, 'rejected'::text, 'skipped'::text]))),
    CONSTRAINT drafts_template_kind_check CHECK ((template_kind = ANY (ARRAY['reflection'::text, 'dialog_pattern'::text, 'exercise'::text, 'case_example'::text])))
);


--
-- Name: ki_config; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.ki_config (
    id integer NOT NULL,
    brand text NOT NULL,
    provider text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    model_name text,
    display_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    api_key text,
    api_endpoint text,
    temperature numeric(5,3),
    max_tokens integer,
    top_p numeric(5,3),
    system_prompt text,
    notes text,
    top_k integer,
    thinking_mode boolean DEFAULT false NOT NULL,
    presence_penalty numeric(5,3),
    frequency_penalty numeric(5,3),
    safe_prompt boolean DEFAULT false NOT NULL,
    random_seed integer,
    organization_id text,
    eu_endpoint boolean DEFAULT false NOT NULL,
    enabled_fields jsonb,
    CONSTRAINT chk_brand_ki_config CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: ki_config_id_seq; Type: SEQUENCE; Schema: coaching; Owner: -
--

CREATE SEQUENCE coaching.ki_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ki_config_id_seq; Type: SEQUENCE OWNED BY; Schema: coaching; Owner: -
--

ALTER SEQUENCE coaching.ki_config_id_seq OWNED BY coaching.ki_config.id;


--
-- Name: projects; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand text NOT NULL,
    client_id uuid,
    customer_number text NOT NULL,
    display_alias text,
    ki_context text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_coaching_projects CHECK ((brand = 'mentolder'::text))
);


--
-- Name: questionnaire_insights_cache; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.questionnaire_insights_cache (
    key text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session_audit_log; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.session_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    event_type text NOT NULL,
    actor text NOT NULL,
    step_number integer,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT session_audit_log_event_type_check CHECK ((event_type = ANY (ARRAY['status_change'::text, 'field_change'::text, 'ai_request'::text, 'notes_change'::text])))
);


--
-- Name: session_steps; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.session_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    step_number integer NOT NULL,
    step_name text NOT NULL,
    phase text NOT NULL,
    coach_inputs jsonb DEFAULT '{}'::jsonb NOT NULL,
    ai_prompt text,
    ai_response text,
    coach_notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    generated_at timestamp with time zone,
    CONSTRAINT session_steps_phase_check CHECK ((phase = ANY (ARRAY['problem_ziel'::text, 'analyse'::text, 'loesung'::text, 'umsetzung'::text]))),
    CONSTRAINT session_steps_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'generated'::text, 'accepted'::text, 'skipped'::text])))
);


--
-- Name: sessions; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand text DEFAULT 'mentolder'::text NOT NULL,
    client_id uuid,
    client_name text,
    mode text DEFAULT 'live'::text NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    archived_at timestamp with time zone,
    ki_config_id integer,
    project_id uuid,
    is_test_data boolean DEFAULT false NOT NULL,
    llm_summary text,
    llm_summary_at timestamp with time zone,
    CONSTRAINT chk_brand_coaching_sessions CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text]))),
    CONSTRAINT sessions_mode_check CHECK ((mode = ANY (ARRAY['live'::text, 'prep'::text]))),
    CONSTRAINT sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'abandoned'::text])))
);


--
-- Name: snippet_clusters; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.snippet_clusters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid,
    name text NOT NULL,
    kind text DEFAULT 'manual'::text NOT NULL,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT snippet_clusters_kind_check CHECK ((kind = ANY (ARRAY['auto'::text, 'manual'::text])))
);


--
-- Name: snippets; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.snippets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    knowledge_chunk_id uuid,
    cluster_id uuid,
    title text NOT NULL,
    body text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    page integer,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_from_draft uuid
);


--
-- Name: step_templates; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.step_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand text NOT NULL,
    step_number integer NOT NULL,
    step_name text NOT NULL,
    phase text NOT NULL,
    system_prompt text NOT NULL,
    user_prompt_tpl text NOT NULL,
    input_schema jsonb DEFAULT '[]'::jsonb NOT NULL,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_coaching_step_templates CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text]))),
    CONSTRAINT step_templates_phase_check CHECK ((phase = ANY (ARRAY['problem_ziel'::text, 'analyse'::text, 'loesung'::text, 'umsetzung'::text])))
);


--
-- Name: template_assignments; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.template_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    template_version integer NOT NULL,
    client_id text NOT NULL,
    surface_specific_id text,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: templates; Type: TABLE; Schema: coaching; Owner: -
--

CREATE TABLE coaching.templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snippet_id uuid NOT NULL,
    target_surface text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_pointer jsonb NOT NULL,
    surface_ref text,
    published_at timestamp with time zone,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT templates_target_surface_check CHECK ((target_surface = ANY (ARRAY['questionnaire'::text, 'brett'::text, 'chatroom'::text, 'assistant'::text])))
);


--
-- Name: chunks; Type: TABLE; Schema: knowledge; Owner: -
--

CREATE TABLE knowledge.chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    "position" integer NOT NULL,
    text text NOT NULL,
    embedding public.vector(1024),
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: collections; Type: TABLE; Schema: knowledge; Owner: -
--

CREATE TABLE knowledge.collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    source text NOT NULL,
    crawl_config jsonb,
    brand text,
    chunk_count integer DEFAULT 0 NOT NULL,
    last_indexed_at timestamp with time zone,
    embedding_model text DEFAULT 'voyage-multilingual-2'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_brand_collections CHECK ((brand = 'mentolder'::text)),
    CONSTRAINT collections_source_check CHECK ((source = ANY (ARRAY['pr_history'::text, 'specs_plans'::text, 'claude_md'::text, 'bug_tickets'::text, 'custom'::text, 'web_crawl'::text, 'context7_docs'::text, 'specs_ssot'::text, 'docs'::text])))
);


--
-- Name: documents; Type: TABLE; Schema: knowledge; Owner: -
--

CREATE TABLE knowledge.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_id uuid NOT NULL,
    title text NOT NULL,
    source_uri text,
    raw_text text NOT NULL,
    sha256 text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: adapters; Type: TABLE; Schema: model_registry; Owner: -
--

CREATE TABLE model_registry.adapters (
    id integer NOT NULL,
    name text NOT NULL,
    base_model text NOT NULL,
    quantization text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: adapters_id_seq; Type: SEQUENCE; Schema: model_registry; Owner: -
--

CREATE SEQUENCE model_registry.adapters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: adapters_id_seq; Type: SEQUENCE OWNED BY; Schema: model_registry; Owner: -
--

ALTER SEQUENCE model_registry.adapters_id_seq OWNED BY model_registry.adapters.id;


--
-- Name: deployment_config; Type: TABLE; Schema: model_registry; Owner: -
--

CREATE TABLE model_registry.deployment_config (
    adapter_id integer NOT NULL,
    chat_template text,
    stop_tokens text[],
    temperature double precision,
    top_p double precision,
    loadout_json jsonb
);


--
-- Name: eval_scores; Type: TABLE; Schema: model_registry; Owner: -
--

CREATE TABLE model_registry.eval_scores (
    adapter_id integer NOT NULL,
    role text NOT NULL,
    score double precision NOT NULL,
    harness_version text,
    evaluated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT eval_scores_score_check CHECK (((score >= (0)::double precision) AND (score <= (1)::double precision))),
    CONSTRAINT eval_scores_score_range_check CHECK (((score >= (0)::double precision) AND (score <= (1)::double precision)))
);


--
-- Name: provenance; Type: TABLE; Schema: model_registry; Owner: -
--

CREATE TABLE model_registry.provenance (
    adapter_id integer NOT NULL,
    training_corpus text,
    lora_rank integer,
    lora_alpha integer,
    git_commit text,
    training_config jsonb
);


--
-- Name: stat_requirements; Type: TABLE; Schema: model_registry; Owner: -
--

CREATE TABLE model_registry.stat_requirements (
    adapter_id integer NOT NULL,
    vram_mb integer,
    max_context integer,
    throughput_toks double precision,
    load_time_ms integer
);


--
-- Name: hardware_assets; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE platform.hardware_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    role text NOT NULL,
    cluster text NOT NULL,
    location text,
    ip text,
    os text,
    k8s_node_name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: software_assets; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE platform.software_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    category text DEFAULT 'other'::text NOT NULL,
    emoji text DEFAULT '📦'::text NOT NULL,
    clusters text[] DEFAULT '{}'::text[] NOT NULL,
    namespace text,
    deployment_name text,
    image_tag text,
    url text,
    base_status text DEFAULT 'live'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subdomain text,
    health_url text
);


--
-- Name: __t006335_ro_probe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.__t006335_ro_probe (
    probe_id integer
);


--
-- Name: admin_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_actions (
    id integer NOT NULL,
    actor text NOT NULL,
    action text NOT NULL,
    target text,
    cluster text,
    payload jsonb,
    status text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT admin_actions_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'success'::text, 'failed'::text, 'partial_success'::text])))
);


--
-- Name: admin_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_actions_id_seq OWNED BY public.admin_actions.id;


--
-- Name: admin_shortcuts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_shortcuts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    url text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_call_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_call_log (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    workflow text NOT NULL,
    model text,
    prompt_tokens integer,
    completion_tokens integer,
    latency_ms integer NOT NULL,
    error text,
    user_sub text,
    metadata jsonb
);


--
-- Name: ai_call_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_call_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_call_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_call_log_id_seq OWNED BY public.ai_call_log.id;


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id bigint NOT NULL,
    brand text NOT NULL,
    description text NOT NULL,
    purchase_date date NOT NULL,
    net_purchase_price numeric(12,2) NOT NULL,
    vat_paid numeric(12,2) NOT NULL,
    useful_life_months integer NOT NULL,
    correction_start_date date,
    is_gwg boolean DEFAULT false NOT NULL,
    receipt_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_assets CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assets_id_seq OWNED BY public.assets.id;


--
-- Name: assistant_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_sub text NOT NULL,
    profile text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_active_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assistant_conversations_profile_check CHECK ((profile = ANY (ARRAY['admin'::text, 'portal'::text])))
);


--
-- Name: assistant_first_seen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_first_seen (
    user_sub text NOT NULL,
    profile text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assistant_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    proposed_action jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assistant_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: assistant_nudge_dismissals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_nudge_dismissals (
    user_sub text NOT NULL,
    nudge_id text NOT NULL,
    snoozed_until timestamp with time zone NOT NULL
);


--
-- Name: billing_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_audit_log (
    id bigint NOT NULL,
    invoice_id text NOT NULL,
    action text NOT NULL,
    actor_user_id text,
    actor_email text,
    from_status text,
    to_status text,
    reason text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.billing_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: billing_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.billing_audit_log_id_seq OWNED BY public.billing_audit_log.id;


--
-- Name: billing_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_customers (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    brand text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    company text,
    address_line1 text,
    city text,
    postal_code text,
    land_iso character(2) DEFAULT 'DE'::bpchar NOT NULL,
    vat_number text,
    sepa_iban text,
    sepa_bic text,
    sepa_mandate_ref text,
    sepa_mandate_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    typ text DEFAULT 'Kunde'::text NOT NULL,
    default_leitweg_id text,
    customers_id uuid,
    leitweg_id character varying(46),
    is_test_data boolean DEFAULT false NOT NULL,
    CONSTRAINT billing_customers_typ_chk CHECK ((typ = 'Kunde'::text)),
    CONSTRAINT chk_brand_billing_customers CHECK ((brand = 'mentolder'::text))
);


--
-- Name: billing_invoice_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_invoice_documents (
    invoice_id text NOT NULL,
    format text NOT NULL,
    content bytea NOT NULL
);


--
-- Name: billing_invoice_dunnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_invoice_dunnings (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    invoice_id text NOT NULL,
    brand text NOT NULL,
    level smallint NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    sent_by text,
    fee_amount numeric(12,2) DEFAULT 0 NOT NULL,
    interest_amount numeric(12,2) DEFAULT 0 NOT NULL,
    outstanding_at_generation numeric(12,2) NOT NULL,
    pdf_path text,
    CONSTRAINT chk_brand_billing_invoice_dunnings CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: billing_invoice_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_invoice_line_items (
    id bigint NOT NULL,
    invoice_id text NOT NULL,
    description text NOT NULL,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    unit text,
    unit_price numeric(12,2) NOT NULL,
    net_amount numeric(12,2) NOT NULL,
    is_test_data boolean DEFAULT false NOT NULL
);


--
-- Name: billing_invoice_line_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.billing_invoice_line_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: billing_invoice_line_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.billing_invoice_line_items_id_seq OWNED BY public.billing_invoice_line_items.id;


--
-- Name: billing_invoice_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_invoice_payments (
    id bigint NOT NULL,
    invoice_id text NOT NULL,
    brand text NOT NULL,
    paid_at date NOT NULL,
    amount numeric(12,2) NOT NULL,
    method text NOT NULL,
    reference text,
    recorded_by text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_currency_rate numeric(12,6),
    CONSTRAINT billing_invoice_payments_amount_check CHECK ((amount <> (0)::numeric)),
    CONSTRAINT chk_brand_billing_invoice_payments CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: billing_invoice_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.billing_invoice_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: billing_invoice_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.billing_invoice_payments_id_seq OWNED BY public.billing_invoice_payments.id;


--
-- Name: billing_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_invoices (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    brand text NOT NULL,
    number text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    customer_id text NOT NULL,
    issue_date date NOT NULL,
    due_date date NOT NULL,
    service_period_start date,
    service_period_end date,
    tax_mode text NOT NULL,
    net_amount numeric(12,2) NOT NULL,
    tax_rate numeric(5,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
    gross_amount numeric(12,2) NOT NULL,
    notes text,
    payment_reference text,
    locked boolean DEFAULT false NOT NULL,
    cancels_invoice_id text,
    retain_until date DEFAULT (CURRENT_DATE + '10 years'::interval) NOT NULL,
    pdf_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    leitweg_id text,
    einvoice_validated_at timestamp with time zone,
    einvoice_validation_report jsonb,
    kind text DEFAULT 'regular'::text NOT NULL,
    parent_invoice_id text,
    currency character(3) DEFAULT 'EUR'::bpchar NOT NULL,
    currency_rate numeric(12,6),
    net_amount_eur numeric(12,2),
    gross_amount_eur numeric(12,2),
    supply_type text,
    hash_sha256 text,
    pdf_mime text,
    pdf_size_bytes integer,
    finalized_at timestamp with time zone,
    is_test_data boolean DEFAULT false NOT NULL,
    CONSTRAINT billing_invoices_kind_chk CHECK ((kind = ANY (ARRAY['regular'::text, 'prepayment'::text, 'final'::text, 'gutschrift'::text]))),
    CONSTRAINT chk_brand_billing_invoices CHECK ((brand = 'mentolder'::text))
);


--
-- Name: billing_nachweis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_nachweis (
    id bigint NOT NULL,
    invoice_id text NOT NULL,
    brand text NOT NULL,
    type text NOT NULL,
    received_at date,
    document_ref text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_billing_nachweis CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: billing_nachweis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.billing_nachweis_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: billing_nachweis_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.billing_nachweis_id_seq OWNED BY public.billing_nachweis.id;


--
-- Name: billing_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_quotes (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    brand text NOT NULL,
    number text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    customer_id text NOT NULL,
    issue_date date NOT NULL,
    valid_until date,
    net_amount numeric(12,2) NOT NULL,
    tax_rate numeric(5,2) DEFAULT 0 NOT NULL,
    gross_amount numeric(12,2) NOT NULL,
    notes text,
    converted_to_invoice_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_billing_quotes CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: billing_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_suppliers (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    brand text NOT NULL,
    name text NOT NULL,
    email text,
    land_iso character(2) DEFAULT 'DE'::bpchar NOT NULL,
    ustidnr text,
    steuernummer text,
    iban text,
    bic text,
    bank_name text,
    address text,
    typ text DEFAULT 'Lieferant'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_billing_suppliers CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id text NOT NULL,
    name text NOT NULL
);


--
-- Name: brett_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brett_rooms (
    room_token text NOT NULL,
    state jsonb DEFAULT '{"figures": []}'::jsonb NOT NULL,
    last_modified_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: brett_share_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brett_share_tokens (
    token text NOT NULL,
    room_token text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled_at timestamp with time zone,
    expires_at timestamp with time zone,
    token_type text DEFAULT 'share'::text NOT NULL
);


--
-- Name: brett_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brett_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_token text,
    customer_id uuid,
    name text NOT NULL,
    state jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_template boolean DEFAULT false NOT NULL
);


--
-- Name: business_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_memberships (
    user_key text NOT NULL,
    brand text NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_memberships_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text])))
);


--
-- Name: chat_message_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_message_reads (
    message_id integer NOT NULL,
    customer_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id integer NOT NULL,
    room_id integer NOT NULL,
    sender_id text NOT NULL,
    sender_customer_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    notification_sent_at timestamp with time zone
);


--
-- Name: chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;


--
-- Name: chat_room_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_room_members (
    room_id integer NOT NULL,
    customer_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_rooms (
    id integer NOT NULL,
    name text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    archived_at timestamp with time zone,
    is_direct boolean DEFAULT false NOT NULL,
    direct_customer_id uuid
);


--
-- Name: chat_rooms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_rooms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_rooms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_rooms_id_seq OWNED BY public.chat_rooms.id;


--
-- Name: client_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    keycloak_user_id text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: code_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_path text NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    file_hash text NOT NULL,
    embedding public.vector(1024),
    indexed_at timestamp with time zone DEFAULT now()
);


--
-- Name: customer_contact_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_contact_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    keycloak_user_id text NOT NULL,
    contact_type text NOT NULL,
    subject text,
    content text,
    direction text DEFAULT 'outbound'::text,
    admin_id text,
    created_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: customer_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_number_seq
    START WITH 20
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_project_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_project_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    filename text NOT NULL,
    nc_path text,
    data_url text,
    mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
    file_size bigint,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_project_attachments_check CHECK (((nc_path IS NOT NULL) OR (data_url IS NOT NULL)))
);


--
-- Name: customer_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    type text NOT NULL,
    brand text NOT NULL,
    title text NOT NULL,
    description text,
    notes text,
    start_date date,
    due_date date,
    status text DEFAULT 'backlog'::text NOT NULL,
    resolution text,
    priority text DEFAULT 'mittel'::text NOT NULL,
    customer_id uuid,
    assignee_id uuid,
    done_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_customer_projects_brand CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text]))),
    CONSTRAINT customer_projects_priority_check CHECK ((priority = ANY (ARRAY['hoch'::text, 'mittel'::text, 'niedrig'::text]))),
    CONSTRAINT customer_projects_type_check CHECK ((type = ANY (ARRAY['project'::text, 'task'::text])))
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    company text,
    keycloak_user_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    customer_number text DEFAULT ('M'::text || lpad((nextval('public.customer_number_seq'::regclass))::text, 4, '0'::text)),
    enrollment_declined boolean DEFAULT false NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    admin_number text,
    address text,
    city text,
    postal_code text,
    country text DEFAULT 'DE'::text,
    preferred_contact_channel text DEFAULT 'email'::text,
    communication_frequency text DEFAULT 'monatlich'::text,
    bio text,
    profile_updated_at timestamp with time zone,
    customer_status text DEFAULT 'aktiv'::text,
    acquisition_source text,
    tags text[] DEFAULT '{}'::text[]
);


--
-- Name: document_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    template_id uuid NOT NULL,
    docuseal_submission_slug text,
    docuseal_embed_src text,
    status text DEFAULT 'pending'::text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    signed_at timestamp with time zone,
    docuseal_template_id integer,
    CONSTRAINT document_assignments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'expired'::text])))
);


--
-- Name: document_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    html_body text NOT NULL,
    docuseal_template_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stand_date text
);


--
-- Name: error_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_log (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now(),
    source text,
    message text NOT NULL,
    namespace text,
    pod_name text,
    meta jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT error_log_source_check CHECK ((source = ANY (ARRAY['server'::text, 'browser'::text, 'pod'::text])))
);


--
-- Name: error_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.error_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: error_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.error_log_id_seq OWNED BY public.error_log.id;


--
-- Name: eur_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eur_bookings (
    id bigint NOT NULL,
    brand text NOT NULL,
    booking_date date NOT NULL,
    type text NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    net_amount numeric(12,2) NOT NULL,
    vat_amount numeric(12,2) DEFAULT 0 NOT NULL,
    invoice_id text,
    receipt_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    belegnummer text,
    skr_konto text,
    CONSTRAINT chk_brand_eur_bookings CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: eur_bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.eur_bookings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: eur_bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.eur_bookings_id_seq OWNED BY public.eur_bookings.id;


--
-- Name: eur_bookkeeping; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.eur_bookkeeping AS
 SELECT id,
    brand,
    booking_date,
    type,
    category,
    description,
    net_amount,
    vat_amount,
    invoice_id,
    receipt_path,
    created_at,
    belegnummer,
    skr_konto
   FROM public.eur_bookings;


--
-- Name: factory_schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factory_schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: file_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_dependencies (
    from_path text NOT NULL,
    to_path text NOT NULL
);


--
-- Name: folder_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folder_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand text NOT NULL,
    name text NOT NULL,
    structure jsonb DEFAULT '{"folders": []}'::jsonb NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_brand_folder_templates CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    keycloak_user_id text,
    client_name text,
    client_email text,
    reason text NOT NULL,
    due_date date NOT NULL,
    done boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: free_time_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.free_time_windows (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    brand text NOT NULL,
    date date NOT NULL,
    win_start time without time zone NOT NULL,
    win_end time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_free_time_windows CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text, 'massage'::text])))
);


--
-- Name: homepage_block_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homepage_block_documents (
    brand text NOT NULL,
    document jsonb NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_homepage_block_documents CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text, 'massage'::text])))
);


--
-- Name: homepage_block_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homepage_block_versions (
    id bigint NOT NULL,
    brand text NOT NULL,
    snapshot jsonb NOT NULL,
    editor text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_homepage_block_versions CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text, 'massage'::text])))
);


--
-- Name: homepage_block_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.homepage_block_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: homepage_block_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.homepage_block_versions_id_seq OWNED BY public.homepage_block_versions.id;


--
-- Name: inbox_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_items (
    id integer NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reference_id text,
    reference_table text,
    bug_ticket_id text,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now(),
    actioned_at timestamp with time zone,
    actioned_by text,
    is_test_data boolean DEFAULT false NOT NULL,
    brand text,
    CONSTRAINT inbox_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'actioned'::text, 'archived'::text]))),
    CONSTRAINT inbox_items_type_check CHECK ((type = ANY (ARRAY['registration'::text, 'booking'::text, 'contact'::text, 'bug'::text, 'meeting_finalize'::text, 'user_message'::text])))
);


--
-- Name: inbox_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inbox_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inbox_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inbox_items_id_seq OWNED BY public.inbox_items.id;


--
-- Name: invoice_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_counters (
    brand text NOT NULL,
    year integer NOT NULL,
    kind text DEFAULT 'invoice'::text NOT NULL,
    counter integer DEFAULT 0 NOT NULL,
    CONSTRAINT chk_brand_invoice_counters CHECK ((brand = 'mentolder'::text))
);


--
-- Name: learning_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    keycloak_user_id text NOT NULL,
    brand text DEFAULT 'mentolder'::text NOT NULL,
    item_type text NOT NULL,
    item_id text NOT NULL,
    status text DEFAULT 'todo'::text NOT NULL,
    note text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_learning_progress CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text]))),
    CONSTRAINT learning_progress_item_type_check CHECK ((item_type = ANY (ARRAY['goal'::text, 'tool'::text]))),
    CONSTRAINT learning_progress_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text])))
);


--
-- Name: legal_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_pages (
    brand text NOT NULL,
    page_key text NOT NULL,
    content_html text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_legal_pages CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text, 'massage'::text])))
);


--
-- Name: leistungen_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leistungen_config (
    brand text NOT NULL,
    categories_json jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_leistungen_config CHECK ((brand = 'mentolder'::text))
);


--
-- Name: massage_invoice_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.massage_invoice_sequences (
    brand text NOT NULL,
    invoice_year integer NOT NULL,
    last_number integer DEFAULT 0 NOT NULL
);


--
-- Name: massage_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.massage_invoices (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    brand text NOT NULL,
    invoice_year integer NOT NULL,
    invoice_number integer NOT NULL,
    customer_name text NOT NULL,
    customer_contact text NOT NULL,
    service_key text NOT NULL,
    service_name text NOT NULL,
    service_duration_min integer NOT NULL,
    unit_price_cents integer NOT NULL,
    tax_mode text NOT NULL,
    tax_rate numeric(5,2) DEFAULT 0 NOT NULL,
    tax_amount_cents integer DEFAULT 0 NOT NULL,
    gross_amount_cents integer NOT NULL,
    tax_note text,
    issue_date date NOT NULL,
    service_date date NOT NULL,
    status text DEFAULT 'offen'::text NOT NULL,
    payment_method text,
    appointment_token text,
    cancels_invoice_id text,
    notes text,
    is_test_data boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT massage_invoices_payment_method_check CHECK ((payment_method = ANY (ARRAY['sepa'::text, 'cash'::text, 'bank'::text, 'other'::text]))),
    CONSTRAINT massage_invoices_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'bezahlt'::text, 'storniert'::text]))),
    CONSTRAINT massage_invoices_tax_mode_check CHECK ((tax_mode = ANY (ARRAY['kleinunternehmer'::text, 'regelbesteuerung'::text]))),
    CONSTRAINT massage_invoices_unit_price_cents_check CHECK ((unit_price_cents >= 0))
);


--
-- Name: meeting_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    artifact_type text NOT NULL,
    name text NOT NULL,
    storage_path text,
    content_text text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT meeting_artifacts_artifact_type_check CHECK ((artifact_type = ANY (ARRAY['whiteboard'::text, 'document'::text, 'screenshot'::text, 'file'::text])))
);


--
-- Name: meeting_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    insight_type text NOT NULL,
    content text NOT NULL,
    generated_by text DEFAULT 'claude'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT meeting_insights_insight_type_check CHECK ((insight_type = ANY (ARRAY['summary'::text, 'action_items'::text, 'key_topics'::text, 'sentiment'::text, 'coaching_notes'::text])))
);


--
-- Name: meeting_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    meeting_start timestamp with time zone NOT NULL,
    reminder_time timestamp with time zone NOT NULL,
    meeting_url text NOT NULL,
    meeting_type text NOT NULL,
    sent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    meeting_type text NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_seconds integer,
    talk_room_token text,
    recording_path text,
    status text DEFAULT 'scheduled'::text,
    created_at timestamp with time zone DEFAULT now(),
    brett_link_posted_at timestamp with time zone,
    project_id uuid,
    released_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meetings_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'active'::text, 'ended'::text, 'transcribed'::text, 'finalized'::text])))
);


--
-- Name: message_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_threads (
    id integer NOT NULL,
    customer_id uuid,
    subject text,
    created_at timestamp with time zone DEFAULT now(),
    last_message_at timestamp with time zone DEFAULT now(),
    is_test_data boolean DEFAULT false NOT NULL
);


--
-- Name: message_threads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.message_threads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: message_threads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.message_threads_id_seq OWNED BY public.message_threads.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    thread_id integer NOT NULL,
    sender_id text NOT NULL,
    sender_role text NOT NULL,
    sender_customer_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    read_at timestamp with time zone,
    notification_sent_at timestamp with time zone,
    is_test_data boolean DEFAULT false NOT NULL,
    CONSTRAINT messages_check CHECK (((sender_role = 'admin'::text) OR (sender_customer_id IS NOT NULL))),
    CONSTRAINT messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['admin'::text, 'user'::text])))
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: newsletter_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject text NOT NULL,
    html_body text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    sent_at timestamp with time zone,
    recipient_count integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_publish_at timestamp with time zone
);


--
-- Name: newsletter_send_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_send_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    subscriber_id uuid NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL
);


--
-- Name: newsletter_subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    confirm_token text,
    token_expires_at timestamp with time zone,
    unsubscribe_token text NOT NULL,
    source text DEFAULT 'website'::text NOT NULL,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: onboarding_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    keycloak_user_id text NOT NULL,
    label text NOT NULL,
    done boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: onboarding_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    keycloak_user_id text NOT NULL,
    brand text DEFAULT 'mentolder'::text NOT NULL,
    step_id text NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_onboarding_state CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: poll_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.poll_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    poll_id uuid NOT NULL,
    answer text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT poll_answers_answer_check CHECK ((char_length(answer) <= 1000))
);


--
-- Name: polls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.polls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text NOT NULL,
    kind text NOT NULL,
    options text[],
    status text DEFAULT 'open'::text NOT NULL,
    room_tokens text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_at timestamp with time zone,
    CONSTRAINT polls_kind_check CHECK ((kind = ANY (ARRAY['multiple_choice'::text, 'text'::text]))),
    CONSTRAINT polls_mc_options_not_null CHECK (((kind <> 'multiple_choice'::text) OR (options IS NOT NULL))),
    CONSTRAINT polls_status_check CHECK ((status = ANY (ARRAY['open'::text, 'locked'::text])))
);


--
-- Name: prompt_library; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_library (
    id integer NOT NULL,
    brand text NOT NULL,
    category text DEFAULT 'canned_reply'::text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_test_data boolean DEFAULT false,
    CONSTRAINT chk_brand_prompt_library CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: prompt_library_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prompt_library_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prompt_library_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prompt_library_id_seq OWNED BY public.prompt_library.id;


--
-- Name: questionnaire_answer_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_answer_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    option_key text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    dimension_id uuid,
    weight integer DEFAULT 1 NOT NULL
);


--
-- Name: questionnaire_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    question_id uuid NOT NULL,
    option_key text NOT NULL,
    saved_at timestamp with time zone DEFAULT now() NOT NULL,
    details_text text
);


--
-- Name: questionnaire_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    question_text text NOT NULL,
    question_type text DEFAULT 'ab_choice'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    test_expected_result text,
    test_function_url text,
    test_menu_path text,
    test_role text
);


--
-- Name: questionnaire_test_fixtures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_test_fixtures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    question_id uuid NOT NULL,
    attempt integer NOT NULL,
    table_name text NOT NULL,
    row_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    purged_at timestamp with time zone,
    purge_error text
);


--
-- Name: questionnaire_test_seed_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_test_seed_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    question_id uuid,
    seed_module text NOT NULL
);


--
-- Name: questionnaire_test_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_test_status (
    question_id uuid NOT NULL,
    last_result text NOT NULL,
    last_result_at timestamp with time zone NOT NULL,
    last_success_at timestamp with time zone,
    last_assignment_id uuid,
    evidence_id uuid,
    last_failure_ticket_id uuid,
    retest_pending_at timestamp with time zone,
    retest_attempt integer DEFAULT 0 NOT NULL,
    CONSTRAINT questionnaire_test_status_last_result_check CHECK ((last_result = ANY (ARRAY['erfüllt'::text, 'teilweise'::text, 'nicht_erfüllt'::text])))
);


--
-- Name: referenzen_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referenzen_config (
    brand text NOT NULL,
    items_json jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_referenzen_config CHECK ((brand = 'mentolder'::text))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_config (
    brand text NOT NULL,
    services_json jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_service_config CHECK ((brand = 'mentolder'::text))
);


--
-- Name: service_page_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_page_config (
    brand text NOT NULL,
    slug text NOT NULL,
    page_content jsonb,
    version integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_service_page_config CHECK ((brand = 'mentolder'::text))
);


--
-- Name: session_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_events (
    id bigint NOT NULL,
    room_token text NOT NULL,
    session_code text,
    seq integer NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.session_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: session_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.session_events_id_seq OWNED BY public.session_events.id;


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    brand text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_site_settings CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text, 'massage'::text])))
);


--
-- Name: supplier_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_invoices (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    brand text NOT NULL,
    supplier_id text NOT NULL,
    invoice_number text,
    invoice_date date NOT NULL,
    leistungsdatum date,
    net_amount numeric(12,2) NOT NULL,
    vat_amount numeric(12,2) DEFAULT 0 NOT NULL,
    gross_amount numeric(12,2) NOT NULL,
    vat_rate numeric(5,2) DEFAULT 0 NOT NULL,
    currency character(3) DEFAULT 'EUR'::bpchar NOT NULL,
    description text,
    pdf_path text,
    status text DEFAULT 'open'::text NOT NULL,
    paid_at date,
    locked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_supplier_invoices CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: systemtest_failure_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.systemtest_failure_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid,
    question_id uuid,
    attempt integer DEFAULT 0 NOT NULL,
    last_error text,
    retry_count integer DEFAULT 0 NOT NULL,
    retry_after timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_kind text DEFAULT 'questionnaire'::text NOT NULL,
    run_id text,
    test_result_id bigint,
    test_id text,
    test_name text,
    error_message text,
    file_path text,
    CONSTRAINT outbox_keys_by_kind CHECK ((((source_kind = 'questionnaire'::text) AND (assignment_id IS NOT NULL) AND (question_id IS NOT NULL)) OR ((source_kind = 'test_run'::text) AND (run_id IS NOT NULL) AND (test_id IS NOT NULL)))),
    CONSTRAINT systemtest_failure_outbox_source_kind_check CHECK ((source_kind = ANY (ARRAY['questionnaire'::text, 'test_run'::text])))
);


--
-- Name: systemtest_magic_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.systemtest_magic_tokens (
    token text NOT NULL,
    keycloak_user_id uuid NOT NULL,
    session_payload jsonb NOT NULL,
    redirect_uri text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tax_mode_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_mode_changes (
    id bigint NOT NULL,
    brand text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    from_mode text NOT NULL,
    to_mode text NOT NULL,
    trigger_invoice_id text,
    year_revenue_at_change numeric(12,2),
    notes text,
    CONSTRAINT chk_brand_tax_mode_changes CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: tax_mode_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tax_mode_changes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tax_mode_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tax_mode_changes_id_seq OWNED BY public.tax_mode_changes.id;


--
-- Name: test_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_results (
    id bigint NOT NULL,
    run_id text NOT NULL,
    test_id text NOT NULL,
    category text NOT NULL,
    status text NOT NULL,
    duration_ms integer,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: test_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.test_results_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: test_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.test_results_id_seq OWNED BY public.test_results.id;


--
-- Name: test_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_runs (
    id text NOT NULL,
    tier text NOT NULL,
    test_ids text,
    cluster text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    pass integer,
    fail integer,
    skip integer,
    duration_ms integer
);


--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    task_id uuid,
    description text,
    minutes integer NOT NULL,
    billable boolean DEFAULT true NOT NULL,
    rate_cents integer DEFAULT 0 NOT NULL,
    stripe_invoice_id text,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    leistung_key text,
    CONSTRAINT time_entries_minutes_check CHECK ((minutes > 0))
);


--
-- Name: transcript_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transcript_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transcript_id uuid NOT NULL,
    segment_index integer NOT NULL,
    start_time numeric NOT NULL,
    end_time numeric NOT NULL,
    text text NOT NULL,
    speaker text
);


--
-- Name: transcripts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transcripts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    full_text text NOT NULL,
    language text DEFAULT 'de'::text,
    whisper_model text DEFAULT 'Systran/faster-whisper-medium'::text,
    duration_seconds numeric,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: v_billing_invoices_with_state; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_billing_invoices_with_state AS
 SELECT i.id,
    i.brand,
    i.number,
    i.status,
    i.customer_id,
    i.issue_date,
    i.due_date,
    i.service_period_start,
    i.service_period_end,
    i.tax_mode,
    i.net_amount,
    i.tax_rate,
    i.tax_amount,
    i.gross_amount,
    i.notes,
    i.payment_reference,
    i.locked,
    i.cancels_invoice_id,
    i.retain_until,
    i.pdf_path,
    i.created_at,
    i.updated_at,
    i.leitweg_id,
    i.einvoice_validated_at,
    i.einvoice_validation_report,
    i.kind,
    i.parent_invoice_id,
    i.currency,
    i.currency_rate,
    i.net_amount_eur,
    i.gross_amount_eur,
    i.supply_type,
    i.hash_sha256,
    i.pdf_mime,
    i.pdf_size_bytes,
    i.finalized_at,
    i.is_test_data,
    COALESCE(p.paid_amount, (0)::numeric) AS paid_amount,
        CASE
            WHEN (COALESCE(p.paid_amount, (0)::numeric) >= i.gross_amount) THEN p.last_paid_at
            ELSE NULL::date
        END AS paid_at,
    COALESCE((d.dunning_level)::integer, 0) AS dunning_level,
    d.last_dunning_at
   FROM ((public.billing_invoices i
     LEFT JOIN ( SELECT billing_invoice_payments.invoice_id,
            sum(billing_invoice_payments.amount) AS paid_amount,
            max(billing_invoice_payments.paid_at) AS last_paid_at
           FROM public.billing_invoice_payments
          GROUP BY billing_invoice_payments.invoice_id) p ON ((i.id = p.invoice_id)))
     LEFT JOIN ( SELECT billing_invoice_dunnings.invoice_id,
            max(billing_invoice_dunnings.level) AS dunning_level,
            max(billing_invoice_dunnings.generated_at) AS last_dunning_at
           FROM public.billing_invoice_dunnings
          GROUP BY billing_invoice_dunnings.invoice_id) d ON ((i.id = d.invoice_id)));


--
-- Name: pr_events; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.pr_events (
    pr_number integer NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    scope text,
    brand text,
    merged_at timestamp with time zone NOT NULL,
    merged_by text,
    status text DEFAULT 'shipped'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_brand_pr_events CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text]))),
    CONSTRAINT pr_events_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'in_progress'::text, 'shipped'::text, 'reverted'::text])))
);


--
-- Name: ticket_links; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.ticket_links (
    id bigint NOT NULL,
    from_id uuid NOT NULL,
    to_id uuid NOT NULL,
    kind text NOT NULL,
    pr_number integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT ticket_links_kind_check CHECK ((kind = ANY (ARRAY['pr'::text, 'relates_to'::text, 'blocks'::text, 'blocked_by'::text, 'duplicate_of'::text, 'fixes'::text, 'fixed_by'::text, 'child_of'::text])))
);


--
-- Name: v_systemtest_failure_board; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_systemtest_failure_board AS
 SELECT qts.last_assignment_id AS assignment_id,
    qts.question_id,
    qts.last_result,
    qts.last_result_at,
    qts.retest_pending_at,
    qts.retest_attempt,
    qts.evidence_id,
    qts.last_failure_ticket_id,
    t.id AS ticket_id,
    t.external_id AS ticket_external_id,
    t.status AS ticket_status,
    t.resolution AS ticket_resolution,
    fix_links.pr_number,
    pr.merged_at AS pr_merged_at,
        CASE
            WHEN ((qts.last_result = 'erfüllt'::text) AND (qts.last_result_at >= (now() - '7 days'::interval))) THEN 'green'::text
            WHEN (qts.retest_pending_at IS NOT NULL) THEN 'retest_pending'::text
            WHEN ((fix_links.pr_number IS NOT NULL) AND (pr.merged_at IS NULL)) THEN 'fix_in_pr'::text
            WHEN (t.id IS NOT NULL) THEN 'open'::text
            ELSE NULL::text
        END AS column_key
   FROM (((public.questionnaire_test_status qts
     LEFT JOIN tickets.tickets t ON ((t.id = qts.last_failure_ticket_id)))
     LEFT JOIN LATERAL ( SELECT ticket_links.pr_number
           FROM tickets.ticket_links
          WHERE ((ticket_links.from_id = t.id) AND (ticket_links.kind = ANY (ARRAY['fixes'::text, 'fixed_by'::text])) AND (ticket_links.pr_number IS NOT NULL))
          ORDER BY ticket_links.pr_number DESC
         LIMIT 1) fix_links ON (true))
     LEFT JOIN tickets.pr_events pr ON ((pr.pr_number = fix_links.pr_number)))
  WHERE (qts.last_failure_ticket_id IS NOT NULL);


--
-- Name: vat_id_validations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vat_id_validations (
    id bigint NOT NULL,
    customer_id text,
    vat_id text NOT NULL,
    country_code character(2) NOT NULL,
    valid boolean NOT NULL,
    vies_name text,
    vies_address text,
    request_identifier text,
    validated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vat_id_validations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vat_id_validations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vat_id_validations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vat_id_validations_id_seq OWNED BY public.vat_id_validations.id;


--
-- Name: web_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_sessions (
    id text NOT NULL,
    data jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: website_custom_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.website_custom_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: templates; Type: TABLE; Schema: sessions; Owner: -
--

CREATE TABLE sessions.templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    body_markdown text DEFAULT ''::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    owner_id text,
    created_from_template_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: _migrations; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio._migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clients; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    initials text NOT NULL,
    since text NOT NULL,
    lang text NOT NULL,
    category text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.profiles (
    client_id uuid NOT NULL,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session_levels; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.session_levels (
    session_id uuid NOT NULL,
    level_no integer NOT NULL,
    prompt text DEFAULT ''::text NOT NULL,
    prompt_is_default boolean DEFAULT true NOT NULL,
    answer text,
    notes text,
    done boolean DEFAULT false NOT NULL,
    clipboard jsonb DEFAULT '[]'::jsonb NOT NULL,
    generated_at timestamp with time zone,
    CONSTRAINT session_levels_level_no_check CHECK (((level_no >= 1) AND (level_no <= 10)))
);


--
-- Name: sessions; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'aktiv'::text NOT NULL,
    current_level integer DEFAULT 0 NOT NULL,
    template_of uuid,
    lang text DEFAULT 'Deutsch'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    paused_at timestamp with time zone
);


--
-- Name: standard_levels; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.standard_levels (
    level_no integer NOT NULL,
    name text NOT NULL,
    goal text NOT NULL,
    prompt text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT standard_levels_level_no_check CHECK (((level_no >= 1) AND (level_no <= 10)))
);


--
-- Name: standard_profile_fields; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.standard_profile_fields (
    key text NOT NULL,
    label text NOT NULL,
    value text NOT NULL,
    type text DEFAULT 'text'::text NOT NULL,
    required boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cockpit_audit; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.cockpit_audit (
    id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor text NOT NULL,
    action text NOT NULL,
    target text NOT NULL,
    outcome text NOT NULL,
    brand text NOT NULL,
    detail jsonb,
    CONSTRAINT chk_cockpit_audit_brand CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text]))),
    CONSTRAINT cockpit_audit_outcome_check CHECK ((outcome = ANY (ARRAY['success'::text, 'failure'::text])))
);


--
-- Name: cockpit_audit_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.cockpit_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cockpit_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.cockpit_audit_id_seq OWNED BY tickets.cockpit_audit.id;


--
-- Name: db_identity; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.db_identity (
    identity uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: external_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.external_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factory_control; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.factory_control (
    key text NOT NULL,
    brand text,
    value text NOT NULL,
    set_by text,
    updated_at timestamp with time zone DEFAULT now(),
    id bigint NOT NULL,
    CONSTRAINT chk_brand_factory_control CHECK ((brand = 'mentolder'::text))
);


--
-- Name: factory_control_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.factory_control_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factory_control_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.factory_control_id_seq OWNED BY tickets.factory_control.id;


--
-- Name: factory_model_slots; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.factory_model_slots (
    phase text NOT NULL,
    provider text NOT NULL,
    model_id text NOT NULL,
    base_url text,
    set_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    api_key_env text,
    CONSTRAINT factory_model_slots_phase_check CHECK ((phase = ANY (ARRAY['scout'::text, 'plan'::text, 'implement'::text, 'verify'::text, 'deploy'::text])))
);


--
-- Name: COLUMN factory_model_slots.api_key_env; Type: COMMENT; Schema: tickets; Owner: -
--

COMMENT ON COLUMN tickets.factory_model_slots.api_key_env IS 'Wie tickets.provider_config.api_key_env — der Phase-Pin ist Kandidat #0 derselben Kette und muss dasselbe Feldformat liefern.';


--
-- Name: factory_phase_events; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.factory_phase_events (
    id bigint NOT NULL,
    ticket_id uuid NOT NULL,
    phase text NOT NULL,
    state text NOT NULL,
    detail text,
    driver text DEFAULT 'factory'::text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT factory_phase_events_driver_check CHECK ((driver = ANY (ARRAY['factory'::text, 'devflow'::text]))),
    CONSTRAINT factory_phase_events_phase_check CHECK ((phase = ANY (ARRAY['scout'::text, 'design'::text, 'plan'::text, 'implement'::text, 'verify'::text, 'deploy'::text]))),
    CONSTRAINT factory_phase_events_state_check CHECK ((state = ANY (ARRAY['entered'::text, 'done'::text, 'blocked'::text])))
);


--
-- Name: factory_phase_events_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.factory_phase_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factory_phase_events_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.factory_phase_events_id_seq OWNED BY tickets.factory_phase_events.id;


--
-- Name: factory_run_budget; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.factory_run_budget (
    id bigint NOT NULL,
    ticket_id uuid,
    run_date date DEFAULT CURRENT_DATE NOT NULL,
    provider text NOT NULL,
    model_id text NOT NULL,
    phase text,
    tokens_in_est integer,
    tokens_out_est integer,
    cost_usd_est numeric(10,6),
    tokens_in_act integer,
    tokens_out_act integer,
    cost_usd_act numeric(10,6),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: factory_run_budget_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.factory_run_budget_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factory_run_budget_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.factory_run_budget_id_seq OWNED BY tickets.factory_run_budget.id;


--
-- Name: feature_flags; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.feature_flags (
    id bigint NOT NULL,
    brand text NOT NULL,
    key text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    set_by text,
    CONSTRAINT chk_brand_feature_flags CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: feature_flags_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

ALTER TABLE tickets.feature_flags ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME tickets.feature_flags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: github_issue_snapshots; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.github_issue_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    github_object_id uuid NOT NULL,
    repository_node_id text NOT NULL,
    object_number integer NOT NULL,
    title text NOT NULL,
    body text,
    state text NOT NULL,
    state_reason text,
    author_login text,
    labels jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT github_issue_snapshots_state_check CHECK ((state = ANY (ARRAY['OPEN'::text, 'CLOSED'::text]))),
    CONSTRAINT github_issue_snapshots_state_reason_check CHECK (((state_reason IS NULL) OR (state_reason = ANY (ARRAY['COMPLETED'::text, 'NOT_PLANNED'::text, 'REOPENED'::text]))))
);


--
-- Name: github_object_coordinates; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.github_object_coordinates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    github_object_id uuid NOT NULL,
    repository_node_id text NOT NULL,
    repository_owner text NOT NULL,
    repository_name text NOT NULL,
    object_number integer NOT NULL,
    url text NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone,
    CONSTRAINT github_object_coordinates_interval_check CHECK (((valid_until IS NULL) OR (valid_until > valid_from))),
    CONSTRAINT github_object_coordinates_nonempty CHECK (((btrim(repository_node_id) <> ''::text) AND (btrim(repository_owner) <> ''::text) AND (btrim(repository_name) <> ''::text) AND (btrim(url) <> ''::text))),
    CONSTRAINT github_object_coordinates_number_check CHECK ((object_number > 0))
);


--
-- Name: github_object_relations; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.github_object_relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_object_id uuid NOT NULL,
    to_object_id uuid NOT NULL,
    kind text NOT NULL,
    source text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT github_object_relations_kind_check CHECK ((kind = ANY (ARRAY['implements'::text, 'closes'::text, 'duplicate_of'::text, 'replaces'::text, 'transferred_to'::text]))),
    CONSTRAINT github_object_relations_not_self_check CHECK ((from_object_id <> to_object_id)),
    CONSTRAINT github_object_relations_redirect_reason_check CHECK (((kind <> ALL (ARRAY['duplicate_of'::text, 'replaces'::text, 'transferred_to'::text])) OR ((reason IS NOT NULL) AND (btrim(reason) <> ''::text)))),
    CONSTRAINT github_object_relations_source_nonempty CHECK ((btrim(source) <> ''::text))
);


--
-- Name: github_objects; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.github_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    github_node_id text NOT NULL,
    kind text NOT NULL,
    provider_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT github_objects_kind_check CHECK ((kind = ANY (ARRAY['issue'::text, 'pull_request'::text, 'advisory'::text]))),
    CONSTRAINT github_objects_node_id_nonempty CHECK ((btrim(github_node_id) <> ''::text)),
    CONSTRAINT github_objects_provider_ref_format_check CHECK (((provider_ref IS NULL) OR (provider_ref ~* '^GHSA-[23456789CFGHJMPQRVWX]{4}-[23456789CFGHJMPQRVWX]{4}-[23456789CFGHJMPQRVWX]{4}$'::text))),
    CONSTRAINT github_objects_provider_ref_kind_check CHECK ((((kind = 'advisory'::text) AND (provider_ref IS NOT NULL) AND (btrim(provider_ref) <> ''::text)) OR ((kind <> 'advisory'::text) AND (provider_ref IS NULL))))
);


--
-- Name: github_pr_snapshots; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.github_pr_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    github_object_id uuid NOT NULL,
    repository_node_id text NOT NULL,
    object_number integer NOT NULL,
    title text NOT NULL,
    body text,
    state text NOT NULL,
    is_draft boolean DEFAULT false NOT NULL,
    head_ref text NOT NULL,
    base_ref text NOT NULL,
    author_login text,
    labels jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    merged_at timestamp with time zone,
    merge_commit_sha text,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT github_pr_snapshots_state_check CHECK ((state = ANY (ARRAY['OPEN'::text, 'CLOSED'::text, 'MERGED'::text])))
);


--
-- Name: github_sync_cursors; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.github_sync_cursors (
    id text NOT NULL,
    cursor text NOT NULL,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    synced_count integer DEFAULT 0 NOT NULL
);


--
-- Name: llm_proxy_backends; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.llm_proxy_backends (
    id integer NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    base_url text NOT NULL,
    api_key_env text,
    enabled boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    fixups jsonb DEFAULT '[]'::jsonb NOT NULL,
    model_aliases jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_inflight integer DEFAULT 1 NOT NULL,
    roles jsonb DEFAULT '[]'::jsonb NOT NULL,
    loadout_slug text,
    CONSTRAINT llm_proxy_backends_kind_check CHECK ((kind = ANY (ARRAY['llamacpp'::text, 'lmstudio'::text, 'openai-remote'::text, 'freetoken'::text])))
);


--
-- Name: COLUMN llm_proxy_backends.max_inflight; Type: COMMENT; Schema: tickets; Owner: -
--

COMMENT ON COLUMN tickets.llm_proxy_backends.max_inflight IS 'Max gleichzeitig in-flight Requests, die der Proxy pro Backend zulaesst (Semaphor-Limit). 1 = strikte FIFO-Serialisierung (Default).';


--
-- Name: llm_proxy_backends_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.llm_proxy_backends_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: llm_proxy_backends_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.llm_proxy_backends_id_seq OWNED BY tickets.llm_proxy_backends.id;


--
-- Name: llm_proxy_request_log; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.llm_proxy_request_log (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    backend text NOT NULL,
    requested_model text,
    served_model text,
    subpath text NOT NULL,
    http_status integer,
    duration_ms integer,
    queue_wait_ms integer,
    prompt_tokens integer,
    completion_tokens integer,
    streamed boolean DEFAULT false NOT NULL,
    stream_incomplete boolean DEFAULT false NOT NULL,
    truncated boolean DEFAULT false NOT NULL,
    original_bytes bigint,
    slot_id integer,
    dispatch_ticket text,
    dispatch_partial text,
    request_body text,
    response_body text
);


--
-- Name: llm_proxy_request_log_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.llm_proxy_request_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: llm_proxy_request_log_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.llm_proxy_request_log_id_seq OWNED BY tickets.llm_proxy_request_log.id;


--
-- Name: poller_cursor; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.poller_cursor (
    task text NOT NULL,
    "position" text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pr_status; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.pr_status (
    pr_number integer NOT NULL,
    ticket_id text,
    state text NOT NULL,
    title text,
    head_ref text,
    checks jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: provider_config; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.provider_config (
    id bigint NOT NULL,
    source text NOT NULL,
    tier text NOT NULL,
    priority integer NOT NULL,
    provider text NOT NULL,
    model_id text NOT NULL,
    base_url text,
    max_concurrent integer DEFAULT 3 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    brand text DEFAULT '*'::text NOT NULL,
    is_active boolean,
    display_name text,
    api_key text,
    api_endpoint text,
    temperature numeric,
    max_tokens integer,
    top_p numeric,
    top_k integer,
    system_prompt text,
    notes text,
    thinking_mode boolean,
    presence_penalty numeric,
    frequency_penalty numeric,
    safe_prompt boolean,
    random_seed integer,
    organization_id text,
    eu_endpoint boolean,
    enabled_fields jsonb,
    context_window integer,
    context_budget integer,
    api_key_env text,
    data_residency text DEFAULT 'external'::text NOT NULL,
    CONSTRAINT chk_brand_provider_config CHECK ((brand = ANY (ARRAY['*'::text, 'mentolder'::text, 'korczewski'::text]))),
    CONSTRAINT provider_config_data_residency_check CHECK ((data_residency = ANY (ARRAY['on_premises'::text, 'external'::text])))
);


--
-- Name: COLUMN provider_config.api_key_env; Type: COMMENT; Schema: tickets; Owner: -
--

COMMENT ON COLUMN tickets.provider_config.api_key_env IS 'Name der Env-Variable, die den API-Key traegt (z.B. DEEPSEEK_API_KEY_PK fuer die Factory, DEEPSEEK_API_KEY fuer Coaching). NIE der Key selbst — der liegt git-crypt-verschluesselt in environments/<env>.yaml-Secrets. NULL = Provider braucht keinen Key (lokale Backends).';


--
-- Name: provider_config_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.provider_config_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: provider_config_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.provider_config_id_seq OWNED BY tickets.provider_config.id;


--
-- Name: provider_health; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.provider_health (
    provider text NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    last_failure timestamp with time zone,
    cooldown_until timestamp with time zone,
    active_agents integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reserved_tokens integer DEFAULT 0 NOT NULL,
    claimed_at timestamp with time zone,
    CONSTRAINT provider_health_provider_clean CHECK ((provider !~ '[\\[:space:]]'::text))
);


--
-- Name: COLUMN provider_health.claimed_at; Type: COMMENT; Schema: tickets; Owner: -
--

COMMENT ON COLUMN tickets.provider_health.claimed_at IS 'Zeitpunkt des juengsten Slot-Claims durch route-provider.sh. NULL = kein aktiver Claim. Grundlage des TTL-Reapers (scripts/factory/reap-provider-slots.sh); ohne ihn bleibt ein vergessener Release unbemerkt, bis der Provider auf max_concurrent steht.';


--
-- Name: qa_reviews; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.qa_reviews (
    id bigint NOT NULL,
    ticket_id uuid NOT NULL,
    criteria jsonb NOT NULL,
    notes text,
    verdict text NOT NULL,
    re_entry_phase text,
    reviewed_by text DEFAULT 'admin'::text NOT NULL,
    reviewed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT qa_reviews_re_entry_phase_check CHECK ((re_entry_phase = ANY (ARRAY['scout'::text, 'implement'::text, 'verify'::text]))),
    CONSTRAINT qa_reviews_verdict_check CHECK ((verdict = ANY (ARRAY['approved'::text, 'rejected'::text])))
);


--
-- Name: qa_reviews_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.qa_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.qa_reviews_id_seq OWNED BY tickets.qa_reviews.id;


--
-- Name: tags; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text,
    brand text,
    CONSTRAINT chk_brand_tags CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: ticket_activity; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.ticket_activity (
    id bigint NOT NULL,
    ticket_id uuid NOT NULL,
    actor_id uuid,
    actor_label text,
    field text NOT NULL,
    old_value jsonb,
    new_value jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ticket_activity_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.ticket_activity_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_activity_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.ticket_activity_id_seq OWNED BY tickets.ticket_activity.id;


--
-- Name: ticket_attachments; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.ticket_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    filename text NOT NULL,
    nc_path text,
    data_url text,
    mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
    file_size bigint,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticket_attachments_check CHECK (((nc_path IS NOT NULL) OR (data_url IS NOT NULL)))
);


--
-- Name: ticket_comments; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.ticket_comments (
    id bigint NOT NULL,
    ticket_id uuid NOT NULL,
    author_id uuid,
    author_label text NOT NULL,
    kind text DEFAULT 'comment'::text NOT NULL,
    body text NOT NULL,
    visibility text DEFAULT 'internal'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticket_comments_kind_check CHECK ((kind = ANY (ARRAY['comment'::text, 'status_change'::text, 'system'::text]))),
    CONSTRAINT ticket_comments_visibility_check CHECK ((visibility = ANY (ARRAY['internal'::text, 'public'::text])))
);


--
-- Name: ticket_comments_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.ticket_comments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.ticket_comments_id_seq OWNED BY tickets.ticket_comments.id;


--
-- Name: ticket_counters; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.ticket_counters (
    brand text NOT NULL,
    last_value bigint DEFAULT 0 NOT NULL,
    CONSTRAINT chk_brand_ticket_counters CHECK ((brand = ANY (ARRAY['mentolder'::text, 'korczewski'::text])))
);


--
-- Name: ticket_embeddings; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.ticket_embeddings (
    id bigint NOT NULL,
    ticket_id uuid NOT NULL,
    chunk text NOT NULL,
    chunk_type text DEFAULT 'summary'::text NOT NULL,
    embedding public.vector(1024),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding_model text,
    CONSTRAINT ticket_embeddings_chunk_type_check CHECK ((chunk_type = ANY (ARRAY['summary'::text, 'spec'::text, 'decision'::text, 'lesson'::text])))
);


--
-- Name: ticket_embeddings_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.ticket_embeddings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.ticket_embeddings_id_seq OWNED BY tickets.ticket_embeddings.id;


--
-- Name: ticket_injections; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.ticket_injections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    phase text,
    kind text NOT NULL,
    title text,
    content text,
    target_files text[],
    data_url text,
    nc_path text,
    filename text,
    mime_type text,
    injected_by text DEFAULT 'admin'::text NOT NULL,
    injected_at timestamp with time zone DEFAULT now() NOT NULL,
    consumed_at timestamp with time zone,
    CONSTRAINT ticket_injections_check CHECK (((kind <> 'asset'::text) OR (data_url IS NOT NULL) OR (nc_path IS NOT NULL))),
    CONSTRAINT ticket_injections_kind_check CHECK ((kind = ANY (ARRAY['context'::text, 'note'::text, 'asset'::text]))),
    CONSTRAINT ticket_injections_phase_check CHECK ((phase = ANY (ARRAY['scout'::text, 'design'::text, 'plan'::text, 'implement'::text, 'verify'::text, 'deploy'::text])))
);


--
-- Name: ticket_links_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.ticket_links_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_links_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.ticket_links_id_seq OWNED BY tickets.ticket_links.id;


--
-- Name: ticket_plans; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.ticket_plans (
    id bigint NOT NULL,
    ticket_id uuid NOT NULL,
    slug text NOT NULL,
    branch text,
    content text NOT NULL,
    pr_number integer,
    archived_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ticket_plans_id_seq; Type: SEQUENCE; Schema: tickets; Owner: -
--

CREATE SEQUENCE tickets.ticket_plans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: tickets; Owner: -
--

ALTER SEQUENCE tickets.ticket_plans_id_seq OWNED BY tickets.ticket_plans.id;


--
-- Name: ticket_tags; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.ticket_tags (
    ticket_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: ticket_watchers; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.ticket_watchers (
    ticket_id uuid NOT NULL,
    user_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: v_active_features; Type: VIEW; Schema: tickets; Owner: -
--

CREATE VIEW tickets.v_active_features AS
 SELECT id,
    external_id,
    title,
    priority,
    status,
    touched_files,
    pipeline_slot,
    created_at,
    updated_at
   FROM tickets.tickets
  WHERE ((type = ANY (ARRAY['feature'::text, 'feat'::text])) AND (status = ANY (ARRAY['backlog'::text, 'in_progress'::text, 'in_review'::text])) AND (touched_files IS NOT NULL))
  ORDER BY
        CASE priority
            WHEN 'hoch'::text THEN 1
            WHEN 'mittel'::text THEN 2
            WHEN 'niedrig'::text THEN 3
            ELSE NULL::integer
        END, created_at;


--
-- Name: v_cockpit_rollup; Type: VIEW; Schema: tickets; Owner: -
--

CREATE VIEW tickets.v_cockpit_rollup AS
 WITH RECURSIVE descendants AS (
         SELECT tickets.id AS container_id,
            tickets.id AS node_id,
            tickets.type,
            tickets.status
           FROM tickets.tickets
        UNION ALL
         SELECT d.container_id,
            c_1.id AS node_id,
            c_1.type,
            c_1.status
           FROM (descendants d
             JOIN tickets.tickets c_1 ON ((c_1.parent_id = d.node_id)))
        ), leaves AS (
         SELECT d.container_id,
            d.node_id,
            d.status
           FROM descendants d
          WHERE ((d.node_id <> d.container_id) AND (d.type = ANY (ARRAY['task'::text, 'bug'::text, 'chore'::text, 'fix'::text])) AND (d.status <> 'archived'::text) AND (NOT (EXISTS ( SELECT 1
                   FROM tickets.tickets ch
                  WHERE (ch.parent_id = d.node_id)))))
        ), agg AS (
         SELECT leaves.container_id,
            (count(*))::integer AS total_leaves,
            (count(*) FILTER (WHERE (leaves.status = 'done'::text)))::integer AS done_leaves,
            (count(*) FILTER (WHERE (leaves.status = 'blocked'::text)))::integer AS blocked_leaves,
            (count(*) FILTER (WHERE (leaves.status = ANY (ARRAY['in_progress'::text, 'in_review'::text, 'qa_review'::text]))))::integer AS in_progress_leaves,
            (count(*) FILTER (WHERE (leaves.status = 'awaiting_deploy'::text)))::integer AS awaiting_deploy_leaves,
            (count(*) FILTER (WHERE (leaves.status = ANY (ARRAY['triage'::text, 'backlog'::text, 'planning'::text, 'plan_staged'::text]))))::integer AS open_leaves
           FROM leaves
          GROUP BY leaves.container_id
        )
 SELECT c.id AS container_id,
    COALESCE(a.total_leaves, 0) AS total_leaves,
    COALESCE(a.done_leaves, 0) AS done_leaves,
    COALESCE(a.blocked_leaves, 0) AS blocked_leaves,
    COALESCE(a.in_progress_leaves, 0) AS in_progress_leaves,
    COALESCE(a.awaiting_deploy_leaves, 0) AS awaiting_deploy_leaves,
    COALESCE(a.open_leaves, 0) AS open_leaves,
    COALESCE((round(((100.0 * (a.done_leaves)::numeric) / (NULLIF(a.total_leaves, 0))::numeric)))::integer, 0) AS pct_done,
        CASE
            WHEN (COALESCE(a.blocked_leaves, 0) > 0) THEN 'red'::text
            WHEN ((COALESCE(a.total_leaves, 0) > 0) AND ((round(((100.0 * (a.done_leaves)::numeric) / (NULLIF(a.total_leaves, 0))::numeric)))::integer = 100)) THEN 'green'::text
            ELSE 'amber'::text
        END AS health
   FROM (tickets.tickets c
     LEFT JOIN agg a ON ((a.container_id = c.id)))
  WHERE (c.type = ANY (ARRAY['project'::text, 'feature'::text, 'feat'::text]));


--
-- Name: v_factory_metrics; Type: VIEW; Schema: tickets; Owner: -
--

CREATE VIEW tickets.v_factory_metrics AS
 SELECT (date_trunc('day'::text, created_at))::date AS day,
    count(*) FILTER (WHERE (status = 'done'::text)) AS features_shipped,
    round(avg((EXTRACT(epoch FROM (done_at - created_at)) / (3600)::numeric)) FILTER (WHERE (status = 'done'::text)), 1) AS avg_cycle_time_h,
    count(*) FILTER (WHERE (status = 'blocked'::text)) AS escalations,
    count(*) FILTER (WHERE (type = ANY (ARRAY['feature'::text, 'feat'::text]))) AS total_features
   FROM tickets.tickets
  WHERE (created_at > (now() - '30 days'::interval))
  GROUP BY ((date_trunc('day'::text, created_at))::date)
  ORDER BY ((date_trunc('day'::text, created_at))::date) DESC;


--
-- Name: work_item_refs; Type: TABLE; Schema: tickets; Owner: -
--

CREATE TABLE tickets.work_item_refs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    github_object_id uuid NOT NULL,
    role text NOT NULL,
    reason text,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT work_item_refs_alias_open_check CHECK (((role <> 'alias'::text) OR (valid_until IS NULL))),
    CONSTRAINT work_item_refs_interval_check CHECK (((valid_until IS NULL) OR (valid_until > valid_from))),
    CONSTRAINT work_item_refs_role_check CHECK ((role = ANY (ARRAY['canonical'::text, 'alias'::text])))
);


--
-- Name: dossiers id; Type: DEFAULT; Schema: applications; Owner: -
--

ALTER TABLE ONLY applications.dossiers ALTER COLUMN id SET DEFAULT nextval('applications.dossiers_id_seq'::regclass);


--
-- Name: jobs id; Type: DEFAULT; Schema: applications; Owner: -
--

ALTER TABLE ONLY applications.jobs ALTER COLUMN id SET DEFAULT nextval('applications.jobs_id_seq'::regclass);


--
-- Name: timeline id; Type: DEFAULT; Schema: applications; Owner: -
--

ALTER TABLE ONLY applications.timeline ALTER COLUMN id SET DEFAULT nextval('applications.timeline_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.audit_log ALTER COLUMN id SET DEFAULT nextval('audit.audit_log_id_seq'::regclass);


--
-- Name: components id; Type: DEFAULT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.components ALTER COLUMN id SET DEFAULT nextval('bachelorprojekt.components_id_seq'::regclass);


--
-- Name: features id; Type: DEFAULT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.features ALTER COLUMN id SET DEFAULT nextval('bachelorprojekt.features_id_seq'::regclass);


--
-- Name: pipeline id; Type: DEFAULT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.pipeline ALTER COLUMN id SET DEFAULT nextval('bachelorprojekt.pipeline_id_seq'::regclass);


--
-- Name: software_events id; Type: DEFAULT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.software_events ALTER COLUMN id SET DEFAULT nextval('bachelorprojekt.software_events_id_seq'::regclass);


--
-- Name: test_results id; Type: DEFAULT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.test_results ALTER COLUMN id SET DEFAULT nextval('bachelorprojekt.test_results_id_seq'::regclass);


--
-- Name: ki_config id; Type: DEFAULT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.ki_config ALTER COLUMN id SET DEFAULT nextval('coaching.ki_config_id_seq'::regclass);


--
-- Name: adapters id; Type: DEFAULT; Schema: model_registry; Owner: -
--

ALTER TABLE ONLY model_registry.adapters ALTER COLUMN id SET DEFAULT nextval('model_registry.adapters_id_seq'::regclass);


--
-- Name: admin_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions ALTER COLUMN id SET DEFAULT nextval('public.admin_actions_id_seq'::regclass);


--
-- Name: ai_call_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_call_log ALTER COLUMN id SET DEFAULT nextval('public.ai_call_log_id_seq'::regclass);


--
-- Name: assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets ALTER COLUMN id SET DEFAULT nextval('public.assets_id_seq'::regclass);


--
-- Name: billing_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_audit_log ALTER COLUMN id SET DEFAULT nextval('public.billing_audit_log_id_seq'::regclass);


--
-- Name: billing_invoice_line_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_line_items ALTER COLUMN id SET DEFAULT nextval('public.billing_invoice_line_items_id_seq'::regclass);


--
-- Name: billing_invoice_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_payments ALTER COLUMN id SET DEFAULT nextval('public.billing_invoice_payments_id_seq'::regclass);


--
-- Name: billing_nachweis id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_nachweis ALTER COLUMN id SET DEFAULT nextval('public.billing_nachweis_id_seq'::regclass);


--
-- Name: chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);


--
-- Name: chat_rooms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms ALTER COLUMN id SET DEFAULT nextval('public.chat_rooms_id_seq'::regclass);


--
-- Name: error_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_log ALTER COLUMN id SET DEFAULT nextval('public.error_log_id_seq'::regclass);


--
-- Name: eur_bookings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eur_bookings ALTER COLUMN id SET DEFAULT nextval('public.eur_bookings_id_seq'::regclass);


--
-- Name: homepage_block_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_block_versions ALTER COLUMN id SET DEFAULT nextval('public.homepage_block_versions_id_seq'::regclass);


--
-- Name: inbox_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_items ALTER COLUMN id SET DEFAULT nextval('public.inbox_items_id_seq'::regclass);


--
-- Name: message_threads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_threads ALTER COLUMN id SET DEFAULT nextval('public.message_threads_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: prompt_library id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_library ALTER COLUMN id SET DEFAULT nextval('public.prompt_library_id_seq'::regclass);


--
-- Name: session_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_events ALTER COLUMN id SET DEFAULT nextval('public.session_events_id_seq'::regclass);


--
-- Name: tax_mode_changes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_mode_changes ALTER COLUMN id SET DEFAULT nextval('public.tax_mode_changes_id_seq'::regclass);


--
-- Name: test_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results ALTER COLUMN id SET DEFAULT nextval('public.test_results_id_seq'::regclass);


--
-- Name: vat_id_validations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_id_validations ALTER COLUMN id SET DEFAULT nextval('public.vat_id_validations_id_seq'::regclass);


--
-- Name: cockpit_audit id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.cockpit_audit ALTER COLUMN id SET DEFAULT nextval('tickets.cockpit_audit_id_seq'::regclass);


--
-- Name: factory_control id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.factory_control ALTER COLUMN id SET DEFAULT nextval('tickets.factory_control_id_seq'::regclass);


--
-- Name: factory_phase_events id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.factory_phase_events ALTER COLUMN id SET DEFAULT nextval('tickets.factory_phase_events_id_seq'::regclass);


--
-- Name: factory_run_budget id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.factory_run_budget ALTER COLUMN id SET DEFAULT nextval('tickets.factory_run_budget_id_seq'::regclass);


--
-- Name: llm_proxy_backends id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.llm_proxy_backends ALTER COLUMN id SET DEFAULT nextval('tickets.llm_proxy_backends_id_seq'::regclass);


--
-- Name: llm_proxy_request_log id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.llm_proxy_request_log ALTER COLUMN id SET DEFAULT nextval('tickets.llm_proxy_request_log_id_seq'::regclass);


--
-- Name: provider_config id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.provider_config ALTER COLUMN id SET DEFAULT nextval('tickets.provider_config_id_seq'::regclass);


--
-- Name: qa_reviews id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.qa_reviews ALTER COLUMN id SET DEFAULT nextval('tickets.qa_reviews_id_seq'::regclass);


--
-- Name: ticket_activity id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_activity ALTER COLUMN id SET DEFAULT nextval('tickets.ticket_activity_id_seq'::regclass);


--
-- Name: ticket_comments id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_comments ALTER COLUMN id SET DEFAULT nextval('tickets.ticket_comments_id_seq'::regclass);


--
-- Name: ticket_embeddings id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_embeddings ALTER COLUMN id SET DEFAULT nextval('tickets.ticket_embeddings_id_seq'::regclass);


--
-- Name: ticket_links id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_links ALTER COLUMN id SET DEFAULT nextval('tickets.ticket_links_id_seq'::regclass);


--
-- Name: ticket_plans id; Type: DEFAULT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_plans ALTER COLUMN id SET DEFAULT nextval('tickets.ticket_plans_id_seq'::regclass);


--
-- Name: dossiers dossiers_pkey; Type: CONSTRAINT; Schema: applications; Owner: -
--

ALTER TABLE ONLY applications.dossiers
    ADD CONSTRAINT dossiers_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_company_role_title_key; Type: CONSTRAINT; Schema: applications; Owner: -
--

ALTER TABLE ONLY applications.jobs
    ADD CONSTRAINT jobs_company_role_title_key UNIQUE (company, role_title);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: applications; Owner: -
--

ALTER TABLE ONLY applications.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: timeline timeline_pkey; Type: CONSTRAINT; Schema: applications; Owner: -
--

ALTER TABLE ONLY applications.timeline
    ADD CONSTRAINT timeline_pkey PRIMARY KEY (id);


--
-- Name: generation_jobs generation_jobs_pkey; Type: CONSTRAINT; Schema: assets; Owner: -
--

ALTER TABLE ONLY assets.generation_jobs
    ADD CONSTRAINT generation_jobs_pkey PRIMARY KEY (id);


--
-- Name: registry registry_file_path_key; Type: CONSTRAINT; Schema: assets; Owner: -
--

ALTER TABLE ONLY assets.registry
    ADD CONSTRAINT registry_file_path_key UNIQUE (file_path);


--
-- Name: registry registry_pkey; Type: CONSTRAINT; Schema: assets; Owner: -
--

ALTER TABLE ONLY assets.registry
    ADD CONSTRAINT registry_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: components components_pkey; Type: CONSTRAINT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.components
    ADD CONSTRAINT components_pkey PRIMARY KEY (id);


--
-- Name: features features_pkey; Type: CONSTRAINT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.features
    ADD CONSTRAINT features_pkey PRIMARY KEY (id);


--
-- Name: features features_pr_number_key; Type: CONSTRAINT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.features
    ADD CONSTRAINT features_pr_number_key UNIQUE (pr_number);


--
-- Name: pipeline pipeline_pkey; Type: CONSTRAINT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.pipeline
    ADD CONSTRAINT pipeline_pkey PRIMARY KEY (id);


--
-- Name: requirements requirements_pkey; Type: CONSTRAINT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.requirements
    ADD CONSTRAINT requirements_pkey PRIMARY KEY (id);


--
-- Name: software_events software_events_pkey; Type: CONSTRAINT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.software_events
    ADD CONSTRAINT software_events_pkey PRIMARY KEY (id);


--
-- Name: test_results test_results_pkey; Type: CONSTRAINT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.test_results
    ADD CONSTRAINT test_results_pkey PRIMARY KEY (id);


--
-- Name: board_templates board_templates_pkey; Type: CONSTRAINT; Schema: brett; Owner: -
--

ALTER TABLE ONLY brett.board_templates
    ADD CONSTRAINT board_templates_pkey PRIMARY KEY (id);


--
-- Name: coaching_templates coaching_templates_pkey; Type: CONSTRAINT; Schema: brett; Owner: -
--

ALTER TABLE ONLY brett.coaching_templates
    ADD CONSTRAINT coaching_templates_pkey PRIMARY KEY (id);


--
-- Name: bug_tickets bug_tickets_pkey; Type: CONSTRAINT; Schema: bugs; Owner: -
--

ALTER TABLE ONLY bugs.bug_tickets
    ADD CONSTRAINT bug_tickets_pkey PRIMARY KEY (ticket_id);


--
-- Name: books books_knowledge_collection_id_key; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.books
    ADD CONSTRAINT books_knowledge_collection_id_key UNIQUE (knowledge_collection_id);


--
-- Name: books books_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.books
    ADD CONSTRAINT books_pkey PRIMARY KEY (id);


--
-- Name: drafts drafts_knowledge_chunk_id_classifier_version_key; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.drafts
    ADD CONSTRAINT drafts_knowledge_chunk_id_classifier_version_key UNIQUE (knowledge_chunk_id, classifier_version);


--
-- Name: drafts drafts_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.drafts
    ADD CONSTRAINT drafts_pkey PRIMARY KEY (id);


--
-- Name: ki_config ki_config_brand_provider_key; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.ki_config
    ADD CONSTRAINT ki_config_brand_provider_key UNIQUE (brand, provider);


--
-- Name: ki_config ki_config_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.ki_config
    ADD CONSTRAINT ki_config_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_insights_cache questionnaire_insights_cache_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.questionnaire_insights_cache
    ADD CONSTRAINT questionnaire_insights_cache_pkey PRIMARY KEY (key);


--
-- Name: session_audit_log session_audit_log_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.session_audit_log
    ADD CONSTRAINT session_audit_log_pkey PRIMARY KEY (id);


--
-- Name: session_steps session_steps_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.session_steps
    ADD CONSTRAINT session_steps_pkey PRIMARY KEY (id);


--
-- Name: session_steps session_steps_session_id_step_number_key; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.session_steps
    ADD CONSTRAINT session_steps_session_id_step_number_key UNIQUE (session_id, step_number);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: snippet_clusters snippet_clusters_book_id_name_key; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.snippet_clusters
    ADD CONSTRAINT snippet_clusters_book_id_name_key UNIQUE (book_id, name);


--
-- Name: snippet_clusters snippet_clusters_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.snippet_clusters
    ADD CONSTRAINT snippet_clusters_pkey PRIMARY KEY (id);


--
-- Name: snippets snippets_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.snippets
    ADD CONSTRAINT snippets_pkey PRIMARY KEY (id);


--
-- Name: step_templates step_templates_brand_step_number_key; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.step_templates
    ADD CONSTRAINT step_templates_brand_step_number_key UNIQUE (brand, step_number);


--
-- Name: step_templates step_templates_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.step_templates
    ADD CONSTRAINT step_templates_pkey PRIMARY KEY (id);


--
-- Name: template_assignments template_assignments_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.template_assignments
    ADD CONSTRAINT template_assignments_pkey PRIMARY KEY (id);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: templates templates_snippet_id_target_surface_version_key; Type: CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.templates
    ADD CONSTRAINT templates_snippet_id_target_surface_version_key UNIQUE (snippet_id, target_surface, version);


--
-- Name: chunks chunks_document_id_position_key; Type: CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE ONLY knowledge.chunks
    ADD CONSTRAINT chunks_document_id_position_key UNIQUE (document_id, "position");


--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE ONLY knowledge.chunks
    ADD CONSTRAINT chunks_pkey PRIMARY KEY (id);


--
-- Name: collections collections_name_key; Type: CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE ONLY knowledge.collections
    ADD CONSTRAINT collections_name_key UNIQUE (name);


--
-- Name: collections collections_pkey; Type: CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE ONLY knowledge.collections
    ADD CONSTRAINT collections_pkey PRIMARY KEY (id);


--
-- Name: documents documents_collection_id_source_uri_key; Type: CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE ONLY knowledge.documents
    ADD CONSTRAINT documents_collection_id_source_uri_key UNIQUE (collection_id, source_uri);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE ONLY knowledge.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: adapters adapters_name_key; Type: CONSTRAINT; Schema: model_registry; Owner: -
--

ALTER TABLE ONLY model_registry.adapters
    ADD CONSTRAINT adapters_name_key UNIQUE (name);


--
-- Name: adapters adapters_pkey; Type: CONSTRAINT; Schema: model_registry; Owner: -
--

ALTER TABLE ONLY model_registry.adapters
    ADD CONSTRAINT adapters_pkey PRIMARY KEY (id);


--
-- Name: deployment_config deployment_config_pkey; Type: CONSTRAINT; Schema: model_registry; Owner: -
--

ALTER TABLE ONLY model_registry.deployment_config
    ADD CONSTRAINT deployment_config_pkey PRIMARY KEY (adapter_id);


--
-- Name: eval_scores eval_scores_pkey; Type: CONSTRAINT; Schema: model_registry; Owner: -
--

ALTER TABLE ONLY model_registry.eval_scores
    ADD CONSTRAINT eval_scores_pkey PRIMARY KEY (adapter_id, role);


--
-- Name: provenance provenance_pkey; Type: CONSTRAINT; Schema: model_registry; Owner: -
--

ALTER TABLE ONLY model_registry.provenance
    ADD CONSTRAINT provenance_pkey PRIMARY KEY (adapter_id);


--
-- Name: stat_requirements stat_requirements_pkey; Type: CONSTRAINT; Schema: model_registry; Owner: -
--

ALTER TABLE ONLY model_registry.stat_requirements
    ADD CONSTRAINT stat_requirements_pkey PRIMARY KEY (adapter_id);


--
-- Name: hardware_assets hardware_assets_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.hardware_assets
    ADD CONSTRAINT hardware_assets_pkey PRIMARY KEY (id);


--
-- Name: hardware_assets hardware_assets_slug_key; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.hardware_assets
    ADD CONSTRAINT hardware_assets_slug_key UNIQUE (slug);


--
-- Name: software_assets software_assets_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.software_assets
    ADD CONSTRAINT software_assets_pkey PRIMARY KEY (id);


--
-- Name: software_assets software_assets_slug_key; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.software_assets
    ADD CONSTRAINT software_assets_slug_key UNIQUE (slug);


--
-- Name: admin_actions admin_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_pkey PRIMARY KEY (id);


--
-- Name: admin_shortcuts admin_shortcuts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_shortcuts
    ADD CONSTRAINT admin_shortcuts_pkey PRIMARY KEY (id);


--
-- Name: ai_call_log ai_call_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_call_log
    ADD CONSTRAINT ai_call_log_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: assistant_conversations assistant_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_conversations
    ADD CONSTRAINT assistant_conversations_pkey PRIMARY KEY (id);


--
-- Name: assistant_first_seen assistant_first_seen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_first_seen
    ADD CONSTRAINT assistant_first_seen_pkey PRIMARY KEY (user_sub, profile);


--
-- Name: assistant_messages assistant_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_messages
    ADD CONSTRAINT assistant_messages_pkey PRIMARY KEY (id);


--
-- Name: assistant_nudge_dismissals assistant_nudge_dismissals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_nudge_dismissals
    ADD CONSTRAINT assistant_nudge_dismissals_pkey PRIMARY KEY (user_sub, nudge_id);


--
-- Name: billing_audit_log billing_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_audit_log
    ADD CONSTRAINT billing_audit_log_pkey PRIMARY KEY (id);


--
-- Name: billing_customers billing_customers_brand_email_typ_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_brand_email_typ_key UNIQUE (brand, email, typ);


--
-- Name: billing_customers billing_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_pkey PRIMARY KEY (id);


--
-- Name: billing_invoice_documents billing_invoice_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_documents
    ADD CONSTRAINT billing_invoice_documents_pkey PRIMARY KEY (invoice_id, format);


--
-- Name: billing_invoice_dunnings billing_invoice_dunnings_invoice_id_level_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_dunnings
    ADD CONSTRAINT billing_invoice_dunnings_invoice_id_level_key UNIQUE (invoice_id, level);


--
-- Name: billing_invoice_dunnings billing_invoice_dunnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_dunnings
    ADD CONSTRAINT billing_invoice_dunnings_pkey PRIMARY KEY (id);


--
-- Name: billing_invoice_line_items billing_invoice_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_line_items
    ADD CONSTRAINT billing_invoice_line_items_pkey PRIMARY KEY (id);


--
-- Name: billing_invoice_payments billing_invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_payments
    ADD CONSTRAINT billing_invoice_payments_pkey PRIMARY KEY (id);


--
-- Name: billing_invoices billing_invoices_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_number_key UNIQUE (number);


--
-- Name: billing_invoices billing_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_pkey PRIMARY KEY (id);


--
-- Name: billing_nachweis billing_nachweis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_nachweis
    ADD CONSTRAINT billing_nachweis_pkey PRIMARY KEY (id);


--
-- Name: billing_quotes billing_quotes_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_quotes
    ADD CONSTRAINT billing_quotes_number_key UNIQUE (number);


--
-- Name: billing_quotes billing_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_quotes
    ADD CONSTRAINT billing_quotes_pkey PRIMARY KEY (id);


--
-- Name: billing_suppliers billing_suppliers_brand_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_suppliers
    ADD CONSTRAINT billing_suppliers_brand_name_key UNIQUE (brand, name);


--
-- Name: billing_suppliers billing_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_suppliers
    ADD CONSTRAINT billing_suppliers_pkey PRIMARY KEY (id);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: brett_rooms brett_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brett_rooms
    ADD CONSTRAINT brett_rooms_pkey PRIMARY KEY (room_token);


--
-- Name: brett_share_tokens brett_share_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brett_share_tokens
    ADD CONSTRAINT brett_share_tokens_pkey PRIMARY KEY (token);


--
-- Name: brett_snapshots brett_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brett_snapshots
    ADD CONSTRAINT brett_snapshots_pkey PRIMARY KEY (id);


--
-- Name: business_memberships business_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_memberships
    ADD CONSTRAINT business_memberships_pkey PRIMARY KEY (user_key, brand);


--
-- Name: chat_message_reads chat_message_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_pkey PRIMARY KEY (message_id, customer_id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_room_members chat_room_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_room_members
    ADD CONSTRAINT chat_room_members_pkey PRIMARY KEY (room_id, customer_id);


--
-- Name: chat_rooms chat_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_pkey PRIMARY KEY (id);


--
-- Name: client_notes client_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_notes
    ADD CONSTRAINT client_notes_pkey PRIMARY KEY (id);


--
-- Name: code_embeddings code_embeddings_file_path_chunk_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_embeddings
    ADD CONSTRAINT code_embeddings_file_path_chunk_index_key UNIQUE (file_path, chunk_index);


--
-- Name: code_embeddings code_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_embeddings
    ADD CONSTRAINT code_embeddings_pkey PRIMARY KEY (id);


--
-- Name: customer_contact_history customer_contact_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contact_history
    ADD CONSTRAINT customer_contact_history_pkey PRIMARY KEY (id);


--
-- Name: customer_project_attachments customer_project_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_project_attachments
    ADD CONSTRAINT customer_project_attachments_pkey PRIMARY KEY (id);


--
-- Name: customer_projects customer_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_projects
    ADD CONSTRAINT customer_projects_pkey PRIMARY KEY (id);


--
-- Name: customers customers_admin_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_admin_number_key UNIQUE (admin_number);


--
-- Name: customers customers_customer_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_customer_number_key UNIQUE (customer_number);


--
-- Name: customers customers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_email_key UNIQUE (email);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: document_assignments document_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_assignments
    ADD CONSTRAINT document_assignments_pkey PRIMARY KEY (id);


--
-- Name: document_templates document_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);


--
-- Name: error_log error_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_log
    ADD CONSTRAINT error_log_pkey PRIMARY KEY (id);


--
-- Name: eur_bookings eur_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eur_bookings
    ADD CONSTRAINT eur_bookings_pkey PRIMARY KEY (id);


--
-- Name: factory_schema_migrations factory_schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_schema_migrations
    ADD CONSTRAINT factory_schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: file_dependencies file_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_dependencies
    ADD CONSTRAINT file_dependencies_pkey PRIMARY KEY (from_path, to_path);


--
-- Name: folder_templates folder_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_templates
    ADD CONSTRAINT folder_templates_pkey PRIMARY KEY (id);


--
-- Name: follow_ups follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_pkey PRIMARY KEY (id);


--
-- Name: free_time_windows free_time_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.free_time_windows
    ADD CONSTRAINT free_time_windows_pkey PRIMARY KEY (id);


--
-- Name: homepage_block_documents homepage_block_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_block_documents
    ADD CONSTRAINT homepage_block_documents_pkey PRIMARY KEY (brand);


--
-- Name: homepage_block_versions homepage_block_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_block_versions
    ADD CONSTRAINT homepage_block_versions_pkey PRIMARY KEY (id);


--
-- Name: inbox_items inbox_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_items
    ADD CONSTRAINT inbox_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_counters invoice_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_counters
    ADD CONSTRAINT invoice_counters_pkey PRIMARY KEY (brand, year, kind);


--
-- Name: learning_progress learning_progress_keycloak_user_id_brand_item_type_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_progress
    ADD CONSTRAINT learning_progress_keycloak_user_id_brand_item_type_item_id_key UNIQUE (keycloak_user_id, brand, item_type, item_id);


--
-- Name: learning_progress learning_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_progress
    ADD CONSTRAINT learning_progress_pkey PRIMARY KEY (id);


--
-- Name: legal_pages legal_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_pages
    ADD CONSTRAINT legal_pages_pkey PRIMARY KEY (brand, page_key);


--
-- Name: leistungen_config leistungen_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leistungen_config
    ADD CONSTRAINT leistungen_config_pkey PRIMARY KEY (brand);


--
-- Name: massage_invoice_sequences massage_invoice_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.massage_invoice_sequences
    ADD CONSTRAINT massage_invoice_sequences_pkey PRIMARY KEY (brand, invoice_year);


--
-- Name: massage_invoices massage_invoices_brand_invoice_year_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.massage_invoices
    ADD CONSTRAINT massage_invoices_brand_invoice_year_invoice_number_key UNIQUE (brand, invoice_year, invoice_number);


--
-- Name: massage_invoices massage_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.massage_invoices
    ADD CONSTRAINT massage_invoices_pkey PRIMARY KEY (id);


--
-- Name: meeting_artifacts meeting_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_artifacts
    ADD CONSTRAINT meeting_artifacts_pkey PRIMARY KEY (id);


--
-- Name: meeting_insights meeting_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_insights
    ADD CONSTRAINT meeting_insights_pkey PRIMARY KEY (id);


--
-- Name: meeting_reminders meeting_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_reminders
    ADD CONSTRAINT meeting_reminders_pkey PRIMARY KEY (id);


--
-- Name: meetings meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);


--
-- Name: message_threads message_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_threads
    ADD CONSTRAINT message_threads_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: newsletter_campaigns newsletter_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_campaigns
    ADD CONSTRAINT newsletter_campaigns_pkey PRIMARY KEY (id);


--
-- Name: newsletter_send_log newsletter_send_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_send_log
    ADD CONSTRAINT newsletter_send_log_pkey PRIMARY KEY (id);


--
-- Name: newsletter_subscribers newsletter_subscribers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_email_key UNIQUE (email);


--
-- Name: newsletter_subscribers newsletter_subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_pkey PRIMARY KEY (id);


--
-- Name: newsletter_subscribers newsletter_subscribers_unsubscribe_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_unsubscribe_token_key UNIQUE (unsubscribe_token);


--
-- Name: onboarding_items onboarding_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_items
    ADD CONSTRAINT onboarding_items_pkey PRIMARY KEY (id);


--
-- Name: onboarding_state onboarding_state_keycloak_user_id_brand_step_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_state
    ADD CONSTRAINT onboarding_state_keycloak_user_id_brand_step_id_key UNIQUE (keycloak_user_id, brand, step_id);


--
-- Name: onboarding_state onboarding_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_state
    ADD CONSTRAINT onboarding_state_pkey PRIMARY KEY (id);


--
-- Name: poll_answers poll_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poll_answers
    ADD CONSTRAINT poll_answers_pkey PRIMARY KEY (id);


--
-- Name: polls polls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polls
    ADD CONSTRAINT polls_pkey PRIMARY KEY (id);


--
-- Name: prompt_library prompt_library_brand_title_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_library
    ADD CONSTRAINT prompt_library_brand_title_key UNIQUE (brand, title);


--
-- Name: prompt_library prompt_library_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_library
    ADD CONSTRAINT prompt_library_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_answer_options questionnaire_answer_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_answer_options
    ADD CONSTRAINT questionnaire_answer_options_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_answers questionnaire_answers_assignment_id_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_answers
    ADD CONSTRAINT questionnaire_answers_assignment_id_question_id_key UNIQUE (assignment_id, question_id);


--
-- Name: questionnaire_answers questionnaire_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_answers
    ADD CONSTRAINT questionnaire_answers_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_assignment_scores questionnaire_assignment_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_assignment_scores
    ADD CONSTRAINT questionnaire_assignment_scores_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_assignments questionnaire_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_assignments
    ADD CONSTRAINT questionnaire_assignments_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_dimensions questionnaire_dimensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_dimensions
    ADD CONSTRAINT questionnaire_dimensions_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_questions questionnaire_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_questions
    ADD CONSTRAINT questionnaire_questions_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_templates questionnaire_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_templates
    ADD CONSTRAINT questionnaire_templates_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_test_evidence questionnaire_test_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_evidence
    ADD CONSTRAINT questionnaire_test_evidence_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_test_fixtures questionnaire_test_fixtures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_fixtures
    ADD CONSTRAINT questionnaire_test_fixtures_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_test_seed_registry questionnaire_test_seed_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_seed_registry
    ADD CONSTRAINT questionnaire_test_seed_registry_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_test_status questionnaire_test_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_status
    ADD CONSTRAINT questionnaire_test_status_pkey PRIMARY KEY (question_id);


--
-- Name: referenzen_config referenzen_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referenzen_config
    ADD CONSTRAINT referenzen_config_pkey PRIMARY KEY (brand);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: service_config service_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_config
    ADD CONSTRAINT service_config_pkey PRIMARY KEY (brand);


--
-- Name: service_page_config service_page_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_page_config
    ADD CONSTRAINT service_page_config_pkey PRIMARY KEY (brand, slug);


--
-- Name: session_events session_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_events
    ADD CONSTRAINT session_events_pkey PRIMARY KEY (id);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (brand, key);


--
-- Name: supplier_invoices supplier_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_pkey PRIMARY KEY (id);


--
-- Name: systemtest_failure_outbox systemtest_failure_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systemtest_failure_outbox
    ADD CONSTRAINT systemtest_failure_outbox_pkey PRIMARY KEY (id);


--
-- Name: systemtest_magic_tokens systemtest_magic_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.systemtest_magic_tokens
    ADD CONSTRAINT systemtest_magic_tokens_pkey PRIMARY KEY (token);


--
-- Name: tax_mode_changes tax_mode_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_mode_changes
    ADD CONSTRAINT tax_mode_changes_pkey PRIMARY KEY (id);


--
-- Name: test_results test_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_pkey PRIMARY KEY (id);


--
-- Name: test_runs test_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT test_runs_pkey PRIMARY KEY (id);


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);


--
-- Name: transcript_segments transcript_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcript_segments
    ADD CONSTRAINT transcript_segments_pkey PRIMARY KEY (id);


--
-- Name: transcripts transcripts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_assignment_scores uq_qas_assignment_dimension; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_assignment_scores
    ADD CONSTRAINT uq_qas_assignment_dimension UNIQUE (assignment_id, dimension_id);


--
-- Name: vat_id_validations vat_id_validations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_id_validations
    ADD CONSTRAINT vat_id_validations_pkey PRIMARY KEY (id);


--
-- Name: web_sessions web_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_sessions
    ADD CONSTRAINT web_sessions_pkey PRIMARY KEY (id);


--
-- Name: website_custom_sections website_custom_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_custom_sections
    ADD CONSTRAINT website_custom_sections_pkey PRIMARY KEY (id);


--
-- Name: website_custom_sections website_custom_sections_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_custom_sections
    ADD CONSTRAINT website_custom_sections_slug_key UNIQUE (slug);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: sessions; Owner: -
--

ALTER TABLE ONLY sessions.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (filename);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (client_id);


--
-- Name: session_levels session_levels_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.session_levels
    ADD CONSTRAINT session_levels_pkey PRIMARY KEY (session_id, level_no);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: standard_levels standard_levels_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.standard_levels
    ADD CONSTRAINT standard_levels_pkey PRIMARY KEY (level_no);


--
-- Name: standard_profile_fields standard_profile_fields_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.standard_profile_fields
    ADD CONSTRAINT standard_profile_fields_pkey PRIMARY KEY (key);


--
-- Name: cockpit_audit cockpit_audit_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.cockpit_audit
    ADD CONSTRAINT cockpit_audit_pkey PRIMARY KEY (id);


--
-- Name: db_identity db_identity_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.db_identity
    ADD CONSTRAINT db_identity_pkey PRIMARY KEY (identity);


--
-- Name: factory_control factory_control_key_brand_key; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.factory_control
    ADD CONSTRAINT factory_control_key_brand_key UNIQUE NULLS NOT DISTINCT (key, brand);


--
-- Name: factory_control factory_control_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.factory_control
    ADD CONSTRAINT factory_control_pkey PRIMARY KEY (id);


--
-- Name: factory_model_slots factory_model_slots_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.factory_model_slots
    ADD CONSTRAINT factory_model_slots_pkey PRIMARY KEY (phase);


--
-- Name: factory_phase_events factory_phase_events_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.factory_phase_events
    ADD CONSTRAINT factory_phase_events_pkey PRIMARY KEY (id);


--
-- Name: factory_run_budget factory_run_budget_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.factory_run_budget
    ADD CONSTRAINT factory_run_budget_pkey PRIMARY KEY (id);


--
-- Name: feature_flags feature_flags_brand_key_key; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.feature_flags
    ADD CONSTRAINT feature_flags_brand_key_key UNIQUE (brand, key);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (id);


--
-- Name: github_issue_snapshots github_issue_snapshots_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_issue_snapshots
    ADD CONSTRAINT github_issue_snapshots_pkey PRIMARY KEY (id);


--
-- Name: github_object_coordinates github_object_coordinates_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_object_coordinates
    ADD CONSTRAINT github_object_coordinates_pkey PRIMARY KEY (id);


--
-- Name: github_object_relations github_object_relations_edge_uq; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_object_relations
    ADD CONSTRAINT github_object_relations_edge_uq UNIQUE (from_object_id, to_object_id, kind);


--
-- Name: github_object_relations github_object_relations_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_object_relations
    ADD CONSTRAINT github_object_relations_pkey PRIMARY KEY (id);


--
-- Name: github_objects github_objects_node_id_uq; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_objects
    ADD CONSTRAINT github_objects_node_id_uq UNIQUE (github_node_id);


--
-- Name: github_objects github_objects_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_objects
    ADD CONSTRAINT github_objects_pkey PRIMARY KEY (id);


--
-- Name: github_pr_snapshots github_pr_snapshots_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_pr_snapshots
    ADD CONSTRAINT github_pr_snapshots_pkey PRIMARY KEY (id);


--
-- Name: github_sync_cursors github_sync_cursors_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_sync_cursors
    ADD CONSTRAINT github_sync_cursors_pkey PRIMARY KEY (id);


--
-- Name: llm_proxy_backends llm_proxy_backends_name_key; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.llm_proxy_backends
    ADD CONSTRAINT llm_proxy_backends_name_key UNIQUE (name);


--
-- Name: llm_proxy_backends llm_proxy_backends_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.llm_proxy_backends
    ADD CONSTRAINT llm_proxy_backends_pkey PRIMARY KEY (id);


--
-- Name: llm_proxy_request_log llm_proxy_request_log_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.llm_proxy_request_log
    ADD CONSTRAINT llm_proxy_request_log_pkey PRIMARY KEY (id);


--
-- Name: poller_cursor poller_cursor_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.poller_cursor
    ADD CONSTRAINT poller_cursor_pkey PRIMARY KEY (task);


--
-- Name: pr_events pr_events_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.pr_events
    ADD CONSTRAINT pr_events_pkey PRIMARY KEY (pr_number);


--
-- Name: pr_status pr_status_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.pr_status
    ADD CONSTRAINT pr_status_pkey PRIMARY KEY (pr_number);


--
-- Name: provider_config provider_config_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.provider_config
    ADD CONSTRAINT provider_config_pkey PRIMARY KEY (id);


--
-- Name: provider_config provider_config_source_tier_priority_key; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.provider_config
    ADD CONSTRAINT provider_config_source_tier_priority_key UNIQUE (source, tier, priority);


--
-- Name: provider_health provider_health_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.provider_health
    ADD CONSTRAINT provider_health_pkey PRIMARY KEY (provider);


--
-- Name: qa_reviews qa_reviews_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.qa_reviews
    ADD CONSTRAINT qa_reviews_pkey PRIMARY KEY (id);


--
-- Name: tags tags_name_key; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.tags
    ADD CONSTRAINT tags_name_key UNIQUE (name);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: ticket_activity ticket_activity_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_activity
    ADD CONSTRAINT ticket_activity_pkey PRIMARY KEY (id);


--
-- Name: ticket_attachments ticket_attachments_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_attachments
    ADD CONSTRAINT ticket_attachments_pkey PRIMARY KEY (id);


--
-- Name: ticket_comments ticket_comments_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_comments
    ADD CONSTRAINT ticket_comments_pkey PRIMARY KEY (id);


--
-- Name: ticket_counters ticket_counters_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_counters
    ADD CONSTRAINT ticket_counters_pkey PRIMARY KEY (brand);


--
-- Name: ticket_embeddings ticket_embeddings_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_embeddings
    ADD CONSTRAINT ticket_embeddings_pkey PRIMARY KEY (id);


--
-- Name: ticket_injections ticket_injections_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_injections
    ADD CONSTRAINT ticket_injections_pkey PRIMARY KEY (id);


--
-- Name: ticket_links ticket_links_from_id_to_id_kind_key; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_links
    ADD CONSTRAINT ticket_links_from_id_to_id_kind_key UNIQUE (from_id, to_id, kind);


--
-- Name: ticket_links ticket_links_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_links
    ADD CONSTRAINT ticket_links_pkey PRIMARY KEY (id);


--
-- Name: ticket_plans ticket_plans_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_plans
    ADD CONSTRAINT ticket_plans_pkey PRIMARY KEY (id);


--
-- Name: ticket_tags ticket_tags_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_tags
    ADD CONSTRAINT ticket_tags_pkey PRIMARY KEY (ticket_id, tag_id);


--
-- Name: ticket_watchers ticket_watchers_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_watchers
    ADD CONSTRAINT ticket_watchers_pkey PRIMARY KEY (ticket_id, user_id);


--
-- Name: tickets tickets_external_id_key; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.tickets
    ADD CONSTRAINT tickets_external_id_key UNIQUE (external_id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: work_item_refs work_item_refs_pkey; Type: CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.work_item_refs
    ADD CONSTRAINT work_item_refs_pkey PRIMARY KEY (id);


--
-- Name: idx_applications_dossiers_job_id; Type: INDEX; Schema: applications; Owner: -
--

CREATE INDEX idx_applications_dossiers_job_id ON applications.dossiers USING btree (job_id);


--
-- Name: idx_applications_timeline_job_id; Type: INDEX; Schema: applications; Owner: -
--

CREATE INDEX idx_applications_timeline_job_id ON applications.timeline USING btree (job_id);


--
-- Name: audit_log_action_idx; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX audit_log_action_idx ON audit.audit_log USING btree (action, ts DESC);


--
-- Name: audit_log_actor_idx; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX audit_log_actor_idx ON audit.audit_log USING btree (actor_id, ts DESC);


--
-- Name: audit_log_ts_idx; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX audit_log_ts_idx ON audit.audit_log USING btree (ts DESC);


--
-- Name: idx_bachelorprojekt_features_brand; Type: INDEX; Schema: bachelorprojekt; Owner: -
--

CREATE INDEX idx_bachelorprojekt_features_brand ON bachelorprojekt.features USING btree (brand);


--
-- Name: idx_bachelorprojekt_features_requirement_id; Type: INDEX; Schema: bachelorprojekt; Owner: -
--

CREATE INDEX idx_bachelorprojekt_features_requirement_id ON bachelorprojekt.features USING btree (requirement_id);


--
-- Name: idx_bachelorprojekt_pipeline_req_id; Type: INDEX; Schema: bachelorprojekt; Owner: -
--

CREATE INDEX idx_bachelorprojekt_pipeline_req_id ON bachelorprojekt.pipeline USING btree (req_id);


--
-- Name: idx_bachelorprojekt_test_results_req_id; Type: INDEX; Schema: bachelorprojekt; Owner: -
--

CREATE INDEX idx_bachelorprojekt_test_results_req_id ON bachelorprojekt.test_results USING btree (req_id);


--
-- Name: idx_software_events_kind; Type: INDEX; Schema: bachelorprojekt; Owner: -
--

CREATE INDEX idx_software_events_kind ON bachelorprojekt.software_events USING btree (kind);


--
-- Name: idx_software_events_pr; Type: INDEX; Schema: bachelorprojekt; Owner: -
--

CREATE INDEX idx_software_events_pr ON bachelorprojekt.software_events USING btree (pr_number);


--
-- Name: idx_software_events_service; Type: INDEX; Schema: bachelorprojekt; Owner: -
--

CREATE INDEX idx_software_events_service ON bachelorprojekt.software_events USING btree (service);


--
-- Name: uq_components_name; Type: INDEX; Schema: bachelorprojekt; Owner: -
--

CREATE UNIQUE INDEX uq_components_name ON bachelorprojekt.components USING btree (lower(name));


--
-- Name: coaching_templates_brand_active_idx; Type: INDEX; Schema: brett; Owner: -
--

CREATE INDEX coaching_templates_brand_active_idx ON brett.coaching_templates USING btree (brand, is_active);


--
-- Name: idx_board_templates_brand_system_created; Type: INDEX; Schema: brett; Owner: -
--

CREATE INDEX idx_board_templates_brand_system_created ON brett.board_templates USING btree (brand, is_system, created_at DESC);


--
-- Name: uq_board_templates_brand_default; Type: INDEX; Schema: brett; Owner: -
--

CREATE UNIQUE INDEX uq_board_templates_brand_default ON brett.board_templates USING btree (brand) WHERE (is_default IS TRUE);


--
-- Name: uq_board_templates_brand_name_system; Type: INDEX; Schema: brett; Owner: -
--

CREATE UNIQUE INDEX uq_board_templates_brand_name_system ON brett.board_templates USING btree (brand, name) WHERE (is_system IS TRUE);


--
-- Name: idx_bug_tickets_brand; Type: INDEX; Schema: bugs; Owner: -
--

CREATE INDEX idx_bug_tickets_brand ON bugs.bug_tickets USING btree (brand);


--
-- Name: idx_bug_tickets_fixed_in_pr; Type: INDEX; Schema: bugs; Owner: -
--

CREATE INDEX idx_bug_tickets_fixed_in_pr ON bugs.bug_tickets USING btree (fixed_in_pr);


--
-- Name: idx_bug_tickets_status; Type: INDEX; Schema: bugs; Owner: -
--

CREATE INDEX idx_bug_tickets_status ON bugs.bug_tickets USING btree (status);


--
-- Name: coaching_projects_brand_client_idx; Type: INDEX; Schema: coaching; Owner: -
--

CREATE UNIQUE INDEX coaching_projects_brand_client_idx ON coaching.projects USING btree (brand, client_id);


--
-- Name: idx_assignments_client_id; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_assignments_client_id ON coaching.template_assignments USING btree (client_id);


--
-- Name: idx_assignments_template_id; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_assignments_template_id ON coaching.template_assignments USING btree (template_id);


--
-- Name: idx_audit_session; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_audit_session ON coaching.session_audit_log USING btree (session_id, changed_at DESC);


--
-- Name: idx_coaching_drafts_resulting_snippet_id; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_coaching_drafts_resulting_snippet_id ON coaching.drafts USING btree (resulting_snippet_id);


--
-- Name: idx_coaching_projects_client_id; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_coaching_projects_client_id ON coaching.projects USING btree (client_id);


--
-- Name: idx_coaching_sessions_ki_config_id; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_coaching_sessions_ki_config_id ON coaching.sessions USING btree (ki_config_id);


--
-- Name: idx_coaching_snippet_clusters_parent_id; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_coaching_snippet_clusters_parent_id ON coaching.snippet_clusters USING btree (parent_id);


--
-- Name: idx_coaching_snippets_knowledge_chunk_id; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_coaching_snippets_knowledge_chunk_id ON coaching.snippets USING btree (knowledge_chunk_id);


--
-- Name: idx_drafts_book_status; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_drafts_book_status ON coaching.drafts USING btree (book_id, status);


--
-- Name: idx_drafts_kind_status; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_drafts_kind_status ON coaching.drafts USING btree (template_kind, status);


--
-- Name: idx_sessions_brand; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_sessions_brand ON coaching.sessions USING btree (brand);


--
-- Name: idx_sessions_client; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_sessions_client ON coaching.sessions USING btree (client_id);


--
-- Name: idx_snippets_book_id; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_snippets_book_id ON coaching.snippets USING btree (book_id);


--
-- Name: idx_snippets_cluster_id; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_snippets_cluster_id ON coaching.snippets USING btree (cluster_id);


--
-- Name: idx_snippets_tags; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_snippets_tags ON coaching.snippets USING gin (tags);


--
-- Name: idx_templates_snippet_id; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_templates_snippet_id ON coaching.templates USING btree (snippet_id);


--
-- Name: idx_templates_surface_ref; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_templates_surface_ref ON coaching.templates USING btree (surface_ref);


--
-- Name: idx_templates_surface_status; Type: INDEX; Schema: coaching; Owner: -
--

CREATE INDEX idx_templates_surface_status ON coaching.templates USING btree (target_surface, status);


--
-- Name: uq_ki_config_one_active_per_brand; Type: INDEX; Schema: coaching; Owner: -
--

CREATE UNIQUE INDEX uq_ki_config_one_active_per_brand ON coaching.ki_config USING btree (brand) WHERE (is_active = true);


--
-- Name: chunks_collection; Type: INDEX; Schema: knowledge; Owner: -
--

CREATE INDEX chunks_collection ON knowledge.chunks USING btree (collection_id);


--
-- Name: chunks_embedding_hnsw; Type: INDEX; Schema: knowledge; Owner: -
--

CREATE INDEX chunks_embedding_hnsw ON knowledge.chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_knowledge_collections_brand; Type: INDEX; Schema: knowledge; Owner: -
--

CREATE INDEX idx_knowledge_collections_brand ON knowledge.collections USING btree (brand);


--
-- Name: eval_scores_role_idx; Type: INDEX; Schema: model_registry; Owner: -
--

CREATE INDEX eval_scores_role_idx ON model_registry.eval_scores USING btree (role);


--
-- Name: admin_actions_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_actions_actor_idx ON public.admin_actions USING btree (actor, created_at DESC);


--
-- Name: admin_actions_concurrent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_actions_concurrent_idx ON public.admin_actions USING btree (action, target, status) WHERE (status = 'in_progress'::text);


--
-- Name: admin_actions_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_actions_created_at_idx ON public.admin_actions USING btree (created_at DESC);


--
-- Name: ai_call_log_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_call_log_ts ON public.ai_call_log USING btree (ts DESC);


--
-- Name: billing_invoice_payments_invoice_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_invoice_payments_invoice_idx ON public.billing_invoice_payments USING btree (invoice_id);


--
-- Name: billing_nachweis_invoice_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_nachweis_invoice_idx ON public.billing_nachweis USING btree (invoice_id);


--
-- Name: business_memberships_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_memberships_brand_idx ON public.business_memberships USING btree (brand);


--
-- Name: business_memberships_user_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_memberships_user_key_idx ON public.business_memberships USING btree (user_key);


--
-- Name: client_notes_keycloak_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_notes_keycloak_user_id_idx ON public.client_notes USING btree (keycloak_user_id);


--
-- Name: code_embeddings_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX code_embeddings_embedding_hnsw ON public.code_embeddings USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: customer_project_attachments_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_project_attachments_project_idx ON public.customer_project_attachments USING btree (project_id);


--
-- Name: customer_projects_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_projects_brand_idx ON public.customer_projects USING btree (brand);


--
-- Name: customer_projects_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_projects_customer_idx ON public.customer_projects USING btree (customer_id) WHERE (customer_id IS NOT NULL);


--
-- Name: customer_projects_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_projects_parent_idx ON public.customer_projects USING btree (parent_id);


--
-- Name: error_log_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX error_log_ts_idx ON public.error_log USING btree (ts DESC);


--
-- Name: idx_artifacts_meeting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_artifacts_meeting ON public.meeting_artifacts USING btree (meeting_id);


--
-- Name: idx_assets_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_brand ON public.assets USING btree (brand);


--
-- Name: idx_assistant_conversations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_conversations_user ON public.assistant_conversations USING btree (user_sub, profile, last_active_at DESC);


--
-- Name: idx_assistant_messages_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_messages_conv ON public.assistant_messages USING btree (conversation_id, created_at);


--
-- Name: idx_billing_audit_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_audit_invoice ON public.billing_audit_log USING btree (invoice_id, created_at DESC);


--
-- Name: idx_billing_customers_customers_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_customers_customers_id ON public.billing_customers USING btree (customers_id);


--
-- Name: idx_billing_customers_leitweg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_customers_leitweg ON public.billing_customers USING btree (leitweg_id) WHERE (leitweg_id IS NOT NULL);


--
-- Name: idx_billing_invoice_dunnings_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_invoice_dunnings_brand ON public.billing_invoice_dunnings USING btree (brand);


--
-- Name: idx_billing_invoice_line_items__invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_invoice_line_items__invoice_id ON public.billing_invoice_line_items USING btree (invoice_id);


--
-- Name: idx_billing_invoice_payments_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_invoice_payments_brand ON public.billing_invoice_payments USING btree (brand);


--
-- Name: idx_billing_invoices__brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_invoices__brand ON public.billing_invoices USING btree (brand);


--
-- Name: idx_billing_invoices__cancels_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_invoices__cancels_invoice_id ON public.billing_invoices USING btree (cancels_invoice_id);


--
-- Name: idx_billing_invoices__customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_invoices__customer_id ON public.billing_invoices USING btree (customer_id);


--
-- Name: idx_billing_invoices__parent_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_invoices__parent_invoice_id ON public.billing_invoices USING btree (parent_invoice_id);


--
-- Name: idx_billing_nachweis_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_nachweis_brand ON public.billing_nachweis USING btree (brand);


--
-- Name: idx_billing_quotes__converted_to_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_quotes__converted_to_invoice_id ON public.billing_quotes USING btree (converted_to_invoice_id);


--
-- Name: idx_billing_quotes__customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_quotes__customer_id ON public.billing_quotes USING btree (customer_id);


--
-- Name: idx_billing_quotes_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_quotes_brand ON public.billing_quotes USING btree (brand);


--
-- Name: idx_brett_snapshots_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brett_snapshots_customer ON public.brett_snapshots USING btree (customer_id, created_at DESC);


--
-- Name: idx_brett_snapshots_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brett_snapshots_room ON public.brett_snapshots USING btree (room_token, created_at DESC);


--
-- Name: idx_brett_snapshots_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brett_snapshots_template ON public.brett_snapshots USING btree (is_template) WHERE is_template;


--
-- Name: idx_chat_message_reads_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_message_reads_customer_id ON public.chat_message_reads USING btree (customer_id);


--
-- Name: idx_chat_messages_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_room ON public.chat_messages USING btree (room_id, id);


--
-- Name: idx_chat_messages_sender_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_sender_customer_id ON public.chat_messages USING btree (sender_customer_id);


--
-- Name: idx_chat_room_members_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_room_members_customer_id ON public.chat_room_members USING btree (customer_id);


--
-- Name: idx_chat_rooms_direct_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_rooms_direct_customer_id ON public.chat_rooms USING btree (direct_customer_id);


--
-- Name: idx_customer_contact_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_contact_history_user ON public.customer_contact_history USING btree (keycloak_user_id, created_at DESC);


--
-- Name: idx_customer_project_attachments_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_project_attachments_uploaded_by ON public.customer_project_attachments USING btree (uploaded_by);


--
-- Name: idx_customer_projects_assignee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_projects_assignee_id ON public.customer_projects USING btree (assignee_id);


--
-- Name: idx_customers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_email ON public.customers USING btree (email);


--
-- Name: idx_doc_assignments_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doc_assignments_customer ON public.document_assignments USING btree (customer_id);


--
-- Name: idx_doc_assignments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doc_assignments_status ON public.document_assignments USING btree (status);


--
-- Name: idx_document_assignments_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_assignments_template_id ON public.document_assignments USING btree (template_id);


--
-- Name: idx_eur_bookings__brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eur_bookings__brand ON public.eur_bookings USING btree (brand);


--
-- Name: idx_eur_bookings__invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eur_bookings__invoice_id ON public.eur_bookings USING btree (invoice_id);


--
-- Name: idx_folder_templates_brand_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_folder_templates_brand_name ON public.folder_templates USING btree (brand, name);


--
-- Name: idx_folder_templates_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_folder_templates_default ON public.folder_templates USING btree (brand) WHERE is_default;


--
-- Name: idx_free_time_windows_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_free_time_windows_brand ON public.free_time_windows USING btree (brand);


--
-- Name: idx_inbox_items_bug_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbox_items_bug_ticket_id ON public.inbox_items USING btree (bug_ticket_id);


--
-- Name: idx_inbox_items_is_test_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbox_items_is_test_data ON public.inbox_items USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_inbox_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbox_items_status ON public.inbox_items USING btree (status, created_at DESC);


--
-- Name: idx_insights_meeting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insights_meeting ON public.meeting_insights USING btree (meeting_id);


--
-- Name: idx_learning_progress_admin_agg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_progress_admin_agg ON public.learning_progress USING btree (brand, keycloak_user_id);


--
-- Name: idx_learning_progress_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_progress_updated ON public.learning_progress USING btree (updated_at DESC);


--
-- Name: idx_meetings_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_customer ON public.meetings USING btree (customer_id);


--
-- Name: idx_meetings_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_project ON public.meetings USING btree (project_id);


--
-- Name: idx_meetings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_status ON public.meetings USING btree (status);


--
-- Name: idx_message_threads_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_threads_customer_id ON public.message_threads USING btree (customer_id);


--
-- Name: idx_message_threads_is_test_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_threads_is_test_data ON public.message_threads USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_messages_is_test_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_is_test_data ON public.messages USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_messages_sender_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender_customer_id ON public.messages USING btree (sender_customer_id);


--
-- Name: idx_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_thread ON public.messages USING btree (thread_id, id);


--
-- Name: idx_newsletter_send_log_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_send_log_campaign_id ON public.newsletter_send_log USING btree (campaign_id);


--
-- Name: idx_newsletter_send_log_subscriber_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_send_log_subscriber_id ON public.newsletter_send_log USING btree (subscriber_id);


--
-- Name: idx_onboarding_state_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_onboarding_state_brand ON public.onboarding_state USING btree (brand);


--
-- Name: idx_poll_answers_poll; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_poll_answers_poll ON public.poll_answers USING btree (poll_id, submitted_at DESC);


--
-- Name: idx_polls_one_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_polls_one_open ON public.polls USING btree ((true)) WHERE (status = 'open'::text);


--
-- Name: idx_prompt_library_brand_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prompt_library_brand_active ON public.prompt_library USING btree (brand) WHERE is_active;


--
-- Name: idx_qas_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qas_assignment ON public.questionnaire_assignment_scores USING btree (assignment_id);


--
-- Name: idx_questionnaire_answer_options_dimension_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questionnaire_answer_options_dimension_id ON public.questionnaire_answer_options USING btree (dimension_id);


--
-- Name: idx_questionnaire_answer_options_question_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questionnaire_answer_options_question_id ON public.questionnaire_answer_options USING btree (question_id);


--
-- Name: idx_questionnaire_answers_question_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questionnaire_answers_question_id ON public.questionnaire_answers USING btree (question_id);


--
-- Name: idx_questionnaire_assignments_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questionnaire_assignments_project_id ON public.questionnaire_assignments USING btree (project_id);


--
-- Name: idx_questionnaire_assignments_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questionnaire_assignments_template_id ON public.questionnaire_assignments USING btree (template_id);


--
-- Name: idx_questionnaire_dimensions_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questionnaire_dimensions_template_id ON public.questionnaire_dimensions USING btree (template_id);


--
-- Name: idx_questionnaire_questions_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questionnaire_questions_template_id ON public.questionnaire_questions USING btree (template_id);


--
-- Name: idx_questionnaire_test_evidence_question_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questionnaire_test_evidence_question_id ON public.questionnaire_test_evidence USING btree (question_id);


--
-- Name: idx_questionnaire_test_fixtures_question_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questionnaire_test_fixtures_question_id ON public.questionnaire_test_fixtures USING btree (question_id);


--
-- Name: idx_questionnaire_test_seed_registry_question_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questionnaire_test_seed_registry_question_id ON public.questionnaire_test_seed_registry USING btree (question_id);


--
-- Name: idx_questionnaire_test_status_evidence_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questionnaire_test_status_evidence_id ON public.questionnaire_test_status USING btree (evidence_id);


--
-- Name: idx_questionnaire_test_status_last_failure_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questionnaire_test_status_last_failure_ticket_id ON public.questionnaire_test_status USING btree (last_failure_ticket_id);


--
-- Name: idx_segments_transcript; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_segments_transcript ON public.transcript_segments USING btree (transcript_id);


--
-- Name: idx_session_events_room_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_session_events_room_seq ON public.session_events USING btree (room_token, seq);


--
-- Name: idx_session_events_room_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_events_room_token ON public.session_events USING btree (room_token, recorded_at);


--
-- Name: idx_session_events_session_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_events_session_code ON public.session_events USING btree (session_code, seq) WHERE (session_code IS NOT NULL);


--
-- Name: idx_share_tokens_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_tokens_room ON public.brett_share_tokens USING btree (room_token) WHERE (disabled_at IS NULL);


--
-- Name: idx_share_tokens_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_tokens_type ON public.brett_share_tokens USING btree (token_type, room_token) WHERE (disabled_at IS NULL);


--
-- Name: idx_supplier_invoices_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_brand ON public.supplier_invoices USING btree (brand);


--
-- Name: idx_supplier_invoices_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_supplier_id ON public.supplier_invoices USING btree (supplier_id);


--
-- Name: idx_tax_mode_changes_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_mode_changes_brand ON public.tax_mode_changes USING btree (brand);


--
-- Name: idx_time_entries_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_task_id ON public.time_entries USING btree (task_id);


--
-- Name: idx_transcripts_meeting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transcripts_meeting ON public.transcripts USING btree (meeting_id);


--
-- Name: inbox_items_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_items_brand_idx ON public.inbox_items USING btree (brand);


--
-- Name: ix_evidence_assignment_question; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_evidence_assignment_question ON public.questionnaire_test_evidence USING btree (assignment_id, question_id, attempt);


--
-- Name: ix_fixtures_unpurged; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_fixtures_unpurged ON public.questionnaire_test_fixtures USING btree (assignment_id) WHERE (purged_at IS NULL);


--
-- Name: ix_magic_tokens_unused; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_magic_tokens_unused ON public.systemtest_magic_tokens USING btree (expires_at) WHERE (used_at IS NULL);


--
-- Name: massage_invoices_brand_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX massage_invoices_brand_status_idx ON public.massage_invoices USING btree (brand, status);


--
-- Name: massage_invoices_brand_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX massage_invoices_brand_token_idx ON public.massage_invoices USING btree (brand, appointment_token) WHERE (appointment_token IS NOT NULL);


--
-- Name: massage_invoices_brand_year_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX massage_invoices_brand_year_number_idx ON public.massage_invoices USING btree (brand, invoice_year, invoice_number);


--
-- Name: test_results_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX test_results_run_id_idx ON public.test_results USING btree (run_id);


--
-- Name: test_results_test_id_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX test_results_test_id_created_idx ON public.test_results USING btree (test_id, created_at DESC);


--
-- Name: time_entries_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_entries_project_id_idx ON public.time_entries USING btree (project_id);


--
-- Name: uq_seed_registry_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_seed_registry_scope ON public.questionnaire_test_seed_registry USING btree (template_id, COALESCE(question_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: vat_id_validations_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_id_validations_customer_idx ON public.vat_id_validations USING btree (customer_id) WHERE (customer_id IS NOT NULL);


--
-- Name: idx_sessions_templates_created_from_template_id; Type: INDEX; Schema: sessions; Owner: -
--

CREATE INDEX idx_sessions_templates_created_from_template_id ON sessions.templates USING btree (created_from_template_id);


--
-- Name: idx_sessions_templates_default_slug; Type: INDEX; Schema: sessions; Owner: -
--

CREATE UNIQUE INDEX idx_sessions_templates_default_slug ON sessions.templates USING btree (slug) WHERE is_default;


--
-- Name: idx_sessions_templates_owner_slug; Type: INDEX; Schema: sessions; Owner: -
--

CREATE UNIQUE INDEX idx_sessions_templates_owner_slug ON sessions.templates USING btree (owner_id, slug) WHERE (NOT is_default);


--
-- Name: idx_studio_sessions_client_id; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX idx_studio_sessions_client_id ON studio.sessions USING btree (client_id);


--
-- Name: idx_studio_sessions_template_of; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX idx_studio_sessions_template_of ON studio.sessions USING btree (template_of);


--
-- Name: activity_ticket_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX activity_ticket_idx ON tickets.ticket_activity USING btree (ticket_id, created_at);


--
-- Name: cockpit_audit_occurred_at_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX cockpit_audit_occurred_at_idx ON tickets.cockpit_audit USING btree (occurred_at DESC);


--
-- Name: factory_model_slots_phase_key; Type: INDEX; Schema: tickets; Owner: -
--

CREATE UNIQUE INDEX factory_model_slots_phase_key ON tickets.factory_model_slots USING btree (phase);


--
-- Name: factory_phase_events_ticket_at_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX factory_phase_events_ticket_at_idx ON tickets.factory_phase_events USING btree (ticket_id, at DESC);


--
-- Name: factory_run_budget_date_provider_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX factory_run_budget_date_provider_idx ON tickets.factory_run_budget USING btree (run_date, provider);


--
-- Name: factory_run_budget_ticket_date_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX factory_run_budget_ticket_date_idx ON tickets.factory_run_budget USING btree (ticket_id, run_date);


--
-- Name: github_issue_snapshots_object_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX github_issue_snapshots_object_idx ON tickets.github_issue_snapshots USING btree (github_object_id, observed_at DESC);


--
-- Name: github_issue_snapshots_repo_num_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX github_issue_snapshots_repo_num_idx ON tickets.github_issue_snapshots USING btree (repository_node_id, object_number, observed_at DESC);


--
-- Name: github_object_coordinates_current_repo_number_uq; Type: INDEX; Schema: tickets; Owner: -
--

CREATE UNIQUE INDEX github_object_coordinates_current_repo_number_uq ON tickets.github_object_coordinates USING btree (repository_node_id, object_number) WHERE (valid_until IS NULL);


--
-- Name: github_object_coordinates_one_current_per_object_uq; Type: INDEX; Schema: tickets; Owner: -
--

CREATE UNIQUE INDEX github_object_coordinates_one_current_per_object_uq ON tickets.github_object_coordinates USING btree (github_object_id) WHERE (valid_until IS NULL);


--
-- Name: github_object_relations_from_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX github_object_relations_from_idx ON tickets.github_object_relations USING btree (from_object_id, kind);


--
-- Name: github_object_relations_to_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX github_object_relations_to_idx ON tickets.github_object_relations USING btree (to_object_id, kind);


--
-- Name: github_objects_provider_ref_uq; Type: INDEX; Schema: tickets; Owner: -
--

CREATE UNIQUE INDEX github_objects_provider_ref_uq ON tickets.github_objects USING btree (lower(provider_ref)) WHERE (provider_ref IS NOT NULL);


--
-- Name: github_pr_snapshots_object_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX github_pr_snapshots_object_idx ON tickets.github_pr_snapshots USING btree (github_object_id, observed_at DESC);


--
-- Name: github_pr_snapshots_repo_num_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX github_pr_snapshots_repo_num_idx ON tickets.github_pr_snapshots USING btree (repository_node_id, object_number, observed_at DESC);


--
-- Name: idx_tickets_tags_brand; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX idx_tickets_tags_brand ON tickets.tags USING btree (brand);


--
-- Name: idx_tickets_ticket_activity_actor_id; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX idx_tickets_ticket_activity_actor_id ON tickets.ticket_activity USING btree (actor_id);


--
-- Name: idx_tickets_ticket_attachments_uploaded_by; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX idx_tickets_ticket_attachments_uploaded_by ON tickets.ticket_attachments USING btree (uploaded_by);


--
-- Name: idx_tickets_ticket_comments_author_id; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX idx_tickets_ticket_comments_author_id ON tickets.ticket_comments USING btree (author_id);


--
-- Name: idx_tickets_ticket_links_created_by; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX idx_tickets_ticket_links_created_by ON tickets.ticket_links USING btree (created_by);


--
-- Name: idx_tickets_ticket_tags_tag_id; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX idx_tickets_ticket_tags_tag_id ON tickets.ticket_tags USING btree (tag_id);


--
-- Name: idx_tickets_ticket_watchers_user_id; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX idx_tickets_ticket_watchers_user_id ON tickets.ticket_watchers USING btree (user_id);


--
-- Name: idx_tickets_tickets_brand; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX idx_tickets_tickets_brand ON tickets.tickets USING btree (brand);


--
-- Name: idx_tickets_tickets_reporter_id; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX idx_tickets_tickets_reporter_id ON tickets.tickets USING btree (reporter_id);


--
-- Name: idx_tickets_tickets_source_test_assignment_id; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX idx_tickets_tickets_source_test_assignment_id ON tickets.tickets USING btree (source_test_assignment_id);


--
-- Name: idx_tickets_tickets_source_test_result_id; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX idx_tickets_tickets_source_test_result_id ON tickets.tickets USING btree (source_test_result_id);


--
-- Name: ix_tickets_test_data; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX ix_tickets_test_data ON tickets.tickets USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: llm_proxy_request_log_ticket; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX llm_proxy_request_log_ticket ON tickets.llm_proxy_request_log USING btree (dispatch_ticket, ts DESC) WHERE (dispatch_ticket IS NOT NULL);


--
-- Name: llm_proxy_request_log_ts; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX llm_proxy_request_log_ts ON tickets.llm_proxy_request_log USING btree (ts DESC);


--
-- Name: pr_events_brand_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX pr_events_brand_idx ON tickets.pr_events USING btree (brand) WHERE (brand IS NOT NULL);


--
-- Name: pr_events_category_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX pr_events_category_idx ON tickets.pr_events USING btree (category);


--
-- Name: pr_events_merged_at_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX pr_events_merged_at_idx ON tickets.pr_events USING btree (merged_at DESC);


--
-- Name: pr_status_ticket_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX pr_status_ticket_idx ON tickets.pr_status USING btree (ticket_id) WHERE (ticket_id IS NOT NULL);


--
-- Name: provider_config_coaching_active; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX provider_config_coaching_active ON tickets.provider_config USING btree (brand, source, is_active);


--
-- Name: provider_config_coaching_brand_provider; Type: INDEX; Schema: tickets; Owner: -
--

CREATE UNIQUE INDEX provider_config_coaching_brand_provider ON tickets.provider_config USING btree (brand, provider) WHERE (source = 'coaching'::text);


--
-- Name: qa_reviews_ticket_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX qa_reviews_ticket_idx ON tickets.qa_reviews USING btree (ticket_id);


--
-- Name: ticket_attachments_ticket_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX ticket_attachments_ticket_idx ON tickets.ticket_attachments USING btree (ticket_id);


--
-- Name: ticket_comments_ticket_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX ticket_comments_ticket_idx ON tickets.ticket_comments USING btree (ticket_id, created_at);


--
-- Name: ticket_embeddings_chunk_type_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX ticket_embeddings_chunk_type_idx ON tickets.ticket_embeddings USING btree (chunk_type);


--
-- Name: ticket_embeddings_hnsw_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX ticket_embeddings_hnsw_idx ON tickets.ticket_embeddings USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: ticket_embeddings_ticket_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX ticket_embeddings_ticket_idx ON tickets.ticket_embeddings USING btree (ticket_id);


--
-- Name: ticket_injections_open_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX ticket_injections_open_idx ON tickets.ticket_injections USING btree (ticket_id) WHERE (consumed_at IS NULL);


--
-- Name: ticket_injections_ticket_phase_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX ticket_injections_ticket_phase_idx ON tickets.ticket_injections USING btree (ticket_id, phase);


--
-- Name: ticket_links_from_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX ticket_links_from_idx ON tickets.ticket_links USING btree (from_id, kind);


--
-- Name: ticket_links_pr_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX ticket_links_pr_idx ON tickets.ticket_links USING btree (pr_number) WHERE (pr_number IS NOT NULL);


--
-- Name: ticket_links_to_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX ticket_links_to_idx ON tickets.ticket_links USING btree (to_id, kind);


--
-- Name: ticket_plans_ticket_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX ticket_plans_ticket_idx ON tickets.ticket_plans USING btree (ticket_id);


--
-- Name: tickets_assignee_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX tickets_assignee_idx ON tickets.tickets USING btree (assignee_id) WHERE (assignee_id IS NOT NULL);


--
-- Name: tickets_attention_mode_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX tickets_attention_mode_idx ON tickets.tickets USING btree (attention_mode) WHERE (status <> ALL (ARRAY['done'::text, 'archived'::text]));


--
-- Name: tickets_component_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX tickets_component_idx ON tickets.tickets USING btree (component) WHERE (component IS NOT NULL);


--
-- Name: tickets_customer_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX tickets_customer_idx ON tickets.tickets USING btree (customer_id) WHERE (customer_id IS NOT NULL);


--
-- Name: tickets_external_id_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX tickets_external_id_idx ON tickets.tickets USING btree (external_id);


--
-- Name: tickets_one_open_per_test_question_uq; Type: INDEX; Schema: tickets; Owner: -
--

CREATE UNIQUE INDEX tickets_one_open_per_test_question_uq ON tickets.tickets USING btree (source_test_question_id) WHERE ((source_test_question_id IS NOT NULL) AND (status <> ALL (ARRAY['done'::text, 'archived'::text])));


--
-- Name: tickets_one_open_per_test_run_test_uq; Type: INDEX; Schema: tickets; Owner: -
--

CREATE UNIQUE INDEX tickets_one_open_per_test_run_test_uq ON tickets.tickets USING btree (source_test_run_id, source_test_id) WHERE ((source_test_run_id IS NOT NULL) AND (source_test_id IS NOT NULL) AND (status <> ALL (ARRAY['done'::text, 'archived'::text])));


--
-- Name: tickets_parent_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX tickets_parent_idx ON tickets.tickets USING btree (parent_id);


--
-- Name: tickets_planning_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX tickets_planning_idx ON tickets.tickets USING btree (planning_rank, created_at) WHERE (status = 'planning'::text);


--
-- Name: tickets_source_test_run_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX tickets_source_test_run_idx ON tickets.tickets USING btree (source_test_run_id) WHERE (source_test_run_id IS NOT NULL);


--
-- Name: tickets_status_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX tickets_status_idx ON tickets.tickets USING btree (status) WHERE (status <> ALL (ARRAY['done'::text, 'archived'::text]));


--
-- Name: tickets_thesis_tag_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX tickets_thesis_tag_idx ON tickets.tickets USING btree (thesis_tag) WHERE (thesis_tag IS NOT NULL);


--
-- Name: tickets_type_brand_idx; Type: INDEX; Schema: tickets; Owner: -
--

CREATE INDEX tickets_type_brand_idx ON tickets.tickets USING btree (type, brand);


--
-- Name: work_item_refs_alias_pair_uq; Type: INDEX; Schema: tickets; Owner: -
--

CREATE UNIQUE INDEX work_item_refs_alias_pair_uq ON tickets.work_item_refs USING btree (ticket_id, github_object_id) WHERE (role = 'alias'::text);


--
-- Name: work_item_refs_one_active_pair_uq; Type: INDEX; Schema: tickets; Owner: -
--

CREATE UNIQUE INDEX work_item_refs_one_active_pair_uq ON tickets.work_item_refs USING btree (ticket_id, github_object_id) WHERE (valid_until IS NULL);


--
-- Name: work_item_refs_one_current_canonical_per_object_uq; Type: INDEX; Schema: tickets; Owner: -
--

CREATE UNIQUE INDEX work_item_refs_one_current_canonical_per_object_uq ON tickets.work_item_refs USING btree (github_object_id) WHERE ((role = 'canonical'::text) AND (valid_until IS NULL));


--
-- Name: work_item_refs_one_current_canonical_per_ticket_uq; Type: INDEX; Schema: tickets; Owner: -
--

CREATE UNIQUE INDEX work_item_refs_one_current_canonical_per_ticket_uq ON tickets.work_item_refs USING btree (ticket_id) WHERE ((role = 'canonical'::text) AND (valid_until IS NULL));


--
-- Name: billing_invoices billing_invoices_immutable_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER billing_invoices_immutable_trg BEFORE UPDATE ON public.billing_invoices FOR EACH ROW EXECUTE FUNCTION public.billing_invoices_immutable();


--
-- Name: billing_invoices billing_invoices_no_delete_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER billing_invoices_no_delete_trg BEFORE DELETE ON public.billing_invoices FOR EACH ROW EXECUTE FUNCTION public.billing_invoices_no_delete();


--
-- Name: billing_invoice_line_items billing_lines_immutable_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER billing_lines_immutable_trg BEFORE INSERT OR DELETE OR UPDATE ON public.billing_invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.billing_lines_immutable();


--
-- Name: cockpit_audit cockpit_notify_audit; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER cockpit_notify_audit AFTER INSERT OR UPDATE ON tickets.cockpit_audit FOR EACH ROW EXECUTE FUNCTION tickets.cockpit_notify('audit');


--
-- Name: llm_proxy_request_log cockpit_notify_dispatch; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER cockpit_notify_dispatch AFTER INSERT ON tickets.llm_proxy_request_log FOR EACH ROW EXECUTE FUNCTION tickets.cockpit_notify('dispatch');


--
-- Name: factory_phase_events cockpit_notify_factory; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER cockpit_notify_factory AFTER INSERT OR UPDATE ON tickets.factory_phase_events FOR EACH ROW EXECUTE FUNCTION tickets.cockpit_notify('factory');


--
-- Name: tickets cockpit_notify_tickets_ins; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER cockpit_notify_tickets_ins AFTER INSERT ON tickets.tickets FOR EACH ROW EXECUTE FUNCTION tickets.cockpit_notify('tickets');


--
-- Name: tickets cockpit_notify_tickets_upd; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER cockpit_notify_tickets_upd AFTER UPDATE ON tickets.tickets FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION tickets.cockpit_notify('tickets');


--
-- Name: github_object_coordinates github_coordinates_guard; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER github_coordinates_guard BEFORE INSERT OR DELETE OR UPDATE ON tickets.github_object_coordinates FOR EACH ROW EXECUTE FUNCTION tickets.fn_guard_github_coordinate();


--
-- Name: github_objects github_objects_immutable; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER github_objects_immutable BEFORE UPDATE ON tickets.github_objects FOR EACH ROW EXECUTE FUNCTION tickets.fn_guard_github_object_identity();


--
-- Name: github_object_relations github_relations_history_guard; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER github_relations_history_guard BEFORE DELETE OR UPDATE ON tickets.github_object_relations FOR EACH ROW EXECUTE FUNCTION tickets.fn_guard_github_relation_history();


--
-- Name: github_object_relations github_relations_validate; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER github_relations_validate BEFORE INSERT ON tickets.github_object_relations FOR EACH ROW EXECUTE FUNCTION tickets.fn_validate_github_relation();


--
-- Name: tickets tickets_epic_auto_close; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER tickets_epic_auto_close AFTER UPDATE OF status ON tickets.tickets FOR EACH ROW EXECUTE FUNCTION public.trg_systemtest_epic_auto_close();


--
-- Name: tickets tickets_resolution_retest; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER tickets_resolution_retest AFTER UPDATE OF resolution ON tickets.tickets FOR EACH ROW EXECUTE FUNCTION public.trg_systemtest_retest();


--
-- Name: tickets trg_notify_feature_inserted; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER trg_notify_feature_inserted AFTER INSERT ON tickets.tickets FOR EACH ROW WHEN ((new.type = ANY (ARRAY['feature'::text, 'feat'::text]))) EXECUTE FUNCTION tickets.notify_feature_inserted();


--
-- Name: tickets trg_tickets_assign_external_id; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER trg_tickets_assign_external_id BEFORE INSERT ON tickets.tickets FOR EACH ROW EXECUTE FUNCTION tickets.fn_assign_external_id();


--
-- Name: tickets trg_tickets_audit_log; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER trg_tickets_audit_log AFTER INSERT OR UPDATE ON tickets.tickets FOR EACH ROW EXECUTE FUNCTION tickets.fn_audit_log();


--
-- Name: tickets trg_tickets_lifecycle_ts; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER trg_tickets_lifecycle_ts BEFORE INSERT OR UPDATE ON tickets.tickets FOR EACH ROW EXECUTE FUNCTION tickets.fn_lifecycle_ts();


--
-- Name: tickets trg_tickets_prevent_cycle; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER trg_tickets_prevent_cycle BEFORE INSERT OR UPDATE OF parent_id ON tickets.tickets FOR EACH ROW WHEN ((new.parent_id IS NOT NULL)) EXECUTE FUNCTION tickets.fn_prevent_cycle();


--
-- Name: work_item_refs work_item_refs_guard; Type: TRIGGER; Schema: tickets; Owner: -
--

CREATE TRIGGER work_item_refs_guard BEFORE INSERT OR DELETE OR UPDATE ON tickets.work_item_refs FOR EACH ROW EXECUTE FUNCTION tickets.fn_guard_work_item_ref();


--
-- Name: dossiers dossiers_job_id_fkey; Type: FK CONSTRAINT; Schema: applications; Owner: -
--

ALTER TABLE ONLY applications.dossiers
    ADD CONSTRAINT dossiers_job_id_fkey FOREIGN KEY (job_id) REFERENCES applications.jobs(id) ON DELETE CASCADE;


--
-- Name: timeline timeline_job_id_fkey; Type: FK CONSTRAINT; Schema: applications; Owner: -
--

ALTER TABLE ONLY applications.timeline
    ADD CONSTRAINT timeline_job_id_fkey FOREIGN KEY (job_id) REFERENCES applications.jobs(id) ON DELETE CASCADE;


--
-- Name: features features_brand_fkey; Type: FK CONSTRAINT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.features
    ADD CONSTRAINT features_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: features features_requirement_id_fkey; Type: FK CONSTRAINT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.features
    ADD CONSTRAINT features_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES bachelorprojekt.requirements(id) ON DELETE SET NULL;


--
-- Name: pipeline pipeline_req_id_fkey; Type: FK CONSTRAINT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.pipeline
    ADD CONSTRAINT pipeline_req_id_fkey FOREIGN KEY (req_id) REFERENCES bachelorprojekt.requirements(id) ON DELETE CASCADE;


--
-- Name: software_events software_events_pr_number_fkey; Type: FK CONSTRAINT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.software_events
    ADD CONSTRAINT software_events_pr_number_fkey FOREIGN KEY (pr_number) REFERENCES bachelorprojekt.features(pr_number) ON DELETE CASCADE;


--
-- Name: test_results test_results_req_id_fkey; Type: FK CONSTRAINT; Schema: bachelorprojekt; Owner: -
--

ALTER TABLE ONLY bachelorprojekt.test_results
    ADD CONSTRAINT test_results_req_id_fkey FOREIGN KEY (req_id) REFERENCES bachelorprojekt.requirements(id) ON DELETE CASCADE;


--
-- Name: bug_tickets bug_tickets_brand_fkey; Type: FK CONSTRAINT; Schema: bugs; Owner: -
--

ALTER TABLE ONLY bugs.bug_tickets
    ADD CONSTRAINT bug_tickets_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: books books_knowledge_collection_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.books
    ADD CONSTRAINT books_knowledge_collection_id_fkey FOREIGN KEY (knowledge_collection_id) REFERENCES knowledge.collections(id) ON DELETE CASCADE;


--
-- Name: drafts drafts_book_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.drafts
    ADD CONSTRAINT drafts_book_id_fkey FOREIGN KEY (book_id) REFERENCES coaching.books(id) ON DELETE CASCADE;


--
-- Name: drafts drafts_knowledge_chunk_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.drafts
    ADD CONSTRAINT drafts_knowledge_chunk_id_fkey FOREIGN KEY (knowledge_chunk_id) REFERENCES knowledge.chunks(id) ON DELETE CASCADE;


--
-- Name: drafts drafts_resulting_snippet_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.drafts
    ADD CONSTRAINT drafts_resulting_snippet_id_fkey FOREIGN KEY (resulting_snippet_id) REFERENCES coaching.snippets(id) ON DELETE SET NULL;


--
-- Name: projects projects_client_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.projects
    ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.customers(id);


--
-- Name: session_audit_log session_audit_log_session_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.session_audit_log
    ADD CONSTRAINT session_audit_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES coaching.sessions(id) ON DELETE CASCADE;


--
-- Name: session_steps session_steps_session_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.session_steps
    ADD CONSTRAINT session_steps_session_id_fkey FOREIGN KEY (session_id) REFERENCES coaching.sessions(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_brand_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.sessions
    ADD CONSTRAINT sessions_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sessions sessions_client_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.sessions
    ADD CONSTRAINT sessions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: snippet_clusters snippet_clusters_book_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.snippet_clusters
    ADD CONSTRAINT snippet_clusters_book_id_fkey FOREIGN KEY (book_id) REFERENCES coaching.books(id) ON DELETE CASCADE;


--
-- Name: snippet_clusters snippet_clusters_parent_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.snippet_clusters
    ADD CONSTRAINT snippet_clusters_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES coaching.snippet_clusters(id) ON DELETE SET NULL;


--
-- Name: snippets snippets_book_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.snippets
    ADD CONSTRAINT snippets_book_id_fkey FOREIGN KEY (book_id) REFERENCES coaching.books(id) ON DELETE CASCADE;


--
-- Name: snippets snippets_cluster_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.snippets
    ADD CONSTRAINT snippets_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES coaching.snippet_clusters(id) ON DELETE SET NULL;


--
-- Name: snippets snippets_knowledge_chunk_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.snippets
    ADD CONSTRAINT snippets_knowledge_chunk_id_fkey FOREIGN KEY (knowledge_chunk_id) REFERENCES knowledge.chunks(id) ON DELETE SET NULL;


--
-- Name: template_assignments template_assignments_template_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.template_assignments
    ADD CONSTRAINT template_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES coaching.templates(id) ON DELETE CASCADE;


--
-- Name: templates templates_snippet_id_fkey; Type: FK CONSTRAINT; Schema: coaching; Owner: -
--

ALTER TABLE ONLY coaching.templates
    ADD CONSTRAINT templates_snippet_id_fkey FOREIGN KEY (snippet_id) REFERENCES coaching.snippets(id) ON DELETE CASCADE;


--
-- Name: chunks chunks_collection_id_fkey; Type: FK CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE ONLY knowledge.chunks
    ADD CONSTRAINT chunks_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES knowledge.collections(id) ON DELETE CASCADE;


--
-- Name: chunks chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE ONLY knowledge.chunks
    ADD CONSTRAINT chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES knowledge.documents(id) ON DELETE CASCADE;


--
-- Name: collections collections_brand_fkey; Type: FK CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE ONLY knowledge.collections
    ADD CONSTRAINT collections_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: documents documents_collection_id_fkey; Type: FK CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE ONLY knowledge.documents
    ADD CONSTRAINT documents_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES knowledge.collections(id) ON DELETE CASCADE;


--
-- Name: deployment_config deployment_config_adapter_id_fkey; Type: FK CONSTRAINT; Schema: model_registry; Owner: -
--

ALTER TABLE ONLY model_registry.deployment_config
    ADD CONSTRAINT deployment_config_adapter_id_fkey FOREIGN KEY (adapter_id) REFERENCES model_registry.adapters(id);


--
-- Name: eval_scores eval_scores_adapter_id_fkey; Type: FK CONSTRAINT; Schema: model_registry; Owner: -
--

ALTER TABLE ONLY model_registry.eval_scores
    ADD CONSTRAINT eval_scores_adapter_id_fkey FOREIGN KEY (adapter_id) REFERENCES model_registry.adapters(id);


--
-- Name: provenance provenance_adapter_id_fkey; Type: FK CONSTRAINT; Schema: model_registry; Owner: -
--

ALTER TABLE ONLY model_registry.provenance
    ADD CONSTRAINT provenance_adapter_id_fkey FOREIGN KEY (adapter_id) REFERENCES model_registry.adapters(id);


--
-- Name: stat_requirements stat_requirements_adapter_id_fkey; Type: FK CONSTRAINT; Schema: model_registry; Owner: -
--

ALTER TABLE ONLY model_registry.stat_requirements
    ADD CONSTRAINT stat_requirements_adapter_id_fkey FOREIGN KEY (adapter_id) REFERENCES model_registry.adapters(id);


--
-- Name: assets assets_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: assistant_messages assistant_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_messages
    ADD CONSTRAINT assistant_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.assistant_conversations(id) ON DELETE CASCADE;


--
-- Name: billing_audit_log billing_audit_log_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_audit_log
    ADD CONSTRAINT billing_audit_log_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id);


--
-- Name: billing_customers billing_customers_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: billing_customers billing_customers_customers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_customers_id_fkey FOREIGN KEY (customers_id) REFERENCES public.customers(id);


--
-- Name: billing_invoice_documents billing_invoice_documents_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_documents
    ADD CONSTRAINT billing_invoice_documents_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id) ON DELETE CASCADE;


--
-- Name: billing_invoice_dunnings billing_invoice_dunnings_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_dunnings
    ADD CONSTRAINT billing_invoice_dunnings_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: billing_invoice_dunnings billing_invoice_dunnings_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_dunnings
    ADD CONSTRAINT billing_invoice_dunnings_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id);


--
-- Name: billing_invoice_line_items billing_invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_line_items
    ADD CONSTRAINT billing_invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id) ON DELETE CASCADE;


--
-- Name: billing_invoice_payments billing_invoice_payments_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_payments
    ADD CONSTRAINT billing_invoice_payments_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: billing_invoice_payments billing_invoice_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_payments
    ADD CONSTRAINT billing_invoice_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id);


--
-- Name: billing_invoices billing_invoices_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: billing_invoices billing_invoices_cancels_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_cancels_invoice_id_fkey FOREIGN KEY (cancels_invoice_id) REFERENCES public.billing_invoices(id);


--
-- Name: billing_invoices billing_invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.billing_customers(id);


--
-- Name: billing_invoices billing_invoices_parent_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_parent_invoice_id_fkey FOREIGN KEY (parent_invoice_id) REFERENCES public.billing_invoices(id);


--
-- Name: billing_nachweis billing_nachweis_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_nachweis
    ADD CONSTRAINT billing_nachweis_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: billing_nachweis billing_nachweis_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_nachweis
    ADD CONSTRAINT billing_nachweis_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id);


--
-- Name: billing_quotes billing_quotes_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_quotes
    ADD CONSTRAINT billing_quotes_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: billing_quotes billing_quotes_converted_to_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_quotes
    ADD CONSTRAINT billing_quotes_converted_to_invoice_id_fkey FOREIGN KEY (converted_to_invoice_id) REFERENCES public.billing_invoices(id);


--
-- Name: billing_quotes billing_quotes_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_quotes
    ADD CONSTRAINT billing_quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.billing_customers(id);


--
-- Name: billing_suppliers billing_suppliers_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_suppliers
    ADD CONSTRAINT billing_suppliers_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: brett_snapshots brett_snapshots_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brett_snapshots
    ADD CONSTRAINT brett_snapshots_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: business_memberships business_memberships_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_memberships
    ADD CONSTRAINT business_memberships_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: chat_message_reads chat_message_reads_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: chat_message_reads chat_message_reads_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id);


--
-- Name: chat_messages chat_messages_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id);


--
-- Name: chat_messages chat_messages_sender_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_customer_id_fkey FOREIGN KEY (sender_customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: chat_room_members chat_room_members_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_room_members
    ADD CONSTRAINT chat_room_members_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: chat_room_members chat_room_members_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_room_members
    ADD CONSTRAINT chat_room_members_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id);


--
-- Name: chat_rooms chat_rooms_direct_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_direct_customer_id_fkey FOREIGN KEY (direct_customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: customer_project_attachments customer_project_attachments_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_project_attachments
    ADD CONSTRAINT customer_project_attachments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.customer_projects(id) ON DELETE CASCADE;


--
-- Name: customer_project_attachments customer_project_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_project_attachments
    ADD CONSTRAINT customer_project_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: customer_projects customer_projects_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_projects
    ADD CONSTRAINT customer_projects_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: customer_projects customer_projects_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_projects
    ADD CONSTRAINT customer_projects_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: customer_projects customer_projects_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_projects
    ADD CONSTRAINT customer_projects_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: customer_projects customer_projects_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_projects
    ADD CONSTRAINT customer_projects_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.customer_projects(id) ON DELETE SET NULL;


--
-- Name: document_assignments document_assignments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_assignments
    ADD CONSTRAINT document_assignments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: document_assignments document_assignments_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_assignments
    ADD CONSTRAINT document_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.document_templates(id) ON DELETE CASCADE;


--
-- Name: eur_bookings eur_bookings_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eur_bookings
    ADD CONSTRAINT eur_bookings_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: eur_bookings eur_bookings_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eur_bookings
    ADD CONSTRAINT eur_bookings_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id);


--
-- Name: free_time_windows free_time_windows_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.free_time_windows
    ADD CONSTRAINT free_time_windows_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inbox_items inbox_items_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_items
    ADD CONSTRAINT inbox_items_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inbox_items inbox_items_bug_ticket_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_items
    ADD CONSTRAINT inbox_items_bug_ticket_fkey FOREIGN KEY (bug_ticket_id) REFERENCES tickets.tickets(external_id) ON DELETE CASCADE;


--
-- Name: invoice_counters invoice_counters_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_counters
    ADD CONSTRAINT invoice_counters_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: learning_progress learning_progress_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_progress
    ADD CONSTRAINT learning_progress_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: legal_pages legal_pages_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_pages
    ADD CONSTRAINT legal_pages_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leistungen_config leistungen_config_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leistungen_config
    ADD CONSTRAINT leistungen_config_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: massage_invoice_sequences massage_invoice_sequences_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.massage_invoice_sequences
    ADD CONSTRAINT massage_invoice_sequences_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: massage_invoices massage_invoices_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.massage_invoices
    ADD CONSTRAINT massage_invoices_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: massage_invoices massage_invoices_cancels_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.massage_invoices
    ADD CONSTRAINT massage_invoices_cancels_invoice_id_fkey FOREIGN KEY (cancels_invoice_id) REFERENCES public.massage_invoices(id);


--
-- Name: meeting_artifacts meeting_artifacts_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_artifacts
    ADD CONSTRAINT meeting_artifacts_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_insights meeting_insights_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_insights
    ADD CONSTRAINT meeting_insights_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meetings meetings_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: message_threads message_threads_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_threads
    ADD CONSTRAINT message_threads_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: messages messages_sender_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_customer_id_fkey FOREIGN KEY (sender_customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: messages messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.message_threads(id);


--
-- Name: newsletter_send_log newsletter_send_log_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_send_log
    ADD CONSTRAINT newsletter_send_log_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.newsletter_campaigns(id);


--
-- Name: newsletter_send_log newsletter_send_log_subscriber_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_send_log
    ADD CONSTRAINT newsletter_send_log_subscriber_id_fkey FOREIGN KEY (subscriber_id) REFERENCES public.newsletter_subscribers(id);


--
-- Name: onboarding_state onboarding_state_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_state
    ADD CONSTRAINT onboarding_state_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: poll_answers poll_answers_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poll_answers
    ADD CONSTRAINT poll_answers_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE CASCADE;


--
-- Name: questionnaire_test_status qts_evidence_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_status
    ADD CONSTRAINT qts_evidence_id_fk FOREIGN KEY (evidence_id) REFERENCES public.questionnaire_test_evidence(id);


--
-- Name: questionnaire_test_status qts_failure_ticket_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_status
    ADD CONSTRAINT qts_failure_ticket_fk FOREIGN KEY (last_failure_ticket_id) REFERENCES tickets.tickets(id);


--
-- Name: questionnaire_answer_options questionnaire_answer_options_dimension_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_answer_options
    ADD CONSTRAINT questionnaire_answer_options_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES public.questionnaire_dimensions(id) ON DELETE SET NULL;


--
-- Name: questionnaire_answer_options questionnaire_answer_options_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_answer_options
    ADD CONSTRAINT questionnaire_answer_options_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id) ON DELETE CASCADE;


--
-- Name: questionnaire_answers questionnaire_answers_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_answers
    ADD CONSTRAINT questionnaire_answers_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.questionnaire_assignments(id) ON DELETE CASCADE;


--
-- Name: questionnaire_answers questionnaire_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_answers
    ADD CONSTRAINT questionnaire_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id);


--
-- Name: questionnaire_assignment_scores questionnaire_assignment_scores_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_assignment_scores
    ADD CONSTRAINT questionnaire_assignment_scores_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.questionnaire_assignments(id) ON DELETE CASCADE;


--
-- Name: questionnaire_assignments questionnaire_assignments_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_assignments
    ADD CONSTRAINT questionnaire_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.questionnaire_templates(id);


--
-- Name: questionnaire_dimensions questionnaire_dimensions_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_dimensions
    ADD CONSTRAINT questionnaire_dimensions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.questionnaire_templates(id) ON DELETE CASCADE;


--
-- Name: questionnaire_questions questionnaire_questions_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_questions
    ADD CONSTRAINT questionnaire_questions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.questionnaire_templates(id) ON DELETE CASCADE;


--
-- Name: questionnaire_test_evidence questionnaire_test_evidence_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_evidence
    ADD CONSTRAINT questionnaire_test_evidence_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.questionnaire_assignments(id) ON DELETE CASCADE;


--
-- Name: questionnaire_test_evidence questionnaire_test_evidence_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_evidence
    ADD CONSTRAINT questionnaire_test_evidence_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id);


--
-- Name: questionnaire_test_fixtures questionnaire_test_fixtures_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_fixtures
    ADD CONSTRAINT questionnaire_test_fixtures_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.questionnaire_assignments(id) ON DELETE CASCADE;


--
-- Name: questionnaire_test_fixtures questionnaire_test_fixtures_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_fixtures
    ADD CONSTRAINT questionnaire_test_fixtures_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id);


--
-- Name: questionnaire_test_seed_registry questionnaire_test_seed_registry_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_seed_registry
    ADD CONSTRAINT questionnaire_test_seed_registry_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id) ON DELETE CASCADE;


--
-- Name: questionnaire_test_seed_registry questionnaire_test_seed_registry_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_seed_registry
    ADD CONSTRAINT questionnaire_test_seed_registry_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.questionnaire_templates(id) ON DELETE CASCADE;


--
-- Name: questionnaire_test_status questionnaire_test_status_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_test_status
    ADD CONSTRAINT questionnaire_test_status_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id) ON DELETE CASCADE;


--
-- Name: referenzen_config referenzen_config_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referenzen_config
    ADD CONSTRAINT referenzen_config_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: service_config service_config_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_config
    ADD CONSTRAINT service_config_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: service_page_config service_page_config_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_page_config
    ADD CONSTRAINT service_page_config_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: site_settings site_settings_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supplier_invoices supplier_invoices_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supplier_invoices supplier_invoices_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.billing_suppliers(id);


--
-- Name: tax_mode_changes tax_mode_changes_brand_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_mode_changes
    ADD CONSTRAINT tax_mode_changes_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: test_results test_results_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.test_runs(id) ON DELETE CASCADE;


--
-- Name: time_entries time_entries_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.customer_projects(id) ON DELETE CASCADE;


--
-- Name: time_entries time_entries_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.customer_projects(id) ON DELETE SET NULL;


--
-- Name: transcript_segments transcript_segments_transcript_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcript_segments
    ADD CONSTRAINT transcript_segments_transcript_id_fkey FOREIGN KEY (transcript_id) REFERENCES public.transcripts(id) ON DELETE CASCADE;


--
-- Name: transcripts transcripts_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: vat_id_validations vat_id_validations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_id_validations
    ADD CONSTRAINT vat_id_validations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.billing_customers(id);


--
-- Name: templates templates_created_from_template_id_fkey; Type: FK CONSTRAINT; Schema: sessions; Owner: -
--

ALTER TABLE ONLY sessions.templates
    ADD CONSTRAINT templates_created_from_template_id_fkey FOREIGN KEY (created_from_template_id) REFERENCES sessions.templates(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_client_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.profiles
    ADD CONSTRAINT profiles_client_id_fkey FOREIGN KEY (client_id) REFERENCES studio.clients(id) ON DELETE CASCADE;


--
-- Name: session_levels session_levels_session_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.session_levels
    ADD CONSTRAINT session_levels_session_id_fkey FOREIGN KEY (session_id) REFERENCES studio.sessions(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_client_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.sessions
    ADD CONSTRAINT sessions_client_id_fkey FOREIGN KEY (client_id) REFERENCES studio.clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_template_of_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.sessions
    ADD CONSTRAINT sessions_template_of_fkey FOREIGN KEY (template_of) REFERENCES studio.sessions(id);


--
-- Name: factory_phase_events factory_phase_events_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.factory_phase_events
    ADD CONSTRAINT factory_phase_events_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: factory_run_budget factory_run_budget_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.factory_run_budget
    ADD CONSTRAINT factory_run_budget_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: feature_flags feature_flags_brand_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.feature_flags
    ADD CONSTRAINT feature_flags_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: github_issue_snapshots github_issue_snapshots_github_object_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_issue_snapshots
    ADD CONSTRAINT github_issue_snapshots_github_object_id_fkey FOREIGN KEY (github_object_id) REFERENCES tickets.github_objects(id) ON DELETE CASCADE;


--
-- Name: github_object_coordinates github_object_coordinates_github_object_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_object_coordinates
    ADD CONSTRAINT github_object_coordinates_github_object_id_fkey FOREIGN KEY (github_object_id) REFERENCES tickets.github_objects(id) ON DELETE RESTRICT;


--
-- Name: github_object_relations github_object_relations_from_object_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_object_relations
    ADD CONSTRAINT github_object_relations_from_object_id_fkey FOREIGN KEY (from_object_id) REFERENCES tickets.github_objects(id) ON DELETE RESTRICT;


--
-- Name: github_object_relations github_object_relations_to_object_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_object_relations
    ADD CONSTRAINT github_object_relations_to_object_id_fkey FOREIGN KEY (to_object_id) REFERENCES tickets.github_objects(id) ON DELETE RESTRICT;


--
-- Name: github_pr_snapshots github_pr_snapshots_github_object_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.github_pr_snapshots
    ADD CONSTRAINT github_pr_snapshots_github_object_id_fkey FOREIGN KEY (github_object_id) REFERENCES tickets.github_objects(id) ON DELETE CASCADE;


--
-- Name: pr_events pr_events_brand_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.pr_events
    ADD CONSTRAINT pr_events_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: qa_reviews qa_reviews_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.qa_reviews
    ADD CONSTRAINT qa_reviews_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: tags tags_brand_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.tags
    ADD CONSTRAINT tags_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ticket_activity ticket_activity_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_activity
    ADD CONSTRAINT ticket_activity_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_attachments ticket_attachments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_attachments
    ADD CONSTRAINT ticket_attachments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_comments ticket_comments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_comments
    ADD CONSTRAINT ticket_comments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_counters ticket_counters_brand_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_counters
    ADD CONSTRAINT ticket_counters_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ticket_embeddings ticket_embeddings_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_embeddings
    ADD CONSTRAINT ticket_embeddings_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_injections ticket_injections_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_injections
    ADD CONSTRAINT ticket_injections_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_links ticket_links_from_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_links
    ADD CONSTRAINT ticket_links_from_id_fkey FOREIGN KEY (from_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_links ticket_links_to_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_links
    ADD CONSTRAINT ticket_links_to_id_fkey FOREIGN KEY (to_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_plans ticket_plans_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_plans
    ADD CONSTRAINT ticket_plans_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_tags ticket_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_tags
    ADD CONSTRAINT ticket_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tickets.tags(id) ON DELETE CASCADE;


--
-- Name: ticket_tags ticket_tags_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_tags
    ADD CONSTRAINT ticket_tags_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_watchers ticket_watchers_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.ticket_watchers
    ADD CONSTRAINT ticket_watchers_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_brand_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.tickets
    ADD CONSTRAINT tickets_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tickets tickets_parent_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.tickets
    ADD CONSTRAINT tickets_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES tickets.tickets(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_source_assignment_fk; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.tickets
    ADD CONSTRAINT tickets_source_assignment_fk FOREIGN KEY (source_test_assignment_id) REFERENCES public.questionnaire_assignments(id);


--
-- Name: tickets tickets_source_question_fk; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.tickets
    ADD CONSTRAINT tickets_source_question_fk FOREIGN KEY (source_test_question_id) REFERENCES public.questionnaire_questions(id);


--
-- Name: tickets tickets_source_test_result_fk; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.tickets
    ADD CONSTRAINT tickets_source_test_result_fk FOREIGN KEY (source_test_result_id) REFERENCES public.test_results(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_source_test_run_fk; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.tickets
    ADD CONSTRAINT tickets_source_test_run_fk FOREIGN KEY (source_test_run_id) REFERENCES public.test_runs(id) ON DELETE SET NULL;


--
-- Name: work_item_refs work_item_refs_github_object_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.work_item_refs
    ADD CONSTRAINT work_item_refs_github_object_id_fkey FOREIGN KEY (github_object_id) REFERENCES tickets.github_objects(id) ON DELETE RESTRICT;


--
-- Name: work_item_refs work_item_refs_ticket_id_fkey; Type: FK CONSTRAINT; Schema: tickets; Owner: -
--

ALTER TABLE ONLY tickets.work_item_refs
    ADD CONSTRAINT work_item_refs_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict yong47TuUB3w74bHX2KuTP10TsbdXyHTMFdPYzfCeLMdmuSfahJmymWd7ELxTMp

