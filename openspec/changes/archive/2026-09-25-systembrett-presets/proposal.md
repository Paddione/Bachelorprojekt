# Proposal: systembrett-presets

## Why

Fresh Systembrett rooms boot empty: a single grey placeholder figure at 0,0.
The three curated system scenarios (`brett.board_templates`, brand `mentolder`)
are thin — `{id,label,x,z,facingY}` only, identical grey mannequins — and apply
solely via manual leiter action. Leiterinnen open unstructured boards; the
curated scenarios never unfold their effect. Additionally the seeding migration
(`004_board_templates.sql`) re-inserts duplicates on every server boot
(`ON CONFLICT DO NOTHING` without conflict target + random PK, no version
tracking in `runMigrations()`).

## What

1. **Auto-seed fresh rooms:** first join on a room with NO `brett_rooms` row
   auto-loads the brand default template (mentolder: Familiensystem 4
   Personen) server-side. Persisted-but-empty rooms (intentional clear) are
   NOT re-seeded.
2. **Full staging:** system template states carry the full client-honored
   figure vocabulary (positions, colors, outfits/faces, poses) plus
   zones/anchors and board mood; the seed path (`seedFiguresFromTemplate`)
   is extended beyond figures-only.
3. **Leiter reset-to-default:** explicit path back to the startup default.
4. **Migration hygiene:** new migration `005_*` with stable UUIDs, real
   conflict target, UPDATE of thin states to full staging, and dedupe of the
   prod duplicates created by 004.

_Ticket: T900360_
