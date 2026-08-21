-- Migration: add missing single-column FK indexes (G-DB01) and brand check constraints (G-DB03) — T013031.
-- Applied automatically by components/website/src/db/migrate.ts.
--
-- Idempotent DO-blocks using to_regclass() and IF NOT EXISTS / exception handling.

DO $$
BEGIN
  -- sessions.templates.created_from_template_id
  IF to_regclass('sessions.templates') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sessions_templates_created_from_template_id
      ON sessions.templates (created_from_template_id);
  END IF;

  -- bachelorprojekt.features (brand, requirement_id)
  IF to_regclass('bachelorprojekt.features') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_features_brand
      ON bachelorprojekt.features (brand);
    CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_features_requirement_id
      ON bachelorprojekt.features (requirement_id);
  END IF;

  -- bachelorprojekt.pipeline.req_id
  IF to_regclass('bachelorprojekt.pipeline') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_pipeline_req_id
      ON bachelorprojekt.pipeline (req_id);
  END IF;

  -- bachelorprojekt.test_results.req_id
  IF to_regclass('bachelorprojekt.test_results') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_test_results_req_id
      ON bachelorprojekt.test_results (req_id);
  END IF;

  -- coaching.drafts.resulting_snippet_id
  IF to_regclass('coaching.drafts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_coaching_drafts_resulting_snippet_id
      ON coaching.drafts (resulting_snippet_id);
  END IF;

  -- coaching.snippet_clusters.parent_id
  IF to_regclass('coaching.snippet_clusters') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_coaching_snippet_clusters_parent_id
      ON coaching.snippet_clusters (parent_id);
  END IF;

  -- knowledge.collections.brand
  IF to_regclass('knowledge.collections') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_knowledge_collections_brand
      ON knowledge.collections (brand);
  END IF;

  -- tickets.tags.brand
  IF to_regclass('tickets.tags') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_tags_brand
      ON tickets.tags (brand);
  END IF;

  -- tickets.ticket_attachments.uploaded_by
  IF to_regclass('tickets.ticket_attachments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_attachments_uploaded_by
      ON tickets.ticket_attachments (uploaded_by);
  END IF;

  -- tickets.ticket_links.created_by
  IF to_regclass('tickets.ticket_links') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_links_created_by
      ON tickets.ticket_links (created_by);
  END IF;

  -- tickets.ticket_tags.tag_id
  IF to_regclass('tickets.ticket_tags') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_tags_tag_id
      ON tickets.ticket_tags (tag_id);
  END IF;

  -- tickets.tickets.source_test_result_id
  IF to_regclass('tickets.tickets') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_tickets_source_test_result_id
      ON tickets.tickets (source_test_result_id);
  END IF;

  -- public.onboarding_state.brand
  IF to_regclass('public.onboarding_state') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_onboarding_state_brand
      ON public.onboarding_state (brand);
  END IF;

  -- studio.sessions (client_id, template_of)
  IF to_regclass('studio.sessions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_studio_sessions_client_id
      ON studio.sessions (client_id);
    CREATE INDEX IF NOT EXISTS idx_studio_sessions_template_of
      ON studio.sessions (template_of);
  END IF;

  -- public.customer_projects.assignee_id
  IF to_regclass('public.customer_projects') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_customer_projects_assignee_id
      ON public.customer_projects (assignee_id);
  END IF;

  -- public.customer_project_attachments.uploaded_by
  IF to_regclass('public.customer_project_attachments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_customer_project_attachments_uploaded_by
      ON public.customer_project_attachments (uploaded_by);
  END IF;

  -- Brand check constraints (G-DB03)
  IF to_regclass('public.customer_projects') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.customer_projects'::regclass
      AND contype = 'c'
      AND conname = 'chk_customer_projects_brand'
    ) THEN
      ALTER TABLE public.customer_projects
        ADD CONSTRAINT chk_customer_projects_brand
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;

  IF to_regclass('tickets.cockpit_audit') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'tickets.cockpit_audit'::regclass
      AND contype = 'c'
      AND conname = 'chk_cockpit_audit_brand'
    ) THEN
      ALTER TABLE tickets.cockpit_audit
        ADD CONSTRAINT chk_cockpit_audit_brand
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;

END $$;
