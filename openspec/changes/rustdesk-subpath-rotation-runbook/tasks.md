---
title: "rustdesk-subpath-rotation-runbook — Implementation Plan"
ticket_id: T001382
domains: [infra, deploy]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# rustdesk-subpath-rotation-runbook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the operational requirement that rotating the `rustdesk-secrets` ed25519
keypair requires a manual `kubectl rollout restart deployment/hbbs`, because the keypair is
`subPath`-mounted in `k3d/rustdesk-stack/hbbs.yaml` and `subPath` mounts do not live-update
inside an already-running pod when the backing Secret changes. Add a regression-guarding
BATS test that pins both the current `subPath` mount strategy and the presence of the runbook
text in the SSOT spec.

**Architecture:** Pure documentation + test fix — no change to
`k3d/rustdesk-stack/hbbs.yaml` or any deployed manifest. A new Requirement
(`REQ-RUSTDESK-RELAY-006`) is added to the SSOT spec `openspec/specs/rustdesk-server.md` via
this change's delta file (`openspec/changes/rustdesk-subpath-rotation-runbook/specs/rustdesk-server.md`),
to be merged into the SSOT on archive. Two new `@test` cases are added to
`tests/spec/rustdesk-server.bats`.

**Tech Stack:** OpenSpec (Markdown SSOT), BATS (`tests/spec/`), Kustomize (for the existing
`kustomize build` rendering used by the premise-guard test).

## Global Constraints

- **No manifest change**: `k3d/rustdesk-stack/hbbs.yaml` is NOT modified — mount-restructuring
  (whole-Secret + symlink via an initContainer/emptyDir) was investigated and explicitly
  rejected (see `docs/superpowers/specs/2026-07-01-rustdesk-subpath-rotation-runbook-design.md`
  for the full root-cause analysis): the `rustdesk-server:1.1.15` image has no `/bin/sh`
  (verified via `docker run --rm --entrypoint sh ... -c 'true'` → exit 127), and this
  Deployment's existing `strategy: Recreate` already means a manual rollout restart correctly
  re-reads the current Secret content into fresh `subPath` mounts on pod recreation — a
  restart is a complete fix already, just an undocumented manual step.
- No change to `resources:`, `hostNetwork`, or port config in `hbbs.yaml` — explicitly out of
  scope per the ticket.
- No live-cluster action (no actual Secret rotation or `rollout restart` execution) is part of
  this ticket's verification — the runbook documents a step for a *future* rotation.
- `S1` line-budget gates do not apply to `.md`/`.bats` files (not in the extension table in
  `docs/code-quality/gates.yaml` → `s1.limits`, no baseline entries for either changed file) —
  no S1 budget to track for this change.
- No brand-domain literal (`*.mentolder.de`/`*.korczewski.de`) in any code snippet (S3) —
  N/A here, this change touches no brand-specific config.
- Delta-Spec-Konvention (T001304): the delta file is named after the parent SSOT slug
  (`rustdesk-server.md`), not the change slug, and targets the existing
  `openspec/specs/rustdesk-server.md` SSOT.

---

## File Structure

```
tests/spec/rustdesk-server.bats                                        — MODIFY: 2 new @test
                                                                          cases (already added,
                                                                          red-confirmed in Task 1)
openspec/changes/rustdesk-subpath-rotation-runbook/specs/rustdesk-server.md
                                                                        — delta spec (ADDED
                                                                          Requirement
                                                                          REQ-RUSTDESK-RELAY-006,
                                                                          already written)
openspec/specs/rustdesk-server.md                                      — SSOT: receives the
                                                                          merged Requirement on
                                                                          archive (no direct edit
                                                                          in this PR — archive
                                                                          step owns the merge)
```

---

### Task 1: Failing Test verifizieren (bereits geschrieben)

**Files:**
- Test: `tests/spec/rustdesk-server.bats` (already extended in the worktree — this task only
  verifies it is red as expected)

**Interfaces:**
- Consumes: `k3d/rustdesk-stack` (via `kustomize build`) and `openspec/specs/rustdesk-server.md`
  (via `grep`)
- Produces: 2 new BATS assertions; test 22 ("hbbs keypair mount still uses subPath") is
  expected to already pass (current manifest state), test 23 ("Secret-Rotation-Runbook
  documents manual rollout restart for hbbs") is expected to fail until Task 2 lands

- [ ] **Step 1: Test ausführen und roten Zustand für den Runbook-Test bestätigen (RED)**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats
```
Expected: FAIL — test "rustdesk: Secret-Rotation-Runbook documents manual rollout restart for
hbbs" is `not ok` (SSOT spec doesn't yet contain `REQ-RUSTDESK-RELAY-006` /
`rollout restart deployment/hbbs`); all other tests (including the subPath premise guard)
remain `ok`.

- [ ] **Step 2: Commit des failing Tests (falls noch nicht separat committed)**

```bash
git add tests/spec/rustdesk-server.bats
git commit -m "test(rustdesk): add failing test for hbbs subPath rotation runbook [T001382]"
```

---

### Task 2: OpenSpec-Delta + Design-Doc verifizieren, Test grün machen

**Files:**
- Verify (already written): `openspec/changes/rustdesk-subpath-rotation-runbook/proposal.md`
- Verify (already written): `openspec/changes/rustdesk-subpath-rotation-runbook/specs/rustdesk-server.md`
- Verify (already written): `docs/superpowers/specs/2026-07-01-rustdesk-subpath-rotation-runbook-design.md`

**Interfaces:**
- Consumes: nothing new — the delta spec file already contains the
  `REQ-RUSTDESK-RELAY-006` Requirement text with the literal string
  `rollout restart deployment/hbbs` in its second Scenario.
- Produces: green state for Task 1's failing test, because
  `tests/spec/rustdesk-server.bats`'s runbook test greps
  `${REPO_ROOT}/openspec/specs/rustdesk-server.md` (the SSOT, not the delta) — so the SSOT
  itself must contain the text. Since OpenSpec merges delta → SSOT at archive time, this task
  ALSO directly appends the Requirement block to `openspec/specs/rustdesk-server.md` so CI is
  green pre-archive (the archive step will then find the Requirement already present and
  the merge becomes a no-op reconciliation).

- [ ] **Step 1: Append the ADDED Requirement to the live SSOT spec**

Append the exact block from
`openspec/changes/rustdesk-subpath-rotation-runbook/specs/rustdesk-server.md` (the
`REQ-RUSTDESK-RELAY-006` Requirement and its two Scenarios) to the end of
`openspec/specs/rustdesk-server.md`, before the trailing
`<!-- merged from change delta rustdesk-server.md on 2026-07-01 -->` comment or after it —
either position is acceptable since Requirements are matched by heading text, not position.

- [ ] **Step 2: Test erneut ausführen und grünen Zustand bestätigen (GREEN)**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats
```
Expected: PASS — all 25 tests `ok`, including both new T001382 tests.

- [ ] **Step 3: OpenSpec-Validierung**

```bash
bash scripts/openspec.sh validate
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add openspec/specs/rustdesk-server.md openspec/changes/rustdesk-subpath-rotation-runbook/ \
  docs/superpowers/specs/2026-07-01-rustdesk-subpath-rotation-runbook-design.md
git commit -m "docs(rustdesk): document hbbs subPath secret-rotation runbook [T001382]"
```

---

### Task 3: Finale Verifikation

**Files:**
- No further file changes — pure verification task.

**Interfaces:**
- Consumes: all changes from Task 1 and Task 2.
- Produces: green CI-equivalence run, updated freshness artifacts (if any), test inventory
  refreshed for the two new BATS cases.

- [ ] **Step 1: Test-Inventory aktualisieren (neue BATS-Fälle)**

```bash
task test:inventory
git add website/src/data/test-inventory.json
git commit -m "chore(rustdesk): regenerate test inventory for T001382 [T001382]" --allow-empty
```

- [ ] **Step 2: CI-Äquivalenz-Gate ausführen**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
Expected: PASS — all three commands green, no diffs after `freshness:regenerate`.

- [ ] **Step 3: Commit (falls `freshness:regenerate` Artefakte verändert hat)**

```bash
git add -A
git commit -m "chore(infra): regenerate freshness artifacts [T001382]" --allow-empty
```
