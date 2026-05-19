ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS ai_question  TEXT,
  ADD COLUMN IF NOT EXISTS human_answer TEXT;
