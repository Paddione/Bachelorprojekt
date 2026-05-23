-- DB Audit Phase 5 — Add missing FK indexes (korczewski)
-- Generated 2026-05-23 from evidence/missing-fk-indexes.korczewski.csv
-- Idempotent (CREATE INDEX IF NOT EXISTS) and reversible (DROP INDEX IF EXISTS)

BEGIN;

CREATE INDEX IF NOT EXISTS idx_arena_match_players_brand ON arena.match_players(brand);
CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_features_requirement_id ON bachelorprojekt.features(requirement_id);
CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_features_brand ON bachelorprojekt.features(brand);
CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_pipeline_req_id ON bachelorprojekt.pipeline(req_id);
CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_test_results_req_id ON bachelorprojekt.test_results(req_id);
CREATE INDEX IF NOT EXISTS idx_bugs_bug_tickets_brand ON bugs.bug_tickets(brand);
CREATE INDEX IF NOT EXISTS idx_coaching_drafts_resulting_snippet_id ON coaching.drafts(resulting_snippet_id);
CREATE INDEX IF NOT EXISTS idx_coaching_projects_client_id ON coaching.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_project_id ON coaching.sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_ki_config_id ON coaching.sessions(ki_config_id);
CREATE INDEX IF NOT EXISTS idx_coaching_snippet_clusters_parent_id ON coaching.snippet_clusters(parent_id);
CREATE INDEX IF NOT EXISTS idx_coaching_snippets_knowledge_chunk_id ON coaching.snippets(knowledge_chunk_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_collections_brand ON knowledge.collections(brand);
CREATE INDEX IF NOT EXISTS idx_chat_message_reads__customer_id ON chat_message_reads(customer_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages__sender_customer_id ON chat_messages(sender_customer_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_members__customer_id ON chat_room_members(customer_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms__direct_customer_id ON chat_rooms(direct_customer_id);
CREATE INDEX IF NOT EXISTS idx_document_assignments__template_id ON document_assignments(template_id);
CREATE INDEX IF NOT EXISTS idx_free_time_windows__brand ON free_time_windows(brand);
CREATE INDEX IF NOT EXISTS idx_inbox_items__bug_ticket_id ON inbox_items(bug_ticket_id);
CREATE INDEX IF NOT EXISTS idx_messages__sender_customer_id ON messages(sender_customer_id);
CREATE INDEX IF NOT EXISTS idx_message_threads__customer_id ON message_threads(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tags_brand ON tickets.tags(brand);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_activity_actor_id ON tickets.ticket_activity(actor_id);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_attachments_uploaded_by ON tickets.ticket_attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_comments_author_id ON tickets.ticket_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_links_created_by ON tickets.ticket_links(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_tickets_source_test_result_id ON tickets.tickets(source_test_result_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tickets_reporter_id ON tickets.tickets(reporter_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tickets_brand ON tickets.tickets(brand);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_tags_tag_id ON tickets.ticket_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_watchers_user_id ON tickets.ticket_watchers(user_id);

COMMIT;
