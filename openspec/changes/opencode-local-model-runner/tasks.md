---
title: "opencode-local-model-runner — Implementation Plan"
ticket_id: T001780
domains: [ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# opencode-local-model-runner — Implementation Plan

_Ticket: T001780_

## File Structure

```
tests/spec/opencode-local-model-runner.bats   (new)
.github/workflows/opencode.yml                (modified)
```

## Prerequisite — Runner Provisioning (manual, out of band)

Before this workflow change goes live, a self-hosted GitHub Actions runner must be
registered on a fleet node (gekko-hetzner-2/3/4) with the label `fleet-gpu` used below. This
is infra provisioning, not code, and requires a fresh GitHub registration token (never
committed to the repo):

```bash
# On the chosen fleet node (via kubectl exec into a debug pod or direct SSH):
# 1. Get a fresh registration token: gh api -X POST repos/Paddione/Bachelorprojekt/actions/runners/registration-token --jq .token
# 2. Download+configure the runner (see https://github.com/Paddione/Bachelorprojekt/settings/actions/runners/new)
#    ./config.sh --url https://github.com/Paddione/Bachelorprojekt --token <TOKEN> --labels fleet-gpu --unattended
# 3. Install as a systemd service so it survives reboots: sudo ./svc.sh install && sudo ./svc.sh start
```

The tasks below only touch the workflow YAML; they do not perform this provisioning step.

## Tasks

- [ ] **Task 1 — Failing-Test-Step (RED).** Add
      `tests/spec/opencode-local-model-runner.bats` asserting on the current (pre-change)
      `.github/workflows/opencode.yml`:
      - the job's `runs-on` is `ubuntu-latest` (not yet self-hosted)
      - the job's `if` condition does NOT reference `head.repo.full_name`
      - the `Run opencode` step's `env` still references `secrets.OPENCODE_API_KEY`

      Use `yq` (already a repo dependency, see other `.bats` workflow assertions) to read the
      YAML structurally rather than grepping raw text.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/opencode-local-model-runner.bats
# expected: FAIL (red — the test asserts the CURRENT ubuntu-latest/no-fork-guard state,
# which is what step 1 documents; step 2 flips the workflow so re-running here would fail
# for the opposite reason once Task 2 lands — see Task 2's note on updating assertions)
```

- [ ] **Task 2 — Fix-Step (GREEN).** Edit `.github/workflows/opencode.yml`:
      - Change `runs-on: ubuntu-latest` to `runs-on: [self-hosted, fleet-gpu]`.
      - Extend the `if:` condition (keep the existing `author_association` check) with an
        additional same-repo guard, e.g. for `issue_comment`:
        `github.event.issue.pull_request == null || github.event.issue.pull_request.head.repo.full_name == github.repository`
        and for `pull_request_review_comment`:
        `github.event.pull_request.head.repo.full_name == github.repository`
        (combine both event types' conditions with the existing `&&` auth check).
      - Change the `Run opencode` step's `with.model` from `opencode/big-pickle` to the
        local provider `llamacpp-mtp/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf` and remove the
        `OPENCODE_API_KEY` line from `env:` (no cloud auth needed for a local model).
      - Update `tests/spec/opencode-local-model-runner.bats` assertions to match the NEW
        state (self-hosted label present, fork-guard condition present, no
        `OPENCODE_API_KEY` reference, `model:` points at `llamacpp-mtp/...`).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/opencode-local-model-runner.bats
# expected: PASS (green — workflow now matches the updated assertions)
```

- [ ] **Task 3 — Final Verification.** Run the three mandatory CI gates, then commit the
      BATS test alongside the workflow change (`task test:inventory` + commit the inventory
      since a new spec test file was added):

```bash
task test:changed
task freshness:regenerate
task freshness:check
task test:inventory
```
