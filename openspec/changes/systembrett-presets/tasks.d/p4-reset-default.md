# P4 — Leiter Reset-to-Default (dedicated admin message)

## Goal

Give the leiter an explicit path back to the startup default scenario (clear +
re-seed with the brand default), per design decision D5 and the delta spec
`specs/brett.md` ("Leiter can reset to the startup default"). This partial
covers the reset message end to end: protocol type, server handler with
leiter-only permission, snapshot broadcast, and the minimal leiter-gated
client trigger. It depends on P1 (default-marker column in migration 005) and P3 (marker-based
resolver plus full seed path incl. zones/anchors/optik) and modifies neither.

## Decision

A dedicated admin message `admin_reset_board_to_default` is specified instead
of reusing `admin_set_board_template` with a client-resolved default id.
Server-side resolution keeps the brand default single-sourced in the P1 marker
column consumed through P3's resolver: resolving the default in the client would duplicate the default
concept in two layers, reintroduce the rename fragility design D2 explicitly
rejects, and add a fetch race between listing templates and sending the
apply. A dedicated message is also auditable (reset is distinguishable from
a manual template apply in logs and broadcasts) and costs only a small
additive case that fits the measured S1 budget on every touched file, so
reuse buys no meaningful saving while weakening the design guarantees.

## Target files (disjoint from P1/P2/P3/P5)

P1 (`p1-migration.md`) owns `migrations/005_board_templates_full_staging.sql`
(the default-marker column). P2 (`p2-seed-extension.md`) owns `figures.ts`
(seed-path extension) and the `applyTemplateToRoom` full-staging behavior.
P3 (`p3-auto-seed.md`) owns `ws-connection.ts` + `db.ts`, including the
`getBrandDefaultTemplate(brand)` marker lookup — P4 calls that resolver but
does not modify `db.ts` or `board-templates.ts`. P5 owns `tests/spec/brett.bats`.
`components/brett/src/client/ui/lobby.ts` is read-only context (template
dropdown, System-Szenarien optgroup) and is not modified. P4 touches exactly:

| file | change |
|---|---|
| `components/brett/src/types/messages.ts` | one new `ClientMessage` variant |
| `components/brett/src/server/ws-admin-commands.ts` | new `admin_reset_board_to_default` case |
| `components/brett/src/server/ws-handler.ts` | register the new type in `ADMIN_TYPES` |
| `components/brett/src/client/ui/topbar-share.ts` | leiter-gated reset button (existing `shareButtonVisible` pattern) |

## Steps

### Step 1 — Protocol type for the reset message

Add the typed variant to `ClientMessage` in
`components/brett/src/types/messages.ts`, next to the existing
`admin_set_board_template` entry:

```ts
| { type: 'admin_reset_board_to_default' }
```

No payload is needed: the brand default is resolved server-side from the
room context via P2, so the client never names a template and no
hardcoded identifier crosses the wire. Fully typed, no new `any`.

Verify:

```bash
npm run typecheck --prefix components/brett
```

### Step 2 — Server handler: resolve default, apply, persist

Add a new case `admin_reset_board_to_default` in `handleAdminMessage`
(`components/brett/src/server/ws-admin-commands.ts`), adjacent to the
`admin_set_board_template` case. Behavior:

1. Resolve the brand default template server-side through P3's
   `getBrandDefaultTemplate(brand)` from `db.ts` (same dynamic-import
   pattern as the existing `getBoardTemplate`/`getPool` usage in that
   case; the brand comes from the room context, never from a client
   parameter).
2. If a default template with state is found and `deps.applyTemplateToRoom`
   exists, apply it to the admin room with the broadcast callback, exactly
   like the manual-apply path.
3. Call `deps.schedulePersist(adminRoom)`.

No separate clear mutation is required: `applyTemplateToRoom` replaces the
room state (figures plus zones/anchors/optik once P3 lands), so apply IS
clear plus re-seed. If no default template resolves, send
`{ type: 'error', reason: 'no-default-template' }` to the sender and change
nothing. This case must not be conflated with `admin_set_template`
(`sessions.ts`, coaching-template concept); it shares only the
`applyTemplateToRoom` broadcast shape with `admin_set_board_template`.

Verify:

```bash
npm run typecheck --prefix components/brett
npm test --prefix components/brett
```

### Step 3 — Permission: leiter-only via the existing admin gate

Register `'admin_reset_board_to_default'` in `ADMIN_TYPES`
(`components/brett/src/server/ws-handler.ts`). The outer gate in
`ws-connection.ts` then applies unchanged: Keycloak-admin OR current room
leiter, all other senders are dropped before `handleAdminMessage` runs.
This follows the existing admin-command pattern (the same gate already
protects `admin_set_board_template`), so no bespoke in-case role check is
added. Note for the executor: `admin_set_board_template` itself is
currently absent from `ADMIN_TYPES`; reachability of the new type is proven
by the Step 5 flow check, and the pre-existing gap stays out of scope for
this partial.

Verify:

```bash
npm run typecheck --prefix components/brett
```

### Step 4 — Client: leiter-gated reset trigger on the board surface

Add a reset button in `components/brett/src/client/ui/topbar-share.ts`,
gated by the existing `shareButtonVisible(role, isAdmin)` predicate (leiter
or admin), mounted next to the share button. On click it sends the typed
message via the direct-`sendClient` precedent from `fig-panel.ts`:

```ts
sendClient({ type: 'admin_reset_board_to_default' });
```

No lobby change is needed: `lobby.ts` stays untouched, and the button text
uses the existing label style of that module. The broadcast of
the resulting snapshot (Step 2, via `applyTemplateToRoom` to the whole
room, role-aware filtered by the existing broadcast path) updates every
client including the leiter, so no client-side state patching is added.

Verify:

```bash
npm run typecheck --prefix components/brett
npm run build --prefix components/brett
```

### Step 5 — Manual leiter-flow check (acceptance for this partial)

1. Boot a fresh room as leiter: the board shows the brand default
   constellation (P1 behavior).
2. Modify the board (move or delete a figure), then trigger the new reset
   button as leiter: the board shows the brand default constellation again
   (figures plus zones/anchors/mood once P3 lands).
3. Repeat the trigger as gast: nothing changes and no snapshot is
   broadcast (outer gate drops the message).
4. BATS coverage for the reset scenarios (reset restores default,
   intentional-clear still respected, non-leiter trigger is a no-op) is
   owned by P5 in `tests/spec/brett.bats`; this partial specifies the
   scenarios, P5 implements them:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brett/
```

## S1 budget notes (measured, not assumed)

Baseline lookup (`jq` on `docs/code-quality/baseline.json`) returns
`nicht-baselined` for all four target files, so the effective threshold is
the static `.ts` limit from `docs/code-quality/gates.yaml` (900 lines).
Measured `wc -l` versus budget (limit minus Ist):

- `components/brett/src/server/ws-admin-commands.ts` Ist 513 (Budget 387):
  Step 2 adds roughly 20 lines, far inside budget.
- `components/brett/src/server/ws-handler.ts` Ist 230 (Budget 670):
  Step 3 adds one line.
- `components/brett/src/types/messages.ts` Ist 108 (Budget 792):
  Step 1 adds one line.
- `components/brett/src/client/ui/topbar-share.ts` Ist 81 (Budget 819):
  Step 4 adds roughly 15 lines.

The brief assumed budget near zero on `ws-admin-commands.ts`; the lookup
contradicts that (Budget 387), so no split or shrink is planned — every
change here is purely additive and small. S2: no new module imports toward
DB or API layers (dynamic import follows the existing case pattern, no
cycle). S3: no brand or domain literals in code (brand resolves
server-side from room context). New code is fully typed.
