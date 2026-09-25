# P3 — Auto-seed on first join (row-existence check)

Goal: first join on a room with NO `brett_rooms` row auto-loads the brand
default template server-side through the extended seed path (figures + zones +
anchors + optik, lines where staged). A persisted-but-empty row is an
intentional clear and stays empty — no re-seeding. The brand default is
resolved exclusively by its default marker (e.g. `is_default` column with
partial unique index per brand, defined in the migration partial); resolving
the default by hardcoded template name literal is forbidden.

Binding: `openspec/changes/systembrett-presets/design.md` decisions 1 (existence
check discriminates missing row from intentional clear), 2 (marker-based
default resolution), and 4 (auto-seed consumes the extended seed path, it does
not reimplement a figures-only seed here).

## Target files

ONLY these two files change in this partial:

- `components/brett/src/server/ws-connection.ts`
- `components/brett/src/server/db.ts`

## S1 budget notes

Budgets computed against the effective threshold per
`.opencode/skills/references/plan-quality-gates.md` (baseline value when the
file is baselined, otherwise the static extension limit from
`docs/code-quality/gates.yaml`):

- `components/brett/src/server/ws-connection.ts` Ist 409 · baseline
  `nicht-baselined` (lookup: `jq -r
  '."S1:components/brett/src/server/ws-connection.ts".metric //
  "nicht-baselined"' docs/code-quality/baseline.json`) → effective threshold
  is the static `.ts` limit 900 → Budget 491. The join-flow edit stays far
  below threshold; no split needed.
- `components/brett/src/server/db.ts` Ist 112 · baseline `nicht-baselined`
  (lookup: `jq -r '."S1:components/brett/src/server/db.ts".metric //
  "nicht-baselined"' docs/code-quality/baseline.json`) → effective threshold
  is the static `.ts` limit 900 → Budget 788. One small existence-check helper
  plus one marker-based default lookup fit easily; no split needed.

Net line growth for both files stays in the low tens; no shrink or extraction
step required.

## Steps

### Step 1 — `db.ts`: explicit row-existence check plus marker-based default lookup

Add two small typed helpers without changing the semantics of the existing
`readState` for its current callers:

1. `roomRowExists(room: string): Promise<boolean>` — `SELECT 1 FROM
   brett_rooms WHERE room_token = $1` existence probe. This is the sole
   discriminator the join flow uses; `readState` keeps returning
   `{ figures: [] }` as fallback so no other caller changes behavior.
2. `getBrandDefaultTemplate(brand: string): Promise<any | null>` — loads the
   full staged state of the row carrying the default marker for the given
   brand (marker column defined by the migration partial, exactly one row per
   brand via partial unique index). Returns `null` when no default is marked
   so the join flow can skip seeding cleanly instead of failing the join.
   The query filters on the marker column and brand; a name literal in the
   `WHERE` clause is not accepted in review.

Constraints: typed signatures and return values throughout, no `any` leakage
into new exports beyond the established state-object shape used by
`readState`; pure DB module — no import from the websocket or figure-map
layers (S2: no new import cycle).

Verify:

```bash
npm run typecheck --prefix components/brett
```

### Step 2 — `ws-connection.ts`: gate the join-flow seed on row existence

In the join flow (`readState` → `ensureFigureMap` → `seedFigureMapFromState`
when `map.size === 0`, around lines 85-95), insert the existence check before
any seeding:

1. Query the Step-1 existence helper for the room.
2. Missing row → resolve the brand default server-side via the Step-1
   marker-based lookup and feed the returned full staged state into the
   extended seed path (figures + zones + anchors + optik; the extended seeder
   itself is owned by the seed-path partial, this partial only calls it).
   When the lookup returns `null` (no default marked), proceed with the
   current behavior and leave the board to boot empty.
3. Existing row (even with an empty figure set) → skip seeding entirely and
   keep the current `seedFigureMapFromState(map, state)` behavior for the
   persisted state only, so an intentional clear is respected.

Persist the auto-seeded room state through the established persist path so a
second join finds an existing row and never re-seeds.

Constraints: typed code, no client-side default constellation (board state
stays server-authoritative), no hardcoded template name anywhere in the join
flow, no new module cycle (S2: reuse the existing `deps` seam —
`readState`, `ensureFigureMap`, `seedFigureMapFromState` — plus the Step-1
DB helpers).

Verify:

```bash
npm run typecheck --prefix components/brett
npm test --prefix components/brett
```

Manual join-flow check: start the brett server with mock DB disabled, join a
fresh room token and confirm the full default constellation appears; clear
the board via leiter action, rejoin and confirm the board stays empty; join a
second fresh room token and confirm it seeds again.

### Step 3 — Regression cover owned by p5 (reference, no new test file here)

BATS coverage for both scenarios (fresh room seeds the default constellation;
persisted-but-empty room stays empty) is owned by partial p5, which extends
the existing `tests/spec/brett.bats` suite. This partial adds no separate
test file and changes no test inventory.

Verify (run from the p5 work item, referenced here for traceability):

```bash
./tests/runner.sh local brett
task test:changed
```
