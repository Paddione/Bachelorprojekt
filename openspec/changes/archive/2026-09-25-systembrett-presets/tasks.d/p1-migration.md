# P1 — Migration `005_board_templates_full_staging.sql`

## Goal

Ship a single new migration that repairs and upgrades the three system board
template rows (brand `mentolder`: Familiensystem 4 Personen, Team-Konflikt,
Innere Anteile) without touching `004_board_templates.sql` (already applied in
prod — editing it would neither repair existing duplicates nor re-run).
The migration is safe under `runMigrations()` in `db.ts`, which re-executes
every `*.sql` file on each boot, and it is idempotent: re-running it changes
nothing. Ticket T900360, design decision D6.

## Target files

Disjoint scope — this partial owns exactly one file, no other file is modified
by its tasks:

- `components/brett/src/server/migrations/005_board_templates_full_staging.sql` (new)

Read-only context the executor consults but does not change:
`components/brett/src/server/migrations/004_board_templates.sql` (table shape,
thin states, causative `ON CONFLICT DO NOTHING` without target),
`components/brett/src/server/migrations/001_session_events.sql` (confirmed: no
uniqueness guard for board templates lives there — the guard is new work for
005), `components/brett/src/server/db.ts` (`runMigrations` re-runs all files
each boot), `components/brett/src/types/state.ts` (Figure vocabulary, see Task 3).

## Task 1 — Dedupe existing system rows, keep oldest per (brand, name)

Delete duplicate system rows so the uniqueness guard in Task 2 can build.
Keep exactly one row per `(brand, name)` among `is_system = true` rows: the
oldest by `created_at`, tie-broken by smallest `id`. Restrict the delete to
system rows so user-created templates are never touched.

Sketch (executor writes final SQL in the 005 file):

```sql
DELETE FROM brett.board_templates a
USING brett.board_templates b
WHERE a.is_system IS TRUE
  AND b.is_system IS TRUE
  AND a.brand = b.brand
  AND a.name = b.name
  AND (b.created_at, b.id) < (a.created_at, a.id);
```

Verify (psql against a database that already contains 004-made duplicates):

```bash
SELECT brand, name, count(*) FROM brett.board_templates
 WHERE is_system IS TRUE GROUP BY brand, name HAVING count(*) > 1;
-- expect: zero rows
```

## Task 2 — Add the real uniqueness guard for system template rows

Neither 001 nor 004 defines any uniqueness guard on board templates (004 only
carries the non-unique index on brand, is_system, created_at). Add a partial
unique index covering only system rows, so user templates sharing a name stay
allowed while system rows gain a genuine conflict target:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_board_templates_brand_name_system
  ON brett.board_templates (brand, name)
  WHERE is_system IS TRUE;
```

Ordering constraint: this statement MUST come after the Task 1 delete —
building a unique index over still-duplicated rows fails, which is exactly why
dedupe-first is load-bearing. `IF NOT EXISTS` keeps boot-time re-runs quiet.

Verify:

```bash
SELECT indexname FROM pg_indexes
 WHERE tablename = 'board_templates'
   AND indexname = 'uq_board_templates_brand_name_system';
-- expect: one row
```

Rejected and forbidden here: editing 004 in place (already ran in prod), and
any `ON CONFLICT DO NOTHING` without an explicit conflict target.

## Task 2b — Default-marker column and single default per brand

Downstream partials resolve the brand default exclusively by marker: the
auto-seed lookup (`getBrandDefaultTemplate`, seed-path partial) and the
reset-to-default handler (reset partial) both filter on the marker column,
and design D2 forbids name literals. Neither 001 nor 004 defines such a
column, so 005 adds it alongside the Task 2 guard (same file, statement
order after the Task 2 index — no dependency between the two indexes):

```sql
ALTER TABLE brett.board_templates
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_board_templates_brand_default
  ON brett.board_templates (brand) WHERE is_default IS TRUE;
```

The partial predicate gives exactly one default per brand while leaving all
other rows unconstrained. After the Task 3 upsert, pin the marker with
idempotent re-runnable UPDATEs (placed after the upsert statements):

```sql
UPDATE brett.board_templates SET is_default = true
 WHERE id = 'd0fbb4c0-49cc-5fac-9ee5-7d011c80b285';
UPDATE brett.board_templates SET is_default = false
 WHERE is_system IS TRUE AND id <> 'd0fbb4c0-49cc-5fac-9ee5-7d011c80b285';
```

The pinned row is Familiensystem (brand default from the brainstorming
decision); the second UPDATE keeps boot-time re-runs convergent. The Task 3
upsert's `DO UPDATE SET` touches only description/category/state, so it never
fights the marker. No name literal is used — the pin keys on the stable
Task 3 UUID.

Verify:

```bash
psql "$DATABASE_URL" -c "SELECT brand, name FROM brett.board_templates WHERE is_default IS TRUE;"
-- expect: exactly one row per brand (mentolder / Familiensystem 4 Personen)
```

## Task 3 — Upsert the 3 system rows with stable UUIDs and full staging

Insert the three system rows with pinned stable UUIDs (uuid5, namespace DNS —
reproducible via `python3 -c "import uuid;
print(uuid.uuid5(uuid.NAMESPACE_DNS, 'board-template.mentolder.<name>'))"`),
then rely on the Task 2 index as the conflict target so re-runs update instead
of duplicating:

- Familiensystem 4 Personen → `d0fbb4c0-49cc-5fac-9ee5-7d011c80b285`
- Team-Konflikt → `2d329117-d98e-5dd0-b89a-4a18ccfa240e`
- Innere Anteile → `2b5e2498-c36a-56c0-939c-4a87cea4ebe6`

```sql
INSERT INTO brett.board_templates
  (id, brand, name, description, category, state, is_system)
VALUES
  ('d0fbb4c0-49cc-5fac-9ee5-7d011c80b285', ...),
  ('2d329117-d98e-5dd0-b89a-4a18ccfa240e', ...),
  ('2b5e2498-c36a-56c0-939c-4a87cea4ebe6', ...)
ON CONFLICT (brand, name) WHERE is_system IS TRUE
DO UPDATE SET description = EXCLUDED.description,
              category = EXCLUDED.category,
              state = EXCLUDED.state;
```

The `ON CONFLICT` target MUST carry the same `WHERE is_system IS TRUE`
predicate as the partial index, otherwise Postgres cannot match the arbiter
index and the statement fails.

State payload requirements (replacing the thin `{id,label,x,z,facingY}`
states from 004): every figure uses the full client-honored vocabulary from
`components/brett/src/types/state.ts` — `color`, `preset`,
`appearance{color,face,body,accessories}`, `figureType`, `scale`, `facingY`,
plus `note` where a figure carries a statement; `opacity` and `boneOverrides`
only where dramatically justified. Each template state additionally carries
`zones`, `anchors`, and `optik{floor,sky,lightMood}` (plus `lines` where a
relationship or tension line earns its place). Exact coordinates are executor
detail, but the three constellations MUST be distinct and dramatically
sensible:

- Familiensystem: 4 figures, warm palette, close circle facing inward.
- Team-Konflikt: 6 figures in two opposed color groups with clear distance
  between the groups, facing across the gap.
- Innere Anteile: 5 figures in a semicircle, muted tones, oriented toward a
  shared focal point.

Verify (idempotency: apply the 005 file twice, counts stay stable):

```bash
psql "$DATABASE_URL" -f components/brett/src/server/migrations/005_board_templates_full_staging.sql
psql "$DATABASE_URL" -f components/brett/src/server/migrations/005_board_templates_full_staging.sql
psql "$DATABASE_URL" -c "SELECT count(*) FROM brett.board_templates WHERE is_system IS TRUE;"
-- expect: 3
psql "$DATABASE_URL" -c "SELECT brand, name, count(*) FROM brett.board_templates WHERE is_system IS TRUE GROUP BY brand, name HAVING count(*) > 1;"
-- expect: zero rows
```

## Task 4 — Final verification and freshness

Run the migration checks from Task 3, then confirm the repo gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task freshness:check` covers the S1–S4 ratchet and the baseline key-count
assertion; this partial adds no baseline entries and modifies no tracked file.

## S1 budget note

`components/brett/src/server/migrations/005_board_templates_full_staging.sql`
is a new file with budget 800: the `.sql` extension has no entry under
`s1.limits` in `docs/code-quality/gates.yaml` (verified from the worktree
root) and `baseline.json` carries no `.sql` keys, so S1 does not track it;
the file is still cut small — planned around 150 lines (dedupe + index +
three JSON states) — leaving ample growth reserve under any comparable limit.
