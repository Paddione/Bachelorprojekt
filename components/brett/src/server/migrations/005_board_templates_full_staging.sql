-- 005_board_templates_full_staging.sql
-- T900360 / openspec: systembrett-presets — Partial P1.
--
-- Repairs and upgrades the three system board templates (brand 'mentolder')
-- without touching 004_board_templates.sql (already applied in prod — editing
-- it would neither repair existing duplicates nor re-run it).
--
-- Safe under runMigrations() (db.ts), which re-executes every *.sql file on
-- each boot: every statement here is idempotent, and re-running the file
-- changes nothing (verified: applied twice, system-row count stays 3, no
-- duplicates, exactly one is_default per brand).
--
-- Why duplicates existed: 004 inserted the system rows with
-- `ON CONFLICT DO NOTHING` WITHOUT a conflict target, while generating a fresh
-- random UUID per boot — so every boot added three more rows per (brand, name).
--
-- Statement order is load-bearing:
--   Task 1  dedupe system rows, keep oldest per (brand, name)
--   Task 2  partial unique index (brand, name) WHERE is_system IS TRUE
--           (MUST follow Task 1 — a unique index over duplicated rows fails)
--   Task 2b is_default column + partial unique index (brand) WHERE is_default
--   Task 3  upsert of the 3 system rows with pinned uuid5 ids
--   Task 2b is_default pin UPDATEs (MUST follow Task 3)

-- ────────────────────────────────────────────────────────────────────────────
-- Task 1 — Dedupe existing system rows: keep exactly one is_system row per
-- (brand, name) — the oldest by created_at, tie-broken by smallest id.
-- Restricted to system rows: user-created templates are never touched.
-- ────────────────────────────────────────────────────────────────────────────
DELETE FROM brett.board_templates a
USING brett.board_templates b
WHERE a.is_system IS TRUE
  AND b.is_system IS TRUE
  AND a.brand = b.brand
  AND a.name = b.name
  AND (b.created_at, b.id) < (a.created_at, a.id);

-- ────────────────────────────────────────────────────────────────────────────
-- Task 2 — Real uniqueness guard for system rows. Partial: user templates
-- sharing a (brand, name) stay allowed; system rows gain a genuine conflict
-- target for Task 3. IF NOT EXISTS keeps boot-time re-runs quiet.
-- ────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_board_templates_brand_name_system
  ON brett.board_templates (brand, name)
  WHERE is_system IS TRUE;

-- ────────────────────────────────────────────────────────────────────────────
-- Task 2b — Default marker column + at-most-one-default-per-brand guard.
-- Downstream partials (getBrandDefaultTemplate, reset-to-default) resolve the
-- brand default exclusively via this marker — no name literals (design D2).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE brett.board_templates
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_board_templates_brand_default
  ON brett.board_templates (brand)
  WHERE is_default IS TRUE;

-- ────────────────────────────────────────────────────────────────────────────
-- Task 3 — Upsert the 3 system templates with pinned, reproducible uuid5 ids:
--   uuid5(NAMESPACE_DNS, 'board-template.mentolder.<slug>'):
--     'board-template.mentolder.familiensystem-4-personen' -> d0fbb4c0-49cc-5fac-9ee5-7d011c80b285
--     'board-template.mentolder.team-konflikt'             -> 2d329117-d98e-5dd0-b89a-4a18ccfa240e
--     'board-template.mentolder.innere-anteile'            -> 2b5e2498-c36a-56c0-939c-4a87cea4ebe6
-- (slug = lower-cased, hyphen-joined template name; see Task 3 of the
-- partial plan — the pinned ids above are the ones used by the Task 2b pin.)
--
-- The ON CONFLICT target carries the SAME `WHERE is_system IS TRUE` predicate
-- as the Task 2 partial index — without it Postgres cannot match the arbiter
-- index and the statement fails. `DO UPDATE` re-keys `id` to EXCLUDED.id as
-- well: rows that survived the 004-era duplicates (random ids) must end up
-- carrying the stable Task 3 UUIDs — the Task 2b pin keys on exactly those
-- ids, and every boot re-converges to the same id.
--
-- State payloads: full client-honored Figure vocabulary from
-- src/types/state.ts — color, preset, appearance{color,face,body,accessories},
-- figureType, scale, facingY, plus note where a figure carries a statement —
-- and per template: zones, anchors, optik{floor,sky,lightMood}, lines where a
-- relationship/tension line earns its place.
--
-- Familiensystem: 4 figures, warm palette, close circle facing inward.
-- Team-Konflikt: 6 figures in two opposed color groups with a clear gap,
--                facing across it.
-- Innere Anteile: 5 figures in a semicircle, muted tones, oriented toward a
--                 shared focal point.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO brett.board_templates
  (id, brand, name, description, category, state, is_system)
VALUES
  ('d0fbb4c0-49cc-5fac-9ee5-7d011c80b285', 'mentolder', 'Familiensystem 4 Personen',
   'Vier Figuren im warmen Kreis: Vater, Mutter, Kind und Geschwister — enger Kreis, alle nach innen gewandt.',
   'Familie',
   '{"figures":[{"id":"f1","label":"Vater","x":-1.2,"z":0,"facingY":1.5708,"color":"#b05a3c","scale":1.0,"preset":"stand","figureType":"team_active","appearance":{"color":"#b05a3c","face":"present","body":"adult-tall","accessories":{"head":"cap","upper":"coat","feet":"boots-work"}}},{"id":"f2","label":"Mutter","x":1.2,"z":0,"facingY":-1.5708,"color":"#c8843a","scale":1.0,"preset":"stand","figureType":"team_active","appearance":{"color":"#c8843a","face":"protective","body":"adult-average","accessories":{"head":"hair-bun","upper":"tunic","feet":"shoes-dress"}}},{"id":"f3","label":"Kind","x":0,"z":1.2,"facingY":0,"color":"#d9a24a","scale":0.75,"preset":"stand","figureType":"coachee","appearance":{"color":"#d9a24a","face":"curious","body":"child","accessories":{"head":"hair-curls","upper":"vest","feet":"sandals"}},"note":"Ich bin hier, aber oft unsichtbar."},{"id":"f4","label":"Geschwister","x":0,"z":-1.2,"facingY":3.1416,"color":"#a86042","scale":0.9,"preset":"stand","figureType":"team_passive","appearance":{"color":"#a86042","face":"withdrawn","body":"adolescent","accessories":{"head":"hair-long","upper":"vest","feet":"boots-work"}},"note":"Ich stehe zwischen beiden Lagern."}],"zones":[{"id":"zone-family","x":0,"z":0,"shape":"circle","radius":1.7,"label":"Familienkreis","color":"#c8703e","opacity":0.18}],"anchors":[{"id":"anchor-center","x":0,"z":0,"label":"Mittelpunkt","color":"#c8a96e"}],"lines":[{"id":"l1","fromId":"f1","toId":"f2","lineType":"relationship"},{"id":"l2","fromId":"f2","toId":"f3","lineType":"relationship"}],"optik":{"floor":"wood-dark","sky":"dusk","lightMood":"warm"}}',
   true),
  ('2d329117-d98e-5dd0-b89a-4a18ccfa240e', 'mentolder', 'Team-Konflikt',
   'Sechs Figuren in zwei gegenüberliegenden Gruppen mit Lücke in der Mitte — Spannungsachse über die Spalte.',
   'Team',
   '{"figures":[{"id":"f1","label":"A1","x":-2.5,"z":-1,"facingY":1.5708,"color":"#3b6ea5","scale":1.0,"preset":"stand","figureType":"team_active","appearance":{"color":"#3b6ea5","face":"defiant","body":"adult-average","accessories":{"head":"hair-short","upper":"vest","feet":"boots-work"}},"note":"Wir tragen die Entscheidung."},{"id":"f2","label":"A2","x":-2.5,"z":0,"facingY":1.5708,"color":"#4a7ab5","scale":1.0,"preset":"stand","figureType":"team_active","appearance":{"color":"#4a7ab5","face":"defiant","body":"adult-average","accessories":{"head":"hair-short","upper":"vest","feet":"boots-work"}}},{"id":"f3","label":"A3","x":-2.5,"z":1,"facingY":1.5708,"color":"#5d8ac5","scale":1.0,"preset":"slump","figureType":"team_passive","appearance":{"color":"#5d8ac5","face":"distant","body":"adult-average","accessories":{"head":"hair-bun","upper":"coat","feet":"sandals"}}},{"id":"f4","label":"B1","x":2.5,"z":-1,"facingY":-1.5708,"color":"#b04a3a","scale":1.0,"preset":"stand","figureType":"team_active","appearance":{"color":"#b04a3a","face":"defiant","body":"adult-average","accessories":{"head":"cap","upper":"coat","feet":"boots-work"}}},{"id":"f5","label":"B2","x":2.5,"z":0,"facingY":-1.5708,"color":"#c05a45","scale":1.0,"preset":"stand","figureType":"team_active","appearance":{"color":"#c05a45","face":"overwhelmed","body":"adult-average","accessories":{"head":"hair-bun","upper":"tunic","feet":"shoes-dress"}},"note":"Wir hören nicht zu."},{"id":"f6","label":"B3","x":2.5,"z":1,"facingY":-1.5708,"color":"#a8402f","scale":1.0,"preset":"slump","figureType":"team_passive","appearance":{"color":"#a8402f","face":"withdrawn","body":"adult-average","accessories":{"head":"hair-short","upper":"vest","feet":"boots-work"}}}],"zones":[{"id":"zone-group-a","x":-2.5,"z":0,"shape":"rect","width":2.4,"height":3.6,"label":"Gruppe A","color":"#3b6ea5","opacity":0.15},{"id":"zone-group-b","x":2.5,"z":0,"shape":"rect","width":2.4,"height":3.6,"label":"Gruppe B","color":"#b04a3a","opacity":0.15}],"anchors":[{"id":"anchor-gap","x":0,"z":0,"label":"Spalte","color":"#8a93a5"}],"lines":[{"id":"l1","fromId":"f1","toId":"f4","lineType":"tension"},{"id":"l2","fromId":"f2","toId":"f5","lineType":"tension"}],"optik":{"floor":"slate","sky":"calm","lightMood":"cool"}}',
   true),
  ('2b5e2498-c36a-56c0-939c-4a87cea4ebe6', 'mentolder', 'Innere Anteile',
   'Fünf Figuren im Bogen um einen gemeinsamen Fokus — gedämpfte Töne, innere Anteile.',
   'Coaching',
   '{"figures":[{"id":"f1","label":"Kritik","x":-1,"z":-1.732,"facingY":2.618,"color":"#7d8894","scale":1.0,"preset":"stand","figureType":"saboteur","appearance":{"color":"#7d8894","face":"defiant","body":"adult-average","accessories":{"head":"hair-short","upper":"vest","feet":"boots-work"}},"note":"Ich sage, was wirklich stimmt."},{"id":"f2","label":"Fürsorge","x":1,"z":-1.732,"facingY":-2.618,"color":"#8f9c8a","scale":1.0,"preset":"stand","figureType":"resource","appearance":{"color":"#8f9c8a","face":"protective","body":"adult-average","accessories":{"head":"hair-bun","upper":"shawl","feet":"sandals"}},"note":"Ich trage die anderen."},{"id":"f3","label":"Ich","x":2,"z":0,"facingY":-1.5708,"color":"#9a9188","scale":1.0,"preset":"stand","figureType":"coachee","appearance":{"color":"#9a9188","face":"overwhelmed","body":"adult-average","accessories":{"head":"hair-short","upper":"vest","feet":"barefoot"}},"note":"Alle Ansprüche reiben an mir."},{"id":"f4","label":"Ruhe","x":1,"z":1.732,"facingY":-0.5236,"color":"#8a8f98","scale":0.9,"preset":"slump","figureType":"resource","appearance":{"color":"#8a8f98","face":"resolved","body":"adult-average","accessories":{"head":"veil","upper":"robe","feet":"barefoot"}}},{"id":"f5","label":"Wut","x":-1,"z":1.732,"facingY":0.5236,"color":"#948d99","scale":1.0,"preset":"stand","figureType":"saboteur","appearance":{"color":"#948d99","face":"fearful","body":"adult-average","accessories":{"head":"hair-curls","upper":"vest","feet":"boots-work"}}}],"zones":[{"id":"zone-arc","x":0,"z":0,"shape":"circle","radius":2.6,"label":"Anteil-Bogen","color":"#8a8f98","opacity":0.12}],"anchors":[{"id":"anchor-focus","x":0,"z":0,"label":"Fokus","color":"#c8a96e"}],"lines":[{"id":"l1","fromId":"f1","toId":"f3","lineType":"tension"},{"id":"l2","fromId":"f2","toId":"f3","lineType":"resource"}],"optik":{"floor":"marble","sky":"calm","lightMood":"neutral"}}',
   true)
ON CONFLICT (brand, name) WHERE is_system IS TRUE
DO UPDATE SET
  id          = EXCLUDED.id,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  state       = EXCLUDED.state;

-- ────────────────────────────────────────────────────────────────────────────
-- Task 2b (pin) — after the upsert: pin the brand default to Familiensystem
-- (brainstorming decision) via the stable Task 3 UUID — no name literal.
-- Both UPDATEs are idempotent; the second keeps boot-time re-runs convergent.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE brett.board_templates SET is_default = true
 WHERE id = 'd0fbb4c0-49cc-5fac-9ee5-7d011c80b285';

UPDATE brett.board_templates SET is_default = false
 WHERE is_system IS TRUE
   AND id <> 'd0fbb4c0-49cc-5fac-9ee5-7d011c80b285';
