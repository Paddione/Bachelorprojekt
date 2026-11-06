-- Migration: G-DB10 — Drop unused indexes on verified-empty tables.
-- Scope: ONLY indexes on tables with 0 rows (verified 2026-11-06 on live devmesh
-- shared-db/website via count(*)). DROP INDEX never touches data; all drops are
-- re-creatable. Indexes with idx_scan=0 on NON-empty tables are deliberately
-- kept: 4h stats window after DB restart cannot prove non-use (monthly billing,
-- RAG/vector search, audit queries). See G-DB10 follow-up for re-measurement
-- after a longer stats window.
-- Verified empty 2026-11-06: knowledge.chunks, coaching.snippets,
-- knowledge.collections, coaching.snippet_clusters, public.transcript_segments,
-- public.transcripts, public.meeting_artifacts, public.meeting_insights.
-- Idempotent: IF EXISTS.

DROP INDEX IF EXISTS coaching.idx_coaching_snippet_clusters_parent_id;
DROP INDEX IF EXISTS coaching.idx_coaching_snippets_knowledge_chunk_id;
DROP INDEX IF EXISTS coaching.idx_snippets_book_id;
DROP INDEX IF EXISTS coaching.idx_snippets_cluster_id;
DROP INDEX IF EXISTS coaching.idx_snippets_tags;
DROP INDEX IF EXISTS knowledge.idx_knowledge_collections_brand;
DROP INDEX IF EXISTS knowledge.knowledge_chunks_gemma_k6gemma768_col_idx;
DROP INDEX IF EXISTS knowledge.knowledge_chunks_gemma_k6gemma768_doc_idx;
DROP INDEX IF EXISTS knowledge.knowledge_chunks_gemma_k6gemma768_hnsw;
DROP INDEX IF EXISTS public.idx_artifacts_meeting;
DROP INDEX IF EXISTS public.idx_insights_meeting;
DROP INDEX IF EXISTS public.idx_segments_transcript;
DROP INDEX IF EXISTS public.idx_transcripts_meeting;
