# p4 — Cross-skill regression guards

**Rolle:** tests · **depends_on:** p1, p2, p3 · **target_files:**
`tests/spec/agent-skills/dev-flow-lifecycle-contract.bats`, `tests/spec/dev-flow-e2e.bats`,
`tests/spec/ci-cd.bats`, `tests/spec/agent-skills/review-gate-before-auto-merge.bats`,
`tests/spec/ci-cd/devflow-execute-hardening-t002365.bats`,
`components/website/src/data/test-inventory.json`

- [ ] Add cross-skill guards that parse the shared transition table and prove every predecessor
  exit matches its successor entry, including the Chore/E2E specialization.
- [ ] Run the new and migrated guards before implementation and record the intentional red
  baseline:

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/agent-skills/dev-flow-lifecycle-contract.bats \
  tests/spec/dev-flow-e2e.bats \
  tests/spec/agent-skills/review-gate-before-auto-merge.bats
# expected: FAIL — the shared reference is absent, E2E prescribes feature/*, and the phase gate follows auto-merge
```
- [ ] Change E2E branch assertions from `feature/*` to ticketed `chore/*`; retain agent routing,
  Playwright setup, tagging, headed non-gate, vision proxy and conclusion requirements.
- [ ] Assert source order: independent review, `assert-phase-chain`, auto-merge request, then
  Finalizer spawn/wait contract. Do not rely only on phrase presence.
- [ ] Add late-state cases for red checks, `DIRTY`, `CONFLICTING`, corrective pushes and
  replacement CI runs until confirmed `MERGED`; assert re-review/phase-gate re-entry and no
  pre-merge ticket closure.
- [ ] Inventory all existing skill-reading BATS files with `rg -l`, run them together, and fix
  only assertions whose ownership intentionally moved to the shared reference.
- [ ] Run `task test:inventory` and include the generated inventory update.
