-- Schema drift fix: entire questionnaire schema missing on korczewski
-- Root cause: the questionnaire/systemtest feature was built on mentolder
-- but the DB migrations never applied to korczewski.
-- Effect: all 4 systemtest CronJobs fail with exit-22 (HTTP 500).
--
-- DDL generated from mentolder pg_dump --schema-only --no-owner --no-acl
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Apply with: kubectl exec -i <pgpod> -n workspace-korczewski -- psql -U postgres -d website < <this-file>

SET search_path = public;

BEGIN;

-- Tables (dependency order: parents before children)
CREATE TABLE IF NOT EXISTS public.questionnaire_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    is_system_test boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.questionnaire_dimensions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    threshold_mid integer,
    threshold_high integer,
    score_multiplier integer DEFAULT 1 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.questionnaire_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    question_text text NOT NULL,
    question_type text DEFAULT 'ab_choice'::text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    test_expected_result text,
    test_function_url text,
    test_menu_path text,
    test_role text
);

CREATE TABLE IF NOT EXISTS public.questionnaire_answer_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    option_key text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    dimension_id uuid,
    weight integer DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.questionnaire_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    template_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    coach_notes text DEFAULT ''::text NOT NULL,
    assigned_at timestamptz DEFAULT now() NOT NULL,
    submitted_at timestamptz,
    reviewed_at timestamptz,
    dismissed_at timestamptz,
    dismiss_reason text,
    project_id uuid,
    archived_at timestamptz,
    is_test_data boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.questionnaire_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    question_id uuid NOT NULL,
    option_key text NOT NULL,
    saved_at timestamptz DEFAULT now() NOT NULL,
    details_text text
);

CREATE TABLE IF NOT EXISTS public.questionnaire_assignment_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    dimension_id uuid NOT NULL,
    final_score integer NOT NULL,
    threshold_mid integer,
    threshold_high integer,
    level text,
    snapshot_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.questionnaire_test_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    question_id uuid NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    replay_path text,
    partial boolean DEFAULT false NOT NULL,
    console_log jsonb,
    network_log jsonb,
    recorded_from timestamptz,
    recorded_to timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.questionnaire_test_fixtures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    question_id uuid NOT NULL,
    attempt integer NOT NULL,
    table_name text NOT NULL,
    row_id uuid NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    purged_at timestamptz,
    purge_error text
);

CREATE TABLE IF NOT EXISTS public.questionnaire_test_seed_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    question_id uuid,
    seed_module text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.questionnaire_test_status (
    question_id uuid NOT NULL,
    last_result text NOT NULL,
    last_result_at timestamptz NOT NULL,
    last_success_at timestamptz,
    last_assignment_id uuid,
    evidence_id uuid,
    last_failure_ticket_id uuid,
    retest_pending_at timestamptz,
    retest_attempt integer DEFAULT 0 NOT NULL,
    CONSTRAINT questionnaire_test_status_last_result_check
        CHECK ((last_result = ANY (ARRAY['erfüllt'::text, 'teilweise'::text, 'nicht_erfüllt'::text])))
);

-- Primary keys
ALTER TABLE ONLY public.questionnaire_templates
    ADD CONSTRAINT questionnaire_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.questionnaire_dimensions
    ADD CONSTRAINT questionnaire_dimensions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.questionnaire_questions
    ADD CONSTRAINT questionnaire_questions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.questionnaire_answer_options
    ADD CONSTRAINT questionnaire_answer_options_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.questionnaire_assignments
    ADD CONSTRAINT questionnaire_assignments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.questionnaire_answers
    ADD CONSTRAINT questionnaire_answers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.questionnaire_answers
    ADD CONSTRAINT questionnaire_answers_assignment_id_question_id_key UNIQUE (assignment_id, question_id);
ALTER TABLE ONLY public.questionnaire_assignment_scores
    ADD CONSTRAINT questionnaire_assignment_scores_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.questionnaire_assignment_scores
    ADD CONSTRAINT uq_qas_assignment_dimension UNIQUE (assignment_id, dimension_id);
ALTER TABLE ONLY public.questionnaire_test_evidence
    ADD CONSTRAINT questionnaire_test_evidence_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.questionnaire_test_fixtures
    ADD CONSTRAINT questionnaire_test_fixtures_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.questionnaire_test_seed_registry
    ADD CONSTRAINT questionnaire_test_seed_registry_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.questionnaire_test_status
    ADD CONSTRAINT questionnaire_test_status_pkey PRIMARY KEY (question_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_questionnaire_dimensions__template_id ON public.questionnaire_dimensions(template_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_questions__template_id ON public.questionnaire_questions(template_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_answer_options__question_id ON public.questionnaire_answer_options(question_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_answer_options__dimension_id ON public.questionnaire_answer_options(dimension_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_assignments__template_id ON public.questionnaire_assignments(template_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_assignments__project_id ON public.questionnaire_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_answers__question_id ON public.questionnaire_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_qas_assignment ON public.questionnaire_assignment_scores(assignment_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_test_evidence__question_id ON public.questionnaire_test_evidence(question_id);
CREATE INDEX IF NOT EXISTS ix_evidence_assignment_question ON public.questionnaire_test_evidence(assignment_id, question_id, attempt);
CREATE INDEX IF NOT EXISTS idx_questionnaire_test_fixtures__question_id ON public.questionnaire_test_fixtures(question_id);
CREATE INDEX IF NOT EXISTS ix_fixtures_unpurged ON public.questionnaire_test_fixtures(assignment_id) WHERE (purged_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_questionnaire_test_seed_registry__question_id ON public.questionnaire_test_seed_registry(question_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_registry_scope ON public.questionnaire_test_seed_registry(template_id, COALESCE(question_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_questionnaire_test_status__evidence_id ON public.questionnaire_test_status(evidence_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_test_status__last_failure_ticket_id ON public.questionnaire_test_status(last_failure_ticket_id);

-- Foreign key constraints
ALTER TABLE ONLY public.questionnaire_dimensions
    ADD CONSTRAINT questionnaire_dimensions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.questionnaire_templates(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.questionnaire_questions
    ADD CONSTRAINT questionnaire_questions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.questionnaire_templates(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.questionnaire_answer_options
    ADD CONSTRAINT questionnaire_answer_options_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.questionnaire_answer_options
    ADD CONSTRAINT questionnaire_answer_options_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES public.questionnaire_dimensions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.questionnaire_assignments
    ADD CONSTRAINT questionnaire_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.questionnaire_templates(id);
ALTER TABLE ONLY public.questionnaire_assignments
    ADD CONSTRAINT questionnaire_assignments_project_id_fkey FOREIGN KEY (project_id) REFERENCES tickets.tickets(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.questionnaire_answers
    ADD CONSTRAINT questionnaire_answers_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.questionnaire_assignments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.questionnaire_answers
    ADD CONSTRAINT questionnaire_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id);
ALTER TABLE ONLY public.questionnaire_assignment_scores
    ADD CONSTRAINT questionnaire_assignment_scores_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.questionnaire_assignments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.questionnaire_test_evidence
    ADD CONSTRAINT questionnaire_test_evidence_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.questionnaire_assignments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.questionnaire_test_evidence
    ADD CONSTRAINT questionnaire_test_evidence_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id);
ALTER TABLE ONLY public.questionnaire_test_fixtures
    ADD CONSTRAINT questionnaire_test_fixtures_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.questionnaire_assignments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.questionnaire_test_fixtures
    ADD CONSTRAINT questionnaire_test_fixtures_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id);
ALTER TABLE ONLY public.questionnaire_test_seed_registry
    ADD CONSTRAINT questionnaire_test_seed_registry_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.questionnaire_templates(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.questionnaire_test_seed_registry
    ADD CONSTRAINT questionnaire_test_seed_registry_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.questionnaire_test_status
    ADD CONSTRAINT questionnaire_test_status_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.questionnaire_test_status
    ADD CONSTRAINT qts_evidence_id_fk FOREIGN KEY (evidence_id) REFERENCES public.questionnaire_test_evidence(id);
ALTER TABLE ONLY public.questionnaire_test_status
    ADD CONSTRAINT qts_failure_ticket_fk FOREIGN KEY (last_failure_ticket_id) REFERENCES tickets.tickets(id);

-- Grants (website role — full access matching mentolder)
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.questionnaire_templates TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.questionnaire_dimensions TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.questionnaire_questions TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.questionnaire_answer_options TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.questionnaire_assignments TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.questionnaire_answers TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.questionnaire_assignment_scores TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.questionnaire_test_evidence TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.questionnaire_test_fixtures TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.questionnaire_test_seed_registry TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.questionnaire_test_status TO website;

COMMIT;
