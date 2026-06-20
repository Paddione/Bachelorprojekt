-- Migration: create sessions.templates (brainstorm session templates with 5 defaults).
-- Apply manually (no auto-runner) per brand on BOTH namespaces:
--   kubectl exec -n workspace deploy/shared-db -- \
--     psql -U website -d website -f - < website/src/db/migrations/20260620_create_sessions_templates.sql
--   kubectl exec -n workspace-korczewski deploy/shared-db -- \
--     psql -U website -d website -f - < website/src/db/migrations/20260620_create_sessions_templates.sql

CREATE SCHEMA IF NOT EXISTS sessions;

CREATE TABLE IF NOT EXISTS sessions.templates (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     TEXT NOT NULL,
  title                    TEXT NOT NULL,
  body_markdown            TEXT NOT NULL DEFAULT '',
  is_default               BOOLEAN NOT NULL DEFAULT false,
  owner_id                 TEXT,
  created_from_template_id UUID REFERENCES sessions.templates(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

-- Default templates are unique by slug globally (owner_id IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_templates_default_slug
  ON sessions.templates (slug) WHERE is_default;

-- Custom templates are unique per (owner_id, slug).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_templates_owner_slug
  ON sessions.templates (owner_id, slug) WHERE NOT is_default;

GRANT USAGE ON SCHEMA sessions TO website;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA sessions TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA sessions GRANT ALL ON TABLES TO website;

-- Idempotent seed: 5 default templates.
DO $$
BEGIN
  INSERT INTO sessions.templates (slug, title, body_markdown, is_default, owner_id)
  VALUES
    ('feature-intake',
     'Feature-Intake',
     '# Feature-Intake

## Kernproblem
Welches Problem löst dieses Feature?

## Zielgruppe
Für wen ist es relevant?

## Mehrwert
Welchen Nutzen bringt es?

## Aufwand
Klein / Mittel / Gross?',
     true, NULL),
    ('retro',
     'Retro',
     '# Retrospektive

## Was lief gut?
Welche Dinge funktionierten in der letzten Phase?

## Was lief schlecht?
Welche Hürden gab es?

## Was ändern?
Welche konkreten Anpassungen leiten wir ab?

## Aktionspunkte
Wer macht was bis wann?',
     true, NULL),
    ('grilling',
     'Grilling',
     '# Grilling-Session

## Anforderungsklärung
Was ist das Kernproblem? Welche Acceptance Criteria müssen erfüllt sein?

## Architektur & Design
Welche Komponenten sind betroffen? Gibt es ein Architektur-Diagramm?

## Risiken & Edge Cases
Was sind die kritischsten Edge Cases? Welche Fehlerzustände müssen behandelt werden?

## Umsetzung
Welche Dateien werden geändert? Sind Breaking Changes zu erwarten?',
     true, NULL),
    ('workshop',
     'Workshop',
     '# Workshop-Planung

## Ziel
Was soll am Ende des Workshops stehen?

## Teilnehmer
Wer ist anwesend? Welche Rollen?

## Agenda
Welche Blöcke in welcher Reihenfolge?

## Material
Was wird benötigt (Slides, Tools, Handouts)?

## Nachbereitung
Welche Follow-ups ergeben sich?',
     true, NULL),
    ('spezifikation',
     'Spezifikation',
     '# Spezifikation

## Kontext
Welcher Systemteil wird spezifiziert?

## Anforderungen
Welche funktionalen Anforderungen müssen erfüllt sein?

## Schnittstellen
Welche APIs / Datenflüsse sind beteiligt?

## Constraints
Welche technischen oder organisatorischen Einschränkungen gelten?

## Abnahmekriterien
Wann gilt die Spezifikation als umgesetzt?',
     true, NULL)
  ON CONFLICT DO NOTHING;
END
$$;
