-- Migration: applications.jobs — match_score + match_evidence_ids (Phase 2, T900234)
-- Adds deterministic keyword-based match scoring columns.

ALTER TABLE applications.jobs
  ADD COLUMN IF NOT EXISTS match_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS match_evidence_ids TEXT[];
