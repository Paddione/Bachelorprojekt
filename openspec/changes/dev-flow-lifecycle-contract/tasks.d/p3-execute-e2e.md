# p3 — Execute swimlanes and E2E specialization

**Rolle:** impl · **depends_on:** p1 · **target_files:**
`.claude/skills/dev-flow-execute/SKILL.md`, `.agents/skills/dev-flow-execute/SKILL.md`,
`.claude/skills/references/dev-flow-execute-phases.md`,
`.agents/skills/references/dev-flow-execute-phases.md`,
`.claude/skills/references/ci-fix-loop.md`, `.agents/skills/references/ci-fix-loop.md`,
`.claude/skills/dev-flow-e2e/SKILL.md`, `.agents/skills/dev-flow-e2e/SKILL.md`

- [ ] Replace Execute's non-linear numbered narrative with explicit Implementer, Orchestrator
  and Finalizer swimlanes. Keep the Implementer prompt inputs/stop contract concise and link
  provisioning mechanics to their SSOT.
- [ ] Place independent review and fail-closed `assert-phase-chain` before the auto-merge
  request in both the skill and phase reference.
- [ ] Define the Orchestrator exception loop through confirmed `MERGED`: route later red checks,
  `DIRTY`, `CONFLICTING` and replacement runs to the same Implementer; after every new push,
  repeat review and all invalidated phase/CI gates.
- [ ] Keep the fresh Finalizer waiting concurrently and require it to call only the idempotent
  finalize script after merge confirmation. It must not close on timeout, open/closed PR state,
  late CI failure or conflict.
- [ ] Remove repeated Freshness, auto-merge, finalizer and incident prose from Execute while
  retaining the literal anchors required by existing safety guards and reference links.
- [ ] Reframe E2E as a specialized test-only Chore: preserve live discovery, Mentolder-only
  constraints, Playwright working directory, tags, inventory, local SDLC/LLM projects and
  optional headed/vision verification; replace the prescribed `feature/*` branch and ambiguous
  direct-main exit with ticketed `chore/*`, PR, merge and cleanup via the common lifecycle.
