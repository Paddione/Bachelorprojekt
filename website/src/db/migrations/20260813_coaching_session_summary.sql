-- T002653: LLM-Zusammenfassung einer Coaching-Session.
--
-- Die Zusammenfassung wird aus ai_response + coach_notes aller Schritte
-- generiert und auf der Session gespeichert. llm_summary_at ist das
-- Idempotenz-Signal: ohne force wird eine vorhandene Zusammenfassung nicht
-- neu generiert (siehe lib/coaching-summary.ts).
ALTER TABLE coaching.sessions
  ADD COLUMN IF NOT EXISTS llm_summary TEXT,
  ADD COLUMN IF NOT EXISTS llm_summary_at TIMESTAMPTZ;
