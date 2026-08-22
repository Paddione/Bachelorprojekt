# p2 — Align Plan and Chore entry paths

**Rolle:** impl · **depends_on:** p1 · **target_files:**
`.claude/skills/dev-flow-plan/SKILL.md`, `.agents/skills/dev-flow-plan/SKILL.md`,
`.claude/skills/dev-flow-chore/SKILL.md`, `.agents/skills/dev-flow-chore/SKILL.md`,
`.claude/skills/references/dev-flow-gotchas.md`, `.agents/skills/references/dev-flow-gotchas.md`

- [x] Keep `dev-flow-plan` as the behavior-change entry point and link its exit contract to the
  shared lifecycle reference; retain proposal, plan-lint, staged-plan and no-early-PR guards.
- [x] Slim `dev-flow-chore` to its unique routing decisions: no behavior change, recurring-job
  stop, test-only isolation choice and S1 residual budget check. Delegate Git mechanics to
  `git-workflow`, verification to `verification-block`, and transitions to the new reference.
- [x] Make Chore explicitly expose its test-only lifecycle for `dev-flow-e2e` without causing
  generic Playwright work to bypass the E2E domain procedure.
- [x] Move incident explanations and examples that are still useful into `dev-flow-gotchas.md`;
  leave one normative operator sentence and link at each original decision point.
- [x] Preserve current grep-tested phrases for cwd, ticket-before-branch, foreign-main guard,
  git-crypt staging and lock release, or migrate their tests in p4 with equivalent assertions.
