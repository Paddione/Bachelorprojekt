-- 0001 — Coaching Studio schema
-- Tables: clients, profiles, sessions, session_levels, standard_levels, standard_profile_fields
-- All in the `studio` schema (shared-db, alongside coaching.* / sessions.* / tickets.*).

CREATE SCHEMA IF NOT EXISTS studio;
SET search_path TO studio, public;

CREATE TABLE IF NOT EXISTS studio.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  initials text NOT NULL,
  since text NOT NULL,
  lang text NOT NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio.profiles (
  client_id uuid PRIMARY KEY REFERENCES studio.clients(id) ON DELETE CASCADE,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES studio.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'aktiv',
  current_level int NOT NULL DEFAULT 0,
  template_of uuid NULL REFERENCES studio.sessions(id),
  lang text NOT NULL DEFAULT 'Deutsch',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  paused_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS studio.session_levels (
  session_id uuid NOT NULL REFERENCES studio.sessions(id) ON DELETE CASCADE,
  level_no int NOT NULL CHECK (level_no BETWEEN 1 AND 10),
  prompt text NOT NULL DEFAULT '',
  prompt_is_default boolean NOT NULL DEFAULT true,
  answer text,
  notes text,
  done boolean NOT NULL DEFAULT false,
  clipboard jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz,
  PRIMARY KEY (session_id, level_no)
);

CREATE TABLE IF NOT EXISTS studio.standard_levels (
  level_no int PRIMARY KEY CHECK (level_no BETWEEN 1 AND 10),
  name text NOT NULL,
  goal text NOT NULL,
  prompt text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio.standard_profile_fields (
  key text PRIMARY KEY,
  label text NOT NULL,
  value text NOT NULL,
  type text NOT NULL DEFAULT 'text',
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the 10 standard coaching levels (idempotent).
INSERT INTO studio.standard_levels (level_no, name, goal, prompt) VALUES
  (1, 'Ankommen & Rahmen', 'Sicheren Raum schaffen, Rollen und Ablauf klären.',
   'Du bist ein ruhiger, systemischer Coaching-Assistent. Begrüße die Person wertschätzend in der Sie-Form, kläre kurz den Rahmen des Gesprächs und lade dazu ein, anzukommen. Stelle höchstens eine offene Frage. Antworte knapp, warm und ohne Ratschläge.'),
  (2, 'Anliegen klären', 'Das eigentliche Thema in eigenen Worten fassen.',
   'Hilf der Person, ihr Anliegen in eigenen Worten zu fassen. Spiegle das Gehörte neutral zurück und frage nach, was davon heute am wichtigsten ist. Keine Bewertung, keine Lösung.'),
  (3, 'Ist-Situation', 'Die aktuelle Lage konkret und ohne Wertung beschreiben.',
   'Lade dazu ein, die gegenwärtige Situation konkret zu beschreiben: Was passiert, seit wann, wer ist beteiligt? Frage nach Beispielen statt nach Verallgemeinerungen. Bleibe beschreibend.'),
  (4, 'Ressourcen & Stärken', 'Vorhandene Kräfte, Erfahrungen und Stützen sichtbar machen.',
   'Richte die Aufmerksamkeit auf vorhandene Ressourcen: Erfahrungen, Fähigkeiten, Unterstützung im Umfeld. Würdige Bisheriges und frage, was in ähnlichen Lagen schon einmal getragen hat.'),
  (5, 'Zielbild', 'Ein erreichbares, positiv formuliertes Ziel entwerfen.',
   'Unterstütze dabei, ein konkretes, positiv formuliertes Zielbild zu entwickeln. Frage: Woran würden Sie merken, dass es besser ist? Halte das Ziel erreichbar und in der eigenen Einflusssphäre.'),
  (6, 'Hindernisse & Muster', 'Wiederkehrende Muster und innere Hürden erkennen.',
   'Erkunde behutsam wiederkehrende Muster und Hindernisse. Frage nach dem, was bisher im Weg stand, ohne Schuld zuzuweisen. Benenne mögliche Wechselwirkungen neutral.'),
  (7, 'Perspektivwechsel', 'Die Lage aus einer anderen Sicht betrachten.',
   'Biete einen Perspektivwechsel an: Wie würde eine wohlwollende Außenstehende die Lage sehen? Was würde in fünf Jahren zählen? Eine Frage genügt; lass Raum zum Nachdenken.'),
  (8, 'Optionen & Wege', 'Mehrere mögliche nächste Schritte sammeln.',
   'Sammle gemeinsam mehrere mögliche Wege, ohne sofort zu bewerten. Frage nach drei Optionen, auch ungewöhnlichen. Erst danach: Welche fühlt sich stimmig an?'),
  (9, 'Vereinbarungen', 'Einen konkreten, überprüfbaren nächsten Schritt festhalten.',
   'Hilf, eine konkrete Vereinbarung zu treffen: ein kleiner, überprüfbarer nächster Schritt bis zum nächsten Termin. Frage nach dem Wann und nach möglichen Stolpersteinen.'),
  (10, 'Abschluss & Transfer', 'Erkenntnisse sichern und den Transfer in den Alltag stützen.',
   'Schließe das Gespräch ruhig ab. Fasse in einem Satz zusammen, was hängen bleibt, und frage, was die Person aus dem Gespräch mitnimmt. Kein neuer Inhalt, nur Sicherung.')
ON CONFLICT (level_no) DO NOTHING;

-- Seed the default profile fields (idempotent).
INSERT INTO studio.standard_profile_fields (key, label, value, type, required, active, sort) VALUES
  ('name',       'Name / Kürzel',          'Platzhalter-Name',                'text',     true,  true,  0),
  ('alter',      'Altersgruppe',           'Platzhalter',                     'text',     false, true,  1),
  ('rolle',      'Rolle / Kontext',        'Platzhalter-Rolle',               'text',     false, true,  2),
  ('sprache',    'Bevorzugte Sprache',     'Deutsch',                         'text',     false, true,  3),
  ('anliegen',   'Anliegen-Kategorie',     'Orientierung (Platzhalter)',      'text',     false, true,  4),
  ('ziel',       'Ziel in eigenen Worten', 'Platzhaltertext für das Ziel.',   'textarea', false, true,  5),
  ('ressourcen', 'Verfügbare Ressourcen',  'Platzhalter: Erfahrung, Umfeld.', 'textarea', false, false, 6),
  ('rahmen',     'Rahmenbedingungen',      'Online · 60 Min · 14-tägig',      'text',     false, false, 7),
  ('sensibel',   'Nicht ansprechen',       'Platzhalter für sensible Themen.', 'textarea', false, false, 8),
  ('stil',       'Kommunikationsstil',     'Ruhig, direkt, auf Augenhöhe.',    'text',     false, true,  9)
ON CONFLICT (key) DO NOTHING;
