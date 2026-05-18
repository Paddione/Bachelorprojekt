-- scripts/one-shot/20260517-coaching-projects.sql

-- 1) Projekttabelle
CREATE TABLE IF NOT EXISTS coaching.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           TEXT NOT NULL,
  client_id       UUID REFERENCES customers(id),
  customer_number TEXT NOT NULL,
  display_alias   TEXT,
  ki_context      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now() -- kein Trigger; wird manuell via SET updated_at = now() in UPDATE-Queries gesetzt
);

CREATE UNIQUE INDEX IF NOT EXISTS coaching_projects_brand_client_idx
  ON coaching.projects (brand, client_id);

-- 2) Neue Spalte in sessions
ALTER TABLE coaching.sessions
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES coaching.projects(id);

-- 3) Backfill: Projekte für bestehende Sessions mit client_id anlegen
INSERT INTO coaching.projects (brand, client_id, customer_number)
SELECT DISTINCT s.brand, s.client_id,
  COALESCE(c.customer_number, s.client_id::text)
FROM coaching.sessions s
JOIN customers c ON c.id = s.client_id
WHERE s.client_id IS NOT NULL
ON CONFLICT (brand, client_id) DO NOTHING;

-- 4) Bestehende Sessions mit project_id verknüpfen
UPDATE coaching.sessions s
SET project_id = p.id
FROM coaching.projects p
WHERE s.client_id = p.client_id
  AND s.brand = p.brand
  AND s.project_id IS NULL;
