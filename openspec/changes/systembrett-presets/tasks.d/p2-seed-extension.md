# p2 — Seed extension: zones, anchors, optik alongside figures

## Goal

Close the seeder gap (design decision 4): `seedFiguresFromTemplate`
(`components/brett/src/server/figures.ts`, lines 403-413) seeds ONLY figures
and silently drops `zones`, `anchors`, and `optik` (`floor`, `sky`,
`lightMood`) carried in template state. This partial extends the template
seed path so zones, anchors, and optik are applied alongside figures through
the same server-authoritative orchestration (D7: `applyMutation` + broadcast
`snapshot`). The extended seed function serves BOTH callers: the manual
apply path `applyTemplateToRoom` (lines 422-426) and the future auto-seed
caller on first join (join-flow hook, owned by a separate partial).

## Target files

| path | ist | budget |
| `components/brett/src/server/figures.ts` | 480 | 420 |

No other file is touched by this partial. The join-flow hook
(`ws-connection.ts`), the admin command wiring (`ws-admin-commands.ts`), the
default-marker resolution, and the `005_*` migration are owned by separate
partials.

## S1 budget note

`components/brett/src/server/figures.ts` Ist 480 lines (Budget 420):
baseline lookup `jq -r '."S1:components/brett/src/server/figures.ts".metric
// "nicht-baselined"' docs/code-quality/baseline.json` returns
`nicht-baselined`, so the effective threshold is the static `.ts` limit of
900 from `docs/code-quality/gates.yaml` (`s1.limits`). Budget = 900 − 480 =
420. The extension below adds roughly 30-45 lines net (two sentinel reseed
blocks + optik block + snapshot enrichment + typed imports), staying far
below the effective threshold. No split, extract, or shrink step is required.

## Constraints

- D7 server-authoritative orchestration is preserved: all state changes go
  through `applyMutation`; `applyTemplateToRoom` then broadcasts a `snapshot`
  built from `buildStateFromMutations`, never from a client payload.
- Pure-module discipline (S2): only a type-only import from
  `../types/state` (`Zone`, `Anchor`, `OptikSettings` alongside the existing
  `BrettLine` type import). No runtime import, no new import cycle.
- Typed code: new signatures use `Zone`, `Anchor`, `OptikSettings`, and the
  existing template-state shape. No new `any` beyond the two pre-existing
  `templateState: any` parameters, which keep their signatures so both
  callers stay compatible.

## Steps

### Step 1 — Extend `seedFiguresFromTemplate` to reseed zones, anchors, optik

In `components/brett/src/server/figures.ts`, extend `seedFiguresFromTemplate`
so it applies the full staged board, not figures alone:

- Figures (unchanged behavior): delete all non-sentinel entries (ids not
  starting with `__`), then re-add each entry of `templateState.figures` via
  `applyMutation(room, { type: 'add', figure: f })` so appearance-defaulting
  and the 200-cap keep applying.
- Zones: replace the `__zones__` sentinel content from
  `templateState.zones` (array of `Zone`). Clear stale zones first (delete
  the sentinel or reset to an empty list), then apply each staged zone via
  `applyMutation(room, { type: 'zone_create', zone })`, preserving staged
  ids when present and falling back to the module-local `generateId()` when
  an id is missing. An absent or empty `templateState.zones` clears the
  sentinel to empty so a previous board layout never leaks into the seeded
  room. Reuse the `zone_create` shape already handled at lines 272-278.
- Anchors: same pattern from `templateState.anchors` (array of `Anchor`)
  via `applyMutation(room, { type: 'anchor_create', anchor })`, reusing the
  `anchor_create` shape at lines 257-263, with identical clear-on-empty
  semantics for the `__anchors__` sentinel.
- Optik: apply `templateState.optik` (`OptikSettings`: `floor`, `sky`,
  `lightMood`) via `applyMutation(room, { type: 'optik_set', settings })`,
  reusing the `optik_set` shape at lines 187-193. Validate the payload is a
  non-array object before applying; an absent optik leaves the existing
  `__optik__` sentinel untouched.
- All other sentinels (`__session_phase__`, `__lobby_settings__`,
  `__roles__`, `__moderation__`, and the rest) stay untouched, matching the
  existing D6 doc comment.
- Update the D6 doc comment to describe the extended scope
  (figures + zones + anchors + optik).

Verify:

```bash
npm run typecheck --prefix components/brett
npm test --prefix components/brett
```

### Step 2 — Enrich `applyTemplateToRoom` snapshot with zones, anchors, optik

In `components/brett/src/server/figures.ts`, extend `applyTemplateToRoom`
(lines 422-426) so the broadcast `snapshot` reflects the seeded board:

- Call the extended `seedFiguresFromTemplate(room, templateState)` first
  (single code path shared with the future auto-seed caller).
- Read back the seeded board via the injected `buildStateFromMutations(room)`
  and broadcast all staged dimensions, e.g. figures plus zones, anchors,
  and optik as emitted by the state builder, so every client renders the
  staged constellation. Keep the signature
  `(room, templateState, broadcastFn)` unchanged.
- Update the D7 doc comment to state that the snapshot covers figures,
  zones, anchors, and optik.

Verify:

```bash
npm run typecheck --prefix components/brett
npm test --prefix components/brett
```

### Step 3 — Manual verification against existing board tests (new bats coverage owned by p5)

New bats coverage for fully staged applies (figures + zones + anchors +
mood asserted after apply and after reset-to-default) is owned by partial
p5, which extends the existing `tests/spec/brett.bats` guard file. This
partial lists the relevant suites as manual verification only and adds no
test file itself:

```bash
bash tests/spec/brett.bats
npm test --prefix components/brett
```
