-- Migration: G-DB10 — Drop 70 unused non-constraint indexes on NON-empty tables.
-- Scope: ONLY plain indexes (NOT indisunique, NOT indisprimary) with idx_scan=0
-- on live devmesh workspace/shared-db (verified 2026-11-07). 103 unique/primary-
-- backed indexes (pkey/unique constraints) deliberately KEPT: dropping them would
-- remove integrity guarantees — different risk class, not covered by T001948 scope.
-- DROP INDEX never touches table data; every drop is re-creatable via the
-- companion rollback file. CONCURRENTLY avoids write locks on non-empty tables.
-- Backup: CronJob shared-db-backup nightly 03:30, latest dump 2026-11-06 (retained 5).
-- Stats window note: pod restarted ~8h before generation; idx_scan=0 partly
-- short-window. Largest wins: 77MB+75MB HNSW on cold vector path (no pgvector
-- calls in repo outside migrations). Idempotent: IF EXISTS CONCURRENTLY.

DROP INDEX CONCURRENTLY IF EXISTS applications.idx_applications_dossiers_job_id;
DROP INDEX CONCURRENTLY IF EXISTS applications.idx_applications_timeline_job_id;
DROP INDEX CONCURRENTLY IF EXISTS audit.audit_log_action_idx;
DROP INDEX CONCURRENTLY IF EXISTS audit.audit_log_actor_idx;
DROP INDEX CONCURRENTLY IF EXISTS audit.audit_log_ts_idx;
DROP INDEX CONCURRENTLY IF EXISTS bachelorprojekt.idx_bachelorprojekt_features_brand;
DROP INDEX CONCURRENTLY IF EXISTS bachelorprojekt.idx_bachelorprojekt_features_requirement_id;
DROP INDEX CONCURRENTLY IF EXISTS bachelorprojekt.idx_bachelorprojekt_pipeline_req_id;
DROP INDEX CONCURRENTLY IF EXISTS bachelorprojekt.idx_bachelorprojekt_test_results_req_id;
DROP INDEX CONCURRENTLY IF EXISTS bachelorprojekt.idx_software_events_kind;
DROP INDEX CONCURRENTLY IF EXISTS bachelorprojekt.idx_software_events_pr;
DROP INDEX CONCURRENTLY IF EXISTS bachelorprojekt.idx_software_events_service;
DROP INDEX CONCURRENTLY IF EXISTS bugs.idx_bug_tickets_fixed_in_pr;
DROP INDEX CONCURRENTLY IF EXISTS bugs.idx_bug_tickets_status;
DROP INDEX CONCURRENTLY IF EXISTS bugs.idx_bugs_bug_tickets_brand;
DROP INDEX CONCURRENTLY IF EXISTS coaching.idx_assignments_client_id;
DROP INDEX CONCURRENTLY IF EXISTS coaching.idx_assignments_template_id;
DROP INDEX CONCURRENTLY IF EXISTS coaching.idx_audit_session;
DROP INDEX CONCURRENTLY IF EXISTS coaching.idx_coaching_drafts_resulting_snippet_id;
DROP INDEX CONCURRENTLY IF EXISTS coaching.idx_coaching_sessions_ki_config_id;
DROP INDEX CONCURRENTLY IF EXISTS coaching.idx_drafts_book_status;
DROP INDEX CONCURRENTLY IF EXISTS coaching.idx_drafts_kind_status;
DROP INDEX CONCURRENTLY IF EXISTS coaching.idx_sessions_brand;
DROP INDEX CONCURRENTLY IF EXISTS coaching.idx_sessions_client;
DROP INDEX CONCURRENTLY IF EXISTS coaching.idx_templates_snippet_id;
DROP INDEX CONCURRENTLY IF EXISTS coaching.idx_templates_surface_ref;
DROP INDEX CONCURRENTLY IF EXISTS coaching.idx_templates_surface_status;
DROP INDEX CONCURRENTLY IF EXISTS knowledge.chunks_collection;
DROP INDEX CONCURRENTLY IF EXISTS public.admin_actions_actor_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.admin_actions_concurrent_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.admin_actions_created_at_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.ai_call_log_ts;
DROP INDEX CONCURRENTLY IF EXISTS public.ai_call_log_workflow;
DROP INDEX CONCURRENTLY IF EXISTS public.business_memberships_brand_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.business_memberships_user_key_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.code_embeddings_embedding_hnsw;
DROP INDEX CONCURRENTLY IF EXISTS public.error_log_ts_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_brett_snapshots_customer;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_brett_snapshots_room;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_brett_snapshots_template;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_chat_message_reads_customer_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_chat_messages_room;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_chat_messages_sender_customer_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_chat_room_members_customer_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_chat_rooms_direct_customer_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_customers_email;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_doc_assignments_customer;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_doc_assignments_status;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_document_assignments_template_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_inbox_items_bug_ticket_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_inbox_items_is_test_data;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_inbox_items_status;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_learning_progress_admin_agg;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_learning_progress_updated;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_meetings_customer;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_meetings_status;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_message_threads_customer_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_messages_sender_customer_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_messages_thread;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_onboarding_state_brand;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_poll_answers_poll;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_prompt_library_brand_active;
DROP INDEX CONCURRENTLY IF EXISTS public.inbox_items_brand_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.massage_invoices_brand_status_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.massage_invoices_brand_year_number_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.massage_invoices_cancels_invoice_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.public_code_embeddings_gemma_k6gemma768_hnsw;
DROP INDEX CONCURRENTLY IF EXISTS public.test_results_run_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.test_results_test_id_created_idx;
DROP INDEX CONCURRENTLY IF EXISTS sessions.idx_sessions_templates_created_from_template_id;
