CREATE SCHEMA IF NOT EXISTS brett;

CREATE TABLE IF NOT EXISTS brett.board_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           TEXT NOT NULL,
  name            TEXT NOT NULL CHECK (char_length(name) <= 100),
  description     TEXT CHECK (char_length(description) <= 500),
  category        TEXT CHECK (char_length(category) <= 50),
  state           JSONB NOT NULL,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  created_by_user TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_templates_brand_system_created
  ON brett.board_templates (brand, is_system, created_at DESC);

INSERT INTO brett.board_templates (brand, name, description, category, state, is_system)
VALUES
  ('mentolder', 'Familiensystem 4 Personen', 'Vier Figuren im Quadrat — klassische Familienaufstellung.', 'Familie',
   '{"figures":[{"id":"f1","label":"Vater","x":-1,"z":-1,"facingY":0.79},{"id":"f2","label":"Mutter","x":1,"z":-1,"facingY":2.36},{"id":"f3","label":"Kind","x":1,"z":1,"facingY":3.93},{"id":"f4","label":"Geschwister","x":-1,"z":1,"facingY":5.5}]}',
   true),
  ('mentolder', 'Team-Konflikt', 'Zwei Gruppen à 3 Figuren mit Lücke in der Mitte.', 'Team',
   '{"figures":[{"id":"f1","label":"A1","x":-2,"z":-1,"facingY":0},{"id":"f2","label":"A2","x":-2,"z":0,"facingY":0},{"id":"f3","label":"A3","x":-2,"z":1,"facingY":0},{"id":"f4","label":"B1","x":2,"z":-1,"facingY":3.14},{"id":"f5","label":"B2","x":2,"z":0,"facingY":3.14},{"id":"f6","label":"B3","x":2,"z":1,"facingY":3.14}]}',
   true),
  ('mentolder', 'Innere Anteile', 'Fünf Figuren: Zentrum + vier Himmelsrichtungen.', 'Coaching',
   '{"figures":[{"id":"f1","label":"Ich","x":0,"z":0,"facingY":0},{"id":"f2","label":"Anteil Nord","x":0,"z":2,"facingY":3.14},{"id":"f3","label":"Anteil Ost","x":2,"z":0,"facingY":1.57},{"id":"f4","label":"Anteil Süd","x":0,"z":-2,"facingY":0},{"id":"f5","label":"Anteil West","x":-2,"z":0,"facingY":4.71}]}',
   true)
ON CONFLICT DO NOTHING;
