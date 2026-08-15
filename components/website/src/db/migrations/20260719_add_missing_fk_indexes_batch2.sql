-- Migration: add remaining missing indexes on single-column FK constraints — T001946 (G-DB01).
-- Applied automatically by website/src/db/migrate.ts (task workspace:deploy runs
-- `pnpm --dir website db:migrate` against the target brand's `website` database).
--
-- Identified via the G-DB01 health-goal query (.claude/lib/goals.md#G-DB01), run live
-- against both brand databases (mentolder `workspace`, korczewski `workspace-korczewski`)
-- on 2026-07-19. Live count was 34 (mentolder) / 49 (korczewski) missing FK indexes —
-- far above the '4' baseline recorded when T001905/20260717_add_missing_fk_indexes.sql
-- was written. Investigation found the four original columns
-- (onboarding_state.brand, sessions.templates.created_from_template_id,
-- studio.sessions.client_id/template_of) were STILL unindexed on the mentolder DB
-- despite schema_migrations recording that migration as applied — this migration
-- re-includes them (idempotent CREATE INDEX IF NOT EXISTS, harmless no-op if already
-- present) alongside every column newly added since the 2026-07-17 baseline.
--
-- Guarded with to_regclass() rather than bare CREATE INDEX IF NOT EXISTS: several
-- schemas are brand-specific (`studio.*`/`sessions.*` mentolder-only; `bugs.*`
-- korczewski-only) and this migrations directory is shared by every brand's
-- `db:migrate` run — an unguarded statement against a table that doesn't exist on
-- another brand's database would abort that brand's entire migration run.

DO $$
BEGIN
  IF to_regclass('public.onboarding_state') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_onboarding_state_brand
      ON public.onboarding_state (brand);
  END IF;

  IF to_regclass('sessions.templates') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sessions_templates_created_from_template_id
      ON sessions.templates (created_from_template_id);
  END IF;

  IF to_regclass('studio.sessions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_studio_sessions_client_id
      ON studio.sessions (client_id);
    CREATE INDEX IF NOT EXISTS idx_studio_sessions_template_of
      ON studio.sessions (template_of);
  END IF;

  IF to_regclass('bachelorprojekt.features') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_features_brand
      ON bachelorprojekt.features (brand);
    CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_features_requirement_id
      ON bachelorprojekt.features (requirement_id);
  END IF;

  IF to_regclass('bachelorprojekt.pipeline') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_pipeline_req_id
      ON bachelorprojekt.pipeline (req_id);
  END IF;

  IF to_regclass('bachelorprojekt.test_results') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_test_results_req_id
      ON bachelorprojekt.test_results (req_id);
  END IF;

  IF to_regclass('bugs.bug_tickets') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bugs_bug_tickets_brand
      ON bugs.bug_tickets (brand);
  END IF;

  IF to_regclass('coaching.drafts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_coaching_drafts_resulting_snippet_id
      ON coaching.drafts (resulting_snippet_id);
  END IF;

  IF to_regclass('coaching.sessions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_coaching_sessions_ki_config_id
      ON coaching.sessions (ki_config_id);
  END IF;

  IF to_regclass('coaching.snippet_clusters') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_coaching_snippet_clusters_parent_id
      ON coaching.snippet_clusters (parent_id);
  END IF;

  IF to_regclass('coaching.snippets') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_coaching_snippets_knowledge_chunk_id
      ON coaching.snippets (knowledge_chunk_id);
  END IF;

  IF to_regclass('knowledge.collections') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_knowledge_collections_brand
      ON knowledge.collections (brand);
  END IF;

  IF to_regclass('public.assets') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_assets_brand
      ON public.assets (brand);
  END IF;

  IF to_regclass('public.billing_customers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_billing_customers_customers_id
      ON public.billing_customers (customers_id);
  END IF;

  IF to_regclass('public.billing_invoice_dunnings') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_billing_invoice_dunnings_brand
      ON public.billing_invoice_dunnings (brand);
  END IF;

  IF to_regclass('public.billing_invoice_payments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_billing_invoice_payments_brand
      ON public.billing_invoice_payments (brand);
  END IF;

  IF to_regclass('public.billing_nachweis') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_billing_nachweis_brand
      ON public.billing_nachweis (brand);
  END IF;

  IF to_regclass('public.billing_quotes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_billing_quotes_brand
      ON public.billing_quotes (brand);
  END IF;

  IF to_regclass('public.chat_message_reads') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_message_reads_customer_id
      ON public.chat_message_reads (customer_id);
  END IF;

  IF to_regclass('public.chat_messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_customer_id
      ON public.chat_messages (sender_customer_id);
  END IF;

  IF to_regclass('public.chat_room_members') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_room_members_customer_id
      ON public.chat_room_members (customer_id);
  END IF;

  IF to_regclass('public.chat_rooms') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_rooms_direct_customer_id
      ON public.chat_rooms (direct_customer_id);
  END IF;

  IF to_regclass('public.document_assignments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_document_assignments_template_id
      ON public.document_assignments (template_id);
  END IF;

  IF to_regclass('public.free_time_windows') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_free_time_windows_brand
      ON public.free_time_windows (brand);
  END IF;

  IF to_regclass('public.inbox_items') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_inbox_items_bug_ticket_id
      ON public.inbox_items (bug_ticket_id);
  END IF;

  IF to_regclass('public.message_threads') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_message_threads_customer_id
      ON public.message_threads (customer_id);
  END IF;

  IF to_regclass('public.messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_messages_sender_customer_id
      ON public.messages (sender_customer_id);
  END IF;

  IF to_regclass('public.newsletter_send_log') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_newsletter_send_log_campaign_id
      ON public.newsletter_send_log (campaign_id);
    CREATE INDEX IF NOT EXISTS idx_newsletter_send_log_subscriber_id
      ON public.newsletter_send_log (subscriber_id);
  END IF;

  IF to_regclass('public.questionnaire_answer_options') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_answer_options_dimension_id
      ON public.questionnaire_answer_options (dimension_id);
    CREATE INDEX IF NOT EXISTS idx_questionnaire_answer_options_question_id
      ON public.questionnaire_answer_options (question_id);
  END IF;

  IF to_regclass('public.questionnaire_answers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_answers_question_id
      ON public.questionnaire_answers (question_id);
  END IF;

  IF to_regclass('public.questionnaire_assignments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_assignments_project_id
      ON public.questionnaire_assignments (project_id);
    CREATE INDEX IF NOT EXISTS idx_questionnaire_assignments_template_id
      ON public.questionnaire_assignments (template_id);
  END IF;

  IF to_regclass('public.questionnaire_dimensions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_dimensions_template_id
      ON public.questionnaire_dimensions (template_id);
  END IF;

  IF to_regclass('public.questionnaire_questions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_questions_template_id
      ON public.questionnaire_questions (template_id);
  END IF;

  IF to_regclass('public.questionnaire_test_evidence') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_test_evidence_question_id
      ON public.questionnaire_test_evidence (question_id);
  END IF;

  IF to_regclass('public.questionnaire_test_fixtures') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_test_fixtures_question_id
      ON public.questionnaire_test_fixtures (question_id);
  END IF;

  IF to_regclass('public.questionnaire_test_seed_registry') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_test_seed_registry_question_id
      ON public.questionnaire_test_seed_registry (question_id);
  END IF;

  IF to_regclass('public.questionnaire_test_status') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_test_status_evidence_id
      ON public.questionnaire_test_status (evidence_id);
    CREATE INDEX IF NOT EXISTS idx_questionnaire_test_status_last_failure_ticket_id
      ON public.questionnaire_test_status (last_failure_ticket_id);
  END IF;

  IF to_regclass('public.supplier_invoices') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_supplier_invoices_brand
      ON public.supplier_invoices (brand);
    CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier_id
      ON public.supplier_invoices (supplier_id);
  END IF;

  IF to_regclass('public.tax_mode_changes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tax_mode_changes_brand
      ON public.tax_mode_changes (brand);
  END IF;

  IF to_regclass('public.time_entries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_time_entries_task_id
      ON public.time_entries (task_id);
  END IF;

  IF to_regclass('tickets.tags') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_tags_brand
      ON tickets.tags (brand);
  END IF;

  IF to_regclass('tickets.ticket_activity') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_activity_actor_id
      ON tickets.ticket_activity (actor_id);
  END IF;

  IF to_regclass('tickets.ticket_attachments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_attachments_uploaded_by
      ON tickets.ticket_attachments (uploaded_by);
  END IF;

  IF to_regclass('tickets.ticket_comments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_comments_author_id
      ON tickets.ticket_comments (author_id);
  END IF;

  IF to_regclass('tickets.ticket_links') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_links_created_by
      ON tickets.ticket_links (created_by);
  END IF;

  IF to_regclass('tickets.ticket_tags') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_tags_tag_id
      ON tickets.ticket_tags (tag_id);
  END IF;

  IF to_regclass('tickets.ticket_watchers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_watchers_user_id
      ON tickets.ticket_watchers (user_id);
  END IF;

  IF to_regclass('tickets.tickets') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_tickets_brand
      ON tickets.tickets (brand);
    CREATE INDEX IF NOT EXISTS idx_tickets_tickets_reporter_id
      ON tickets.tickets (reporter_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_tickets_source_test_assignment_id
      ON tickets.tickets (source_test_assignment_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_tickets_source_test_result_id
      ON tickets.tickets (source_test_result_id);
  END IF;

END
$$;
