# T001210 — Dev-Flow-Chore & Ticket-Ops Mishap Bundle (Design Note)

**Ticket:** T001210 — "Mishap-Bundle: skills/dev-flow-chore, skills/ticket-ops (2 Einträge)"
**Date:** 2026-06-27
**Branch:** `fix/t001210-dev-flow-chore-ticket-ops-mishaps`
**Status:** design — failing test + plan written, implementation deferred to `dev-flow-execute`

## Purpose

Bundle two process mishaps recorded against agent-skills, each reproducible on the
current `main` HEAD (2cc010f5) and each addressable by a small, self-contained SKILL.md
edit plus a failing BATS test. No new code, no new endpoints — both fixes live in
existing `.claude/skills/*/SKILL.md` files and are verifiable from grep on those files.

## Scope

In scope:

1. **Mishap 1** — `.claude/skills/dev-flow-chore/SKILL.md` Step 4 uses `git add -A`,
   which stages git-crypt smudge artifacts from `environments/.secrets/**` (~21 files
   visible in every worktree as "modified"). The skill acknowledges the git-crypt
   problem at the commit-landed-check (lines 112–118) but not at the staging step
   itself. Workaround applied ad hoc in PR #2135 / T001199: explicit path-based
   staging + a pre-commit "is any `environments/.secrets/**` in the index?" guard.
   This bundle codifies that workaround in the skill itself.
2. **Mishap 2** — `.claude/skills/ticket-ops/SKILL.md` does not deduplicate intake.
   On 2026-06-27 four duplicate tickets (T001196, T001197, T001201, T001202) were
   created with the verbatim title "E2E notification test — Playwright FA-bug-notify"
   while the canonical ticket T001147 is `done` (shipped) and the prior mishap
   bundle T001148 is `done` (obsolete). The skill needs a "check for an existing
   ticket with this title (or referenced canonical ticket) before creating a new
   one" guard at the GitHub Issue Intake step (Phase 4, Step 4.4) and at the
   error-intake path in Phase 1.

Out of scope (deferred to separate tickets, listed for record):

- Identifying the upstream auto-re-trigger source for Mishap 2 (factory tick? a
  croned re-fail? an event replay?). This bundle hardens the skill against the
  symptom; the root-cause investigation continues independently and is referenced
  in the plan's verification step.

## Root-cause analysis

### Mishap 1 — `git add -A` is a foot-gun in a git-crypt worktree

In this repo, `environments/.secrets/**` is encrypted at rest by git-crypt
(`.gitattributes` line "git-crypt-managed secrets (encrypted at rest in this
PUBLIC repo)"). The clean/smudge filter rewrites the working-tree copy on every
checkout, which surfaces as "modified" in `git status` even when nothing was
intentionally changed. The default worktree therefore shows ~21 unrelated
modifications that an unwary `git add -A` will promote into the index and the
next commit. A bare `git diff --cached --name-only` over the result will show
~21 paths under `environments/.secrets/**` that the dev never touched.

The skill already has TWO checkpoints that catch the consequence but not the
cause: (a) the commit-landed check on line 115 (`HEAD_SHA = BASE_SHA ⇒ FATAL`)
catches the case where the git-crypt clean filter rejected the commit silently,
and (b) the post-merge workflow handles the on-push side. Neither catches the
case where the commit *does* land and ships 21 secret-arena paths in the diff.

The fix is purely instructional: replace the bare `git add -A` with explicit
pathspec staging of the files the chore actually changed, and add a hard
pre-commit guard that aborts if the index contains any `environments/.secrets/**`
path. Both are guard pattern, not a tool change — no scripts touched.

### Mishap 2 — `ticket-ops` lacks a title-dedupe check at intake

The internal `tickets.tickets` table is the single source of truth for issues;
the skill correctly routes GitHub Issue Intake (Step 4.4) into it and routes
factory/agent-intake through `mcp__ticket-mcp__create_ticket`. But neither path
in the skill asks "does a ticket with the same title (or same canonical
reference) already exist?" before creating a new row. A repeated re-trigger of
the same upstream signal therefore produces N near-duplicate rows, with the
title-as-key matching the human eye perfectly.

The fix is a small de-dupe step before the INSERT: query for `external_id` of
any open ticket whose `title` matches the new intake (case-insensitive,
whitespace-normalised); if one exists, route to a "reuse" branch (return the
existing `external_id`; append a comment to the existing row pointing at the
new trigger; do not create a new row). For the GitHub Issue Intake path the
same lookup + comment-on-existing + close-the-issue-as-duplicate flow is
needed.

## Fix approach

Two small, isolated SKILL.md edits. The failing BATS test (`tests/spec/
dev-flow-chore-ticket-ops-mishaps.bats`) codifies both invariants. After the
fix is implemented in `dev-flow-execute`, the test will go green. Both
edits are pure documentation / process; no executable code changes.

**Mishap 1 fix (dev-flow-chore):**

1. Step 4 — replace the `git add -A` line with a recommended pattern: stage
   only the files the chore actually changed, e.g.
   `git add <changed-paths>` or
   `git add $(git diff --name-only -- '*.ts' '*.svelte' '*.sh' '*.md' ':!environments/.secrets/*')`.
2. Step 4 — add an explicit pre-commit guard block:
   ```bash
   # Secret-in-index guard (T001210). git-crypt smudge artifacts in
   # environments/.secrets/** appear as "modified" in every worktree and must
   # never be staged by a chore commit. Abort with a clear error if the index
   # contains any such path.
   if git diff --cached --name-only | grep -q '^environments/.secrets/'; then
     echo "FATAL: environments/.secrets/** is git-crypt-protected and must not be staged" >&2
     git diff --cached --name-only | grep '^environments/.secrets/' | sed 's/^/  /' >&2
     exit 1
   fi
   ```
3. Add a one-line pointer to the canonical workaround (T001199 / PR #2135) at
   the top of Step 4 so future readers see the historical context.

**Mishap 2 fix (ticket-ops):**

1. Phase 4 Step 4.4 (GitHub Issue Intake) — before the `tickets.tickets` row
   INSERT, run a title-dedupe query. If an open row with the same normalised
   title exists, close the GitHub issue as a duplicate referencing the
   existing `external_id`; append a `ticket_comments` row to the existing
   ticket noting the re-trigger source.
2. Phase 1 Step 1.4 (Completeness triage) — when a new auto-intake arrives
   (e.g. via the factory or via a recurring web-hook), the same dedupe query
   is the precondition for *creating* a new row. The skill should call this
   out explicitly.
3. The dedupe helper is small enough to live inline in the skill (a 3-line
   SQL snippet) — no new module needed.

## Acceptance criteria

- `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats` is RED on the current
  branch (`fix/t001210-dev-flow-chore-ticket-ops-mishaps` at HEAD 2cc010f5) and
  turns GREEN after the SKILL.md edits are applied.
- The test asserts both invariants independently:
  - dev-flow-chore Step 4 contains no bare `git add -A` AND contains the
    `environments/.secrets/**` secret-in-index guard.
  - ticket-ops Phase 4 Step 4.4 (and Phase 1 Step 1.4) contains a
    title-dedupe guard.
- No new files in `website/`, `scripts/`, or `k3d/`. The fix is SKILL.md-only.
- Existing tests stay green: `task test:changed` PASS (only `tests/spec/
  dev-flow-chore-ticket-ops-mishaps.bats` is new).
- Plan-lint: `bash scripts/plan-lint.sh openspec/changes/dev-flow-chore-ticket-ops-mishaps/tasks.md` returns 0.

## Risks & notes

- **Mishap 2 root cause unknown.** The plan acknowledges the symptom-only fix
  and notes that the upstream re-trigger source investigation is out of scope.
  The de-dupe guard will short-circuit further duplicates even if the upstream
  trigger is not yet identified, which is the highest-value outcome.
- **Mishap 1 is a known pattern.** T000925 (PR #2128) already documented the
  silent-commit-failure variant of the same root cause. This bundle is the
  missing second half of the same lesson and should be cross-referenced.
- **No new executable code.** Both fixes are SKILL.md edits. This keeps the
  change low-risk and high-review-velocity. A future ticket may move the
  dedupe SQL into a `scripts/ticket-dedupe.sh` helper, but that is not
  required to close this bundle.
