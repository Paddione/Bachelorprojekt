# p1 — Shared lifecycle contract

**Rolle:** impl · **depends_on:** — · **target_files:**
`.claude/skills/references/dev-flow-lifecycle.md`,
`.agents/skills/references/dev-flow-lifecycle.md`, `.agents/skills/OVERVIEW.md`

- [x] Create the shared reference with a transition table for all four skills: trigger,
  entry state, owner, mutation scope, exit state and next handoff.
- [x] Add the Execute swimlane and define the persistent until-`MERGED` CI/conflict exception
  loop, including later failures and replacement runs after corrective pushes.
- [x] Centralize common branch, ticket, worktree, PR, merge-confirmation and cleanup invariants
  by linking their existing mechanical SSOTs rather than copying commands.
- [x] Update the Overview pipeline to distinguish behavior-change, no-behavior-change and
  post-deploy E2E paths, and document E2E as a specialized test-only Chore.
- [x] Create both tracked mirror paths and prove `cmp -s` parity.
