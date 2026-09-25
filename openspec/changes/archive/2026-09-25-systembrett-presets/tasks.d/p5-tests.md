# p5 — RED-to-GREEN BATS coverage for systembrett-presets (tests only)

## Goal

Append failing-first `@test` blocks to the established brett guard file covering
the five behaviors from the brett delta scenarios: (a) migration idempotency —
run 005 twice, system row count stable, no dupes per (brand, name); (b) full
staging — all three system templates carry figures with distinct colors and
poses plus zones, anchors and optik; (c) the seed path applies zones, anchors
and optik, not just figures; (d) the auto-seed discriminator — a missing room
row seeds the brand default while an existing-but-empty row stays empty;
(e) reset-to-default restores the brand default constellation. This partial
changes no production code: the new tests land red and turn green as the
implementation partials land.

## Target files

- `tests/spec/brett.bats` — append-only: new `@test` blocks at the end, no
  existing block touched.
- `components/website/src/data/test-inventory.json` — regenerated artifact,
  committed alongside the test change (the repo inventory script scans
  tests/spec and the freshness gate fails on stale artifacts).

## Environment (verified in this worktree)

- Node v22.23.2 is installed, so the brett server under components/brett (npm)
  builds and runs.
- The psql 16 client is installed but no server answers pg_isready, so every
  database-backed assertion below guards itself: when the server is unreachable
  or DATABASE_URL is unset the test calls skip with a reason instead of failing.
- The only supported runner is the vendored tests/unit/lib/bats-core/bin/bats;
  the global bats binary must not be used.
- The guard file header documents its offline grep-only convention; the static
  gates below follow that style and the live database gates carry skip guards.

## Deliberate convention choice

tests/CLAUDE.md prefers fresh spec-dir files over extending the Sammeldatei,
but the change design pins this exact guard file (extend, never a new
ticket-numbered file) and every existing brett guard lives there, so the new
blocks are appended to it on purpose.

## Task 5.1: migration-idempotency plus full-staging gates (red)

Append to the end of tests/spec/brett.bats:

1. A guarded database test that applies the 005 seeding migration twice against
   DATABASE_URL and asserts the system row count is stable across both runs and
   that no (brand, name) group holds more than one row. Guard: pg_isready fails
   or DATABASE_URL is unset, then skip with a clear reason. Positiv-Anker: the
   same test first asserts that at least three system rows exist, so an empty
   table cannot fake a pass.
2. Offline staging gates over the 005 migration file: each of the three system
   template names is present; every staged state carries figure color entries
   with at least two distinct colors per template; facingY and pose carriers,
   zones, anchors and optik (floor, sky, lightMood) keys are present for all
   three templates.

## Task 5.2: seed-path, discriminator and reset gates (red)

Append to the end of tests/spec/brett.bats:

1. Seed-path gate: the template seeder in components/brett/src/server/figures.ts
   handles zones, anchors and optik alongside figures, and the apply
   orchestrator broadcasts the seeded board.
2. Discriminator gate: the join flow in
   components/brett/src/server/ws-connection.ts performs a row-existence check
   on brett_rooms before seeding, so a missing row seeds the brand default
   while a persisted-but-empty room is left untouched.
3. Reset gate: the admin command layer exposes an explicit reset-to-default
   path back to the brand default constellation, and the 005 migration carries
   the default-marker mechanism the reset resolves through.

## Task 5.3: red-phase run (expected: FAIL)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brett.bats
# expected: FAIL — the blocks from Task 5.1 and Task 5.2 fail because the 005
# migration, the extended seed path, the join discriminator and the reset path
# do not exist yet on this branch
```

## Task 5.4: regenerate the test inventory

```bash
task test:inventory
```

Commit the regenerated components/website/src/data/test-inventory.json together
with the extended tests/spec/brett.bats in one commit.

## Task 5.5: green-phase re-run plus mandatory gates

Re-run the identical runner after the implementation partials have landed:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brett.bats
# green — every block from Task 5.1 and Task 5.2 passes; database-backed blocks
# either pass against a reachable postgres or skip with their guard reason
```

Then the mandatory verification:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## S1 size note

The guard file counts 237 lines today via wc -l. The baseline lookup for its
S1 key returns nicht-baselined, and the s1.limits table in
docs/code-quality/gates.yaml holds no extension entry covering this path, so
the S1 gate seats no effective threshold here. Following the linter guidance
to state no number when unsure, this plan claims no numeric value; growth stays
append-only at roughly one hundred twenty added lines of @test blocks. No
split or shrink step is needed.

## Index integration

When the tasks.md index gains its Partials manifest, this partial is the final
row with role tests:

| p5 | tasks.d/p5-tests.md | tests | tests/spec/brett.bats, components/website/src/data/test-inventory.json |
