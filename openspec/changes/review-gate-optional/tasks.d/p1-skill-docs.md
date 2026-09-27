---
partial: p1-skill-docs
role: impl
depends_on: []
---

## Task 1: Skill and reference text — review optional, merge on green CI

Context. This partial rewrites the dev-flow-execute merge step for change `review-gate-optional` (ticket T900687) according to `design.md` decisions D1 to D5. It owns exactly four Markdown files and touches no other file. Markdown is not covered by the S1 line-limit gate, so no line budget applies. `.claude/skills/dev-flow-execute` and `.claude/skills/references` are symlinks into `.opencode/skills/`, so editing the `.opencode` paths updates both mirrors. Do not edit `scripts/check-pr-automerge.sh` and do not edit `.opencode/skills/references/dev-flow-execute-phases.md` (Pre-Flight 1.4.7 stays as it is, D5).

Target files (all existing):

- `.opencode/skills/dev-flow-execute/SKILL.md` (SKILL.md, 265 lines)
- `.opencode/skills/dev-flow-execute/references/implementer-handoff.md` (implementer-handoff.md, 46 lines)
- `.opencode/skills/references/dev-flow-lifecycle.md` (dev-flow-lifecycle.md, 41 lines)
- `.opencode/skills/OVERVIEW.md` (OVERVIEW.md, 276 lines)

### Steps

1. **Rewrite Schritt 3.8 in SKILL.md.** Replace the heading `## Schritt 3.8: Code-Review-Gate (Orchestrator, PFLICHT vor Auto-Merge)` with `## Schritt 3.8: Merge-Gate, Code-Review optional (Orchestrator)`. The section body states, in this order:
   - Merge criterion: green Required Checks plus the fail-closed phase-chain assert. A code review is not a merge precondition (D1).
   - Step 1 keeps `bash scripts/check-pr-automerge.sh --branch "$BRANCH"` with the T900040 note on always passing the branch. New semantics: `rc=0` no auto-merge yet, continue; `rc=1` auto-merge is already active (for example set by the CI workflow „Enable Auto-Merge"), do not abort and never deactivate it, the merge runs on green checks; `rc=2` abort as environment error (D3).
   - Step 2 optional review: only when the operator explicitly asks for a review in the running session (D2). Then invoke `requesting-code-review` (opencode: `pr-review-toolkit:review-pr` or a review subagent via `delegate()`). Findings before the merge go via `SendMessage` to the already spawned Implementer (no new spawn, T002365/T001408). Findings arriving after the merge become a follow-up ticket (`type=bug` for defects) with a follow-up PR (D4). Without an explicit request no review subagent is started.
   - Step 3 keeps the phase-chain block `./scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"` and then the auto-merge block `(cd "$MAIN_REPO" && gh pr merge --auto --squash)` with its existing comments; add one sentence that the request is idempotent when auto-merge is already active.
   Keep the text „Orchestrator-Schritt, nicht Implementer" and the T005307 reference that a self-attestation is no review.
2. **Align cross-references in SKILL.md.** In the Schritt 2 note (Arbeitsteilung T002365) replace `Review-Gate (3.8)` with `Merge-Gate (3.8)`. In the Schritt 5 M1-lesson replace `Der Auto-Merge folgt erst im Code-Review-Gate (3.8).` with `Der Auto-Merge folgt erst im Merge-Gate (3.8).` In Schritt 3.9 and Schritt 5.5 keep the meaning and replace any remaining „Review-Gate"/„Code-Review-Gate" wording with „Merge-Gate". Verify with `grep -n "Review-Gate" .opencode/skills/dev-flow-execute/SKILL.md`, which must print nothing.
3. **Align implementer-handoff.md.** Line 45 becomes `- Erstelle einen PR (OHNE Auto-Merge-Anforderung — die folgt im Merge-Gate, Schritt 3.8).` Line 46 replaces `Review-Gate, CI-Fix-Schleife` with `Merge-Gate (Review nur auf Zuruf), CI-Fix-Schleife`. The Implementer still never requests auto-merge itself.
4. **Align dev-flow-lifecycle.md.** In section „Execute swimlane and exception loop" replace „The Orchestrator independently reviews the PR and performs the fail-closed phase-chain assertion" with wording that the Orchestrator reviews the PR only when the operator asks for it and always performs the fail-closed phase-chain assertion before requesting `gh pr merge --auto --squash`; auto-merge that is already active is left on. Replace the re-entry sentence so that every new commit re-enters `assert-phase-chain` and the invalidated CI gates, plus a review only when one was requested; end the paragraph with „this is the required phase-chain re-entry." Keep the words `MERGED`, `DIRTY`, `CONFLICTING` and „replacement" in the section.
5. **Align OVERVIEW.md.** In the table row for `dev-flow-execute` Schritt 3.8 write `requesting-code-review (optional, nur auf Zuruf)`. In „Verifikations-Leiter" item 3 becomes: requesting-code-review, optional and only on explicit operator request, not a merge precondition; item 4 (CI-Fix-Loop) stays. Adjust the closing sentence so it no longer claims stage 3 always runs.
6. **Check the result.** Run `grep -rn "PFLICHT vor Auto-Merge" .opencode/skills/` (must print nothing) and `grep -n "check-pr-automerge.sh --branch" .opencode/skills/dev-flow-execute/SKILL.md` (must print the 3.8 line).
7. **Commit with explicit pathspecs.**
```bash
git add .opencode/skills/dev-flow-execute/SKILL.md .opencode/skills/dev-flow-execute/references/implementer-handoff.md .opencode/skills/references/dev-flow-lifecycle.md .opencode/skills/OVERVIEW.md
git commit -m "feat(T900687): merge gate with optional code review in dev-flow-execute [T900687]"
```

**Acceptance criteria:**

1. SKILL.md has a section headed `## Schritt 3.8: Merge-Gate, Code-Review optional (Orchestrator)` that contains `check-pr-automerge.sh --branch`, `requesting-code-review`, `assert-phase-chain`, `gh pr merge --auto --squash` and „Orchestrator", in the order check, optional review, phase chain, merge.
2. The section states that `rc=1` neither aborts nor deactivates auto-merge, that `rc=2` aborts, and that a review runs only on explicit operator request with post-merge findings going to a follow-up ticket and PR.
3. No file in the partial contains „Review-Gate" or „PFLICHT vor Auto-Merge" any more.
4. The Schritt 2 mandate still names „PR-Erstellung" and contains no `merge --auto`.
