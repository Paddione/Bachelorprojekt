# Design: dev-flow lifecycle contract

## Context

Die vier Skills sind Orchestratoren, keine vollständigen Runbook-Sammlungen. Bestehende
Referenzen (`git-workflow`, `verification-block`, `ci-fix-loop`,
`dev-flow-*-phases`, `deploy-routing`, `session-coordination`) enthalten bereits die
ausführbaren Details. Dennoch wiederholen die Skills diese Mechanik und Incident-Historie.
Die Wiederholung erschwert Änderungen und verschleiert Übergänge zwischen Rollen.

`.agents/skills/**` und `.claude/skills/**` sind im Arbeitsbaum Hardlink-Mirrors. Jeder
Plan-Task behandelt beide Git-Pfade als ein gemeinsames Änderungsziel und verifiziert ihre
Byte-Parität.

## Lifecycle model

```text
request
  ├─ behavior change ──> dev-flow-plan ──> dev-flow-execute ──> deploy ──> dev-flow-e2e
  └─ no behavior change ─────────────────> dev-flow-chore ─────────────────────────────┘

dev-flow-execute swimlanes
  Implementer:  apply plan → test → commit/push → create PR ───────┐
  Orchestrator:                    review → phase gate → auto-merge ├─ CI fix callbacks
  Finalizer:                                      spawn → wait merge → finalize/cleanup
```

## Decisions

### D1 — One shared transition contract

A new `references/dev-flow-lifecycle.md` owns entry/exit states, role ownership, allowed
handoffs and the common worktree/PR/cleanup invariants. Individual skills link to it and do
not reproduce its command sequences. Domain-specific references remain authoritative for
their mechanics.

### D2 — Phase-chain before auto-merge

`assert-phase-chain` runs after independent review and before `gh pr merge --auto --squash`.
This closes the window in which GitHub can merge a green PR before the documented phase gate
has executed. Existing automatic checks may repeat the assertion defensively.

### D3 — Finalizer ownership remains isolated

After auto-merge is requested, a fresh Finalizer owns merge waiting and the idempotent
`devflow-post-merge-finalize.sh` call. The Orchestrator retains only the CI exception path:
red/conflicting CI is returned to the already spawned Implementer, then rechecked. The skill
must describe this as concurrent ownership, not claim that the Orchestrator has completely
ended while assigning it later sequential steps.

The exception loop remains active until GitHub reports `state=MERGED`, not merely until the
first green snapshot. Later failures include newly completed red checks, `DIRTY` or
`CONFLICTING` after `main` advances, and replacement CI runs triggered by an Implementer push.
Every corrective push re-enters the necessary review, phase-chain and CI checks before the
Orchestrator can again regard the branch as merge-ready.

### D4 — E2E is a specialized test-only Chore

Post-deploy Playwright authoring changes tests, not product behavior. `dev-flow-e2e` owns
target discovery, credentials, Playwright project selection, execution and optional headed/
vision verification. It reuses the Chore/Git lifecycle for ticket, `chore/*` branch,
worktree, PR, merge and cleanup. Direct pushes to `main` and `feature/*` as the prescribed
E2E branch are removed.

### D5 — Progressive disclosure with protected anchors

Incident narratives move to `dev-flow-gotchas.md`; executable detail remains in existing
references. Literal phrases required by current regression guards stay either in the skill or
are deliberately migrated together with their tests. The implementation records pre/post line
counts, but correctness gates take precedence over a numeric target.

## Non-goals

- Rewriting `opencode-flow-*`; AGENTS.md explicitly routes opencode through its native flow.
- Changing application, deployment or Playwright test behavior.
- Removing the independent review, Freshness, git-crypt, worktree or merge-wait guarantees.
- Combining the Implementer and Finalizer into one context.

## Risks

- Grep-based BATS guards encode exact wording and section placement. The test partial must
  inventory every reader of the four skills before edits and migrate assertions intentionally.
- E2E branch semantics currently have explicit tests for `feature/*`; these must turn red first
  and be updated to the new `chore/*` contract.
- Moving the phase gate changes operational ordering and therefore requires an OpenSpec delta,
  not a documentation-only chore.
