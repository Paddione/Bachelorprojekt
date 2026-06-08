-- 002_coaching_templates.sql
-- Coaching-step templates surfaced in the Brett lobby. Idempotent: safe to
-- re-run on every server startup (runMigrations in db.ts applies all *.sql).

CREATE SCHEMA IF NOT EXISTS brett;

CREATE TABLE IF NOT EXISTS brett.coaching_templates (
  id          TEXT PRIMARY KEY,
  brand       TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  steps       JSONB NOT NULL,           -- string[]
  is_system   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coaching_templates_brand_active_idx
  ON brett.coaching_templates (brand, is_active);

INSERT INTO brett.coaching_templates (id, brand, name, description, steps, is_system)
VALUES (
  'sys-beziehungsdynamik-familiensystem',
  'mentolder',
  'Beziehungsdynamik — Familiensystem',
  'Geführte Erst-Sitzung: Familiensystem aufstellen und reflektieren.',
  '[
    "Welche Personen gehören zu deinem System? Benenne jede Figur.",
    "Platziere dich selbst. Wo stehst du in diesem System?",
    "Platziere die anderen Personen. Wie nah oder weit sind sie zu dir?",
    "Welche Verbindungen bestehen? Ziehe Linien zwischen den Figuren.",
    "Welche Figur zieht deine Aufmerksamkeit am stärksten an?",
    "Was würde sich verschieben, wenn du eine Position veränderst?",
    "Was nimmst du aus dieser Konstellation mit?"
  ]'::jsonb,
  true
)
ON CONFLICT (id) DO NOTHING;
