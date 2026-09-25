---
title: Design: Systembrett-Presets — Auto-Seed + Full-Staging
ticket_id: T900360
domains: [website, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: Systembrett-Presets — Auto-Seed + Full-Staging

## Intent

Fresh Systembrett rooms boot empty (single grey figure at 0,0 via board-boot).
The three system board templates (`brett.board_templates`, brand `mentolder`) are
thin — `{id,label,x,z,facingY}` only, identical grey mannequins — and apply ONLY
via manual leiter action. Goal: rooms open with a distinct, fully staged
constellation; system templates carry full figure expression (positions, colors,
outfits/faces, poses, zones/anchors, board mood); the seeding migration is
idempotent.

## Decisions (Brainstorming 2026-09-24, Fragen-Dialog)

1. **Auto-seed fresh rooms.** First join on a room with NO `brett_rooms` row
   auto-loads the brand default template server-side. A persisted-but-empty
   room is an intentional clear and MUST NOT be re-seeded. Consequence:
   `readState()` (db.ts:43-49) currently returns `{figures:[]}` for both cases —
   the join flow needs an explicit row-existence check.
2. **Brand default (mentolder) = Familiensystem 4 Personen.** The default marker
   mechanism (e.g. `is_default` column + partial unique index per brand) is a
   planner decision; resolving by hardcoded name is rejected (S3-ish fragility,
   rename would silently break startup).
3. **Full staging.** System template states carry the full client-honored
   figure vocabulary (`src/types/state.ts` Figure: `color`, `preset`,
   `appearance.{color,face,body,accessories}`, `figureType`, `note`,
   `opacity`, `scale`, `boneOverrides`) PLUS `zones`, `anchors`, `optik`
   (`{floor,sky,lightMood}`), `lines` where dramatically useful.
4. **Seeder gap closed.** `seedFiguresFromTemplate` (figures.ts:403-413) seeds
   ONLY figures — zones/anchors/optik in template state are silently dropped.
   Full staging REQUIRES extending the seed path (figures + zones + anchors +
   optik; lines optional) for both auto-seed and manual apply.
5. **Leiter reset-to-default.** Leiter gets an explicit path back to the startup
   default (clear + re-seed). Whether a dedicated message or reuse of
   `admin_set_board_template` with the resolved default id — planner decision.
6. **Migration hygiene.** New migration `005_*` (never edit-and-rerun 004):
   stable UUIDs for the 3 system rows, real conflict target (unique constraint,
   e.g. on `(brand,name)` for system rows), UPDATE of the thin states to full
   staging, and DEDUPE of the prod duplicates the current 004 creates on every
   boot (keep oldest per `(brand,name)`, delete rest).

## Rejected alternatives

- **Client-side default constellation:** rejected — board state is
  server-authoritative (D7 in figures.ts:415-426); a client default would
  diverge from persisted state and break leiter/gast consistency.
- **Seed on every join when board empty:** rejected — clobbers intentional
  clears; existence-check (D1) is the correct discriminator.
- **Fix by editing 004 in place:** rejected — 004 already ran in prod;
  duplicates already exist. Only a new migration with dedupe repairs prod.
- **`ON CONFLICT DO NOTHING` without target (status quo):** root cause of the
  duplication — random `gen_random_uuid()` PK never conflicts, and
  `runMigrations()` (db.ts:100-112) re-runs every file each boot.

## Integration points (verified 2026-09-24)

- Join flow: `ws-connection.ts:85-95` (`readState` → `ensureFigureMap` →
  `seedFigureMapFromState` when `map.size === 0`). Auto-seed hook goes here.
- Manual apply: `ws-admin-commands.ts:288-293` (`admin_set_board_template` →
  `getBoardTemplate` → `applyTemplateToRoom`) and snapshot path `:280-282`.
- Do NOT conflate with `admin_set_template` (sessions.ts:192-194, coaching
  template → `lobbySettings.templateId`) — different template concept.
- Template list UI: `src/client/ui/lobby.ts:167-188` (System-Szenarien optgroup).
- Requirement anchor: `openspec/specs/brett.md:117` (curated templates reusable
  across sessions) — extended, not replaced.
- Existing guards: `tests/spec/brett.bats` (extend, no new ticket-numbered file).

## Constraints for the planner

- S1 file-size budgets vs `docs/code-quality/baseline.json` (hot files:
  figures.ts 480, ws-connection.ts 409, ws-admin-commands.ts 513 lines).
- No brand-domain literals in code snippets (S3); pure modules, no import
  cycles (S2); new migration referenced, not orphaned (S4).
- plan-lint hard rules apply (F1/F2/STRUCT1-3/P1/B1a/B1b).
