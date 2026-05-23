-- Schema drift fix: questionnaire_test_* tables missing on korczewski
-- All 4 tables exist on mentolder but were never created on korczewski.
-- Root cause: the Playwright/systemtest feature only landed in DB migrations
-- on mentolder. This caused all systemtest CronJobs on korczewski to return
-- 500/exit-22: drain-outbox, cleanup-fixtures, purge-all-test-data.
--
-- Creation order is dependency-driven:
--   1. questionnaire_test_evidence (referenced by questionnaire_test_status)
--   2. questionnaire_test_fixtures (no inter-table deps)
--   3. questionnaire_test_seed_registry (no inter-table deps)
--   4. questionnaire_test_status (refs evidence + tickets.tickets)
--
-- Idempotent (CREATE TABLE IF NOT EXISTS). Safe on populated DB.
-- Apply with: kubectl exec ... psql -U postgres -d website < <this-file>

BEGIN;

-- 1. questionnaire_test_evidence
CREATE TABLE IF NOT EXISTS public.questionnaire_test_evidence (
    id            uuid        NOT NULL DEFAULT gen_random_uuid(),
    assignment_id uuid        NOT NULL,
    question_id   uuid        NOT NULL,
    attempt       integer     NOT NULL DEFAULT 0,
    replay_path   text,
    partial       boolean     NOT NULL DEFAULT false,
    console_log   jsonb,
    network_log   jsonb,
    recorded_from timestamptz,
    recorded_to   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT questionnaire_test_evidence_pkey PRIMARY KEY (id),
    CONSTRAINT questionnaire_test_evidence_assignment_id_fkey
        FOREIGN KEY (assignment_id) REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
    CONSTRAINT questionnaire_test_evidence_question_id_fkey
        FOREIGN KEY (question_id) REFERENCES questionnaire_questions(id)
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_test_evidence__question_id
    ON public.questionnaire_test_evidence(question_id);
CREATE INDEX IF NOT EXISTS ix_evidence_assignment_question
    ON public.questionnaire_test_evidence(assignment_id, question_id, attempt);

-- 2. questionnaire_test_fixtures
CREATE TABLE IF NOT EXISTS public.questionnaire_test_fixtures (
    id            uuid        NOT NULL DEFAULT gen_random_uuid(),
    assignment_id uuid        NOT NULL,
    question_id   uuid        NOT NULL,
    attempt       integer     NOT NULL,
    table_name    text        NOT NULL,
    row_id        uuid        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    purged_at     timestamptz,
    purge_error   text,
    CONSTRAINT questionnaire_test_fixtures_pkey PRIMARY KEY (id),
    CONSTRAINT questionnaire_test_fixtures_assignment_id_fkey
        FOREIGN KEY (assignment_id) REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
    CONSTRAINT questionnaire_test_fixtures_question_id_fkey
        FOREIGN KEY (question_id) REFERENCES questionnaire_questions(id)
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_test_fixtures__question_id
    ON public.questionnaire_test_fixtures(question_id);
CREATE INDEX IF NOT EXISTS ix_fixtures_unpurged
    ON public.questionnaire_test_fixtures(assignment_id) WHERE purged_at IS NULL;

-- 3. questionnaire_test_seed_registry
CREATE TABLE IF NOT EXISTS public.questionnaire_test_seed_registry (
    id          uuid NOT NULL DEFAULT gen_random_uuid(),
    template_id uuid NOT NULL,
    question_id uuid,
    seed_module text NOT NULL,
    CONSTRAINT questionnaire_test_seed_registry_pkey PRIMARY KEY (id),
    CONSTRAINT uq_seed_registry_scope
        UNIQUE (template_id, COALESCE(question_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    CONSTRAINT questionnaire_test_seed_registry_question_id_fkey
        FOREIGN KEY (question_id) REFERENCES questionnaire_questions(id) ON DELETE CASCADE,
    CONSTRAINT questionnaire_test_seed_registry_template_id_fkey
        FOREIGN KEY (template_id) REFERENCES questionnaire_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_test_seed_registry__question_id
    ON public.questionnaire_test_seed_registry(question_id);

-- 4. questionnaire_test_status
CREATE TABLE IF NOT EXISTS public.questionnaire_test_status (
    question_id            uuid    NOT NULL,
    last_result            text    NOT NULL,
    last_result_at         timestamptz NOT NULL,
    last_success_at        timestamptz,
    last_assignment_id     uuid,
    evidence_id            uuid,
    last_failure_ticket_id uuid,
    retest_pending_at      timestamptz,
    retest_attempt         integer NOT NULL DEFAULT 0,
    CONSTRAINT questionnaire_test_status_pkey PRIMARY KEY (question_id),
    CONSTRAINT questionnaire_test_status_last_result_check
        CHECK (last_result = ANY (ARRAY['erfüllt'::text, 'teilweise'::text, 'nicht_erfüllt'::text])),
    CONSTRAINT qts_evidence_id_fk
        FOREIGN KEY (evidence_id) REFERENCES questionnaire_test_evidence(id),
    CONSTRAINT qts_failure_ticket_fk
        FOREIGN KEY (last_failure_ticket_id) REFERENCES tickets.tickets(id),
    CONSTRAINT questionnaire_test_status_question_id_fkey
        FOREIGN KEY (question_id) REFERENCES questionnaire_questions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_test_status__evidence_id
    ON public.questionnaire_test_status(evidence_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_test_status__last_failure_ticket_id
    ON public.questionnaire_test_status(last_failure_ticket_id);

-- Grants: website role needs full access (matches mentolder grants)
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.questionnaire_test_evidence TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.questionnaire_test_fixtures TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.questionnaire_test_seed_registry TO website;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.questionnaire_test_status TO website;

COMMIT;
