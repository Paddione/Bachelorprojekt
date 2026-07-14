---
title: "factory-sandbox-runner — Implementation Plan"
ticket_id: T001813
domains: [factory, infra, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-sandbox-runner — Implementation Plan

## File Structure

```
scripts/factory/sandbox-run.sh        (NEW  · bash · S1 limit 500 · budget 418 — target ≤ 320 lines)
scripts/factory/sandbox.Dockerfile    (NEW  · Dockerfile · not S1-gated — reference from sandbox-run.sh for S4)
scripts/factory/build-loop.cjs        (EDIT · .cjs · ist 88 · limit 200 · budget 112 — stay < 200)
scripts/factory/pipeline.js           (EDIT · .js · s1.ignore sanctioned (T000460) · budget 0 — LINE-NEUTRAL redirect only)
scripts/factory/wakeup.sh             (EDIT · .sh · ist 187 · limit 500 · budget 313)
tests/spec/software-factory.bats      (EDIT · BATS · not S1-gated — extend existing suite, no new ticket-numbered file)
openspec/changes/factory-sandbox-runner/specs/software-factory.md  (delta — already authored, verify with openspec validate)
```

S1 notes per file (source: `intel.json` impact_files, verified `main@e06124632`):

- `scripts/factory/sandbox-run.sh` — new bash file, extension limit 500, budget 418. Keep it a focused runner (mode-resolve + docker path + k8s path + off path). If it approaches ~400 lines, extract the k8s-Job manifest heredoc into a sibling `scripts/factory/sandbox-job.yaml` referenced from the script (also satisfies S4).
- `scripts/factory/build-loop.cjs` — ist 88, limit 200, budget 112. The new `wrapSandbox` helper plus its wiring must stay net under 200 lines.
- `scripts/factory/pipeline.js` — listed on `docs/code-quality/gates.yaml` `s1.ignore` (sanctioned T000460 monolith; module-split forbidden by the workflow harness). Budget 0 means **no net new lines**: the Implement-phase change is a pure in-place string edit that redirects an already-present `cd … && task …` command through the runner — no added logic, no new blocks.
- `scripts/factory/wakeup.sh` — ist 187, limit 500, budget 313. The per-tick sandbox preflight + telemetry export fits well within budget.
- `tests/spec/software-factory.bats` / delta spec / Dockerfile — not S1-gated.

S2 (no import cycles): `build-loop.cjs` stays a pure module — `wrapSandbox` is a string helper with no DB/API imports (contract already stated in its header comment).
S3 (no hardcoded hostnames): `sandbox-run.sh` resolves the prod domain from `PROD_DOMAIN` / `k3d/configmap-domains.yaml`; no `*.mentolder.de` / `*.korczewski.de` literals in any snippet.
S4 (no orphans): `sandbox-run.sh` is reached from `pipeline.js` + `build-loop.cjs`; `sandbox.Dockerfile` (and any extracted `sandbox-job.yaml`) is referenced by `sandbox-run.sh`.

## Task 1: Runner skeleton + docker/k8s/off mode selection (RED → GREEN)

Create `scripts/factory/sandbox-run.sh` and the sandbox image, and add the mode-selection fallback chain. Start with the failing BATS test.

- [ ] **Failing-Test-Step (RED).** Add three `@test` entries to `tests/spec/software-factory.bats` (extend the existing suite; do NOT create a ticket-numbered file). First the mode-selection test:

```bash
@test "FA-SF-SANDBOX: sandbox-run resolves docker→k8s→off and honors FACTORY_SANDBOX override" {
  run bash -c "FACTORY_SANDBOX=off bash scripts/factory/sandbox-run.sh /tmp/nonexistent-wt 'echo hi' 2>&1"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'hi'
}
# Run it now against the current branch:
tests/unit/lib/bats-core/bin/bats --filter 'FA-SF-SANDBOX: sandbox-run resolves' tests/spec/software-factory.bats
# expected: FAIL (red — scripts/factory/sandbox-run.sh does not exist yet)
```

- [ ] **Fix-Step (GREEN).** Create `scripts/factory/sandbox-run.sh` with `set -euo pipefail`, usage `sandbox-run.sh <worktree> <command...>`, and a `resolve_mode()` implementing the chain. The literal tokens below must match the RED/other tests and the delta spec:

```bash
#!/usr/bin/env bash
# scripts/factory/sandbox-run.sh — run a factory command inside an isolated sandbox.
set -euo pipefail
REPO="${FACTORY_REPO:-/home/patrick/Bachelorprojekt}"
WORKTREE="${1:?usage: sandbox-run.sh <worktree> <command...>}"; shift
CMD="$*"
SANDBOX_IMAGE="${FACTORY_SANDBOX_IMAGE:-factory-sandbox:local}"

resolve_mode() {
  case "${FACTORY_SANDBOX:-auto}" in
    docker|k8s|off) echo "${FACTORY_SANDBOX}"; return 0 ;;
  esac
  if docker info >/dev/null 2>&1; then echo docker; return 0; fi
  if kubectl --context "${FACTORY_SANDBOX_CTX:-k3d-mentolder-dev}" version >/dev/null 2>&1; then echo k8s; return 0; fi
  echo off
}
MODE="$(resolve_mode)"
```

- [ ] Create `scripts/factory/sandbox.Dockerfile` — base `node:22-bookworm`, install `go-task` and the Playwright system dependencies, set `WORKDIR /work`. `sandbox-run.sh` builds/uses it via `SANDBOX_IMAGE` (this reference keeps the Dockerfile off the S4 orphan list).

- [ ] Re-run the RED test — it must now pass (GREEN):

```bash
tests/unit/lib/bats-core/bin/bats --filter 'FA-SF-SANDBOX: sandbox-run resolves' tests/spec/software-factory.bats
```

## Task 2: Docker/k8s execution paths with mount exclusion + egress allowlist

Implement the two sandbox backends and the security invariants (no main-checkout / no `environments/.secrets/` mount; default-deny egress with an allowlist).

- [ ] **Failing-Test-Step (RED).** Add the mount-exclusion `@test`:

```bash
@test "FA-SF-SANDBOX: docker path bind-mounts only the worktree and never secrets or main checkout" {
  # The docker invocation mounts the worktree at /work and adds no secrets/main-checkout volume.
  run grep -nE -- '-v[[:space:]]+"?\$\{?WORKTREE' scripts/factory/sandbox-run.sh
  [ "$status" -eq 0 ]
  # No bind-mount of the decrypted secrets dir anywhere in the runner.
  run grep -nE -- '-v[^\n]*environments/\.secrets' scripts/factory/sandbox-run.sh
  [ "$status" -ne 0 ]
  # Refuses to sandbox the main checkout.
  run bash -c "FACTORY_SANDBOX=docker bash scripts/factory/sandbox-run.sh /home/patrick/Bachelorprojekt 'true'; echo EXIT=\$?"
  echo "$output" | grep -q 'EXIT=3'
}
tests/unit/lib/bats-core/bin/bats --filter 'docker path bind-mounts only' tests/spec/software-factory.bats
# expected: FAIL (red — docker path not implemented yet)
```

- [ ] **Fix-Step (GREEN).** Add the docker path, the main-checkout guard, and the egress allowlist to `sandbox-run.sh`. Snippets whose tokens the test asserts:

```bash
# Never sandbox the main checkout (would defeat worktree isolation).
case "${WORKTREE%/}" in
  "${REPO%/}") echo "sandbox-run: refusing to sandbox the main checkout" >&2; exit 3 ;;
esac

# Egress allowlist — default-deny + explicit hosts. Prod domain from env/configmap (S3: no brand literals).
egress_allowlist() {
  local prod_domain="${PROD_DOMAIN:-}"
  [[ -n "$prod_domain" ]] || prod_domain="$(awk -F'"' '/^[[:space:]]*PROD_DOMAIN:/ {print $2; exit}' "${REPO}/k3d/configmap-domains.yaml")"
  printf '%s\n' api.anthropic.com registry.npmjs.org github.com codeload.github.com "${prod_domain}" "staging.${prod_domain}"
}

run_docker() {
  docker run --rm \
    --network "${FACTORY_SANDBOX_NET:-factory-sandbox-egress}" \
    -v "${WORKTREE}:/work" \
    -w /work \
    "${SANDBOX_IMAGE}" \
    bash -lc "${CMD}"
}
```

Egress is realized default-deny by attaching the container to a purpose-built docker network (`FACTORY_SANDBOX_NET`) whose allowlist is programmed from `egress_allowlist` (docker network + firewall rules / proxy env); the main checkout and `environments/.secrets/` are never passed as `-v` mounts.

- [ ] Add `run_k8s()` producing an equivalent Job (worktree as a `hostPath`/volume, same image, same command, same mount exclusions). If the heredoc pushes the file past ~400 lines, extract it to `scripts/factory/sandbox-job.yaml` (templated, referenced from the script) so `sandbox-run.sh` stays under its S1 budget and the manifest stays off the S4 orphan list.

- [ ] Wire mode dispatch at the end of the runner:

```bash
case "$MODE" in
  docker) run_docker ;;
  k8s)    run_k8s ;;
  off)    run_off ;;
esac
```

- [ ] Re-run the mount-exclusion test — must pass (GREEN).

## Task 3: Off escape-hatch with warning telemetry

Implement `run_off` — today's unsandboxed behavior plus a stderr warning and warn telemetry via the existing fire-and-forget `otel-emit.sh` path.

- [ ] **Failing-Test-Step (RED).** Add the off-warning `@test`:

```bash
@test "FA-SF-SANDBOX: off mode warns on stderr and runs the command on the host" {
  run bash -c "FACTORY_SANDBOX=off bash scripts/factory/sandbox-run.sh /tmp 'echo RAN' 2>&1"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'RAN'
  echo "$output" | grep -qi 'UNSANDBOXED'
}
tests/unit/lib/bats-core/bin/bats --filter 'off mode warns on stderr' tests/spec/software-factory.bats
# expected: FAIL (red — run_off not implemented yet)
```

- [ ] **Fix-Step (GREEN).** Add `run_off` to `sandbox-run.sh`:

```bash
run_off() {
  echo "sandbox-run: FACTORY_SANDBOX=off — running UNSANDBOXED on host" >&2
  bash "${REPO}/scripts/factory/otel-emit.sh" metric factory.sandbox.off 1 mode=off || true
  exec bash -c "cd '${WORKTREE}' && ${CMD}"
}
```

The `otel-emit.sh metric` call is the same fire-and-forget telemetry surface used for phase events (`pipeline.js:73` → `otel-emit`), so the off warning is recorded without touching the s1.ignore `pipeline.js`.

- [ ] Re-run the off-warning test — must pass (GREEN).

## Task 4: Integrate the runner into `build-loop.cjs runTaskVerifyLoop`

Route the verify-loop's `task …` command through the runner. Keep `build-loop.cjs` a pure module (S2) and under 200 lines (budget 119).

- [ ] **Failing-Test-Step (RED).** Add a node-level `@test` asserting the loop's fix prompt calls the runner:

```bash
@test "FA-SF-SANDBOX: build-loop wraps the verify task command through sandbox-run.sh" {
  run node -e "const m=require('./scripts/factory/build-loop.cjs'); process.stdout.write(typeof m.wrapSandbox)"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'function'
  run node -e "const m=require('./scripts/factory/build-loop.cjs'); process.stdout.write(m.wrapSandbox('/tmp/wt','task test:all'))"
  echo "$output" | grep -q 'scripts/factory/sandbox-run.sh'
}
tests/unit/lib/bats-core/bin/bats --filter 'build-loop wraps the verify task' tests/spec/software-factory.bats
# expected: FAIL (red — wrapSandbox does not exist yet)
```

- [ ] **Fix-Step (GREEN).** Add a pure `wrapSandbox` helper and use it in `runTaskVerifyLoop`'s fix prompt:

```javascript
function wrapSandbox(workWt, command) {
  const repo = process.env.FACTORY_REPO || '/home/patrick/Bachelorprojekt'
  return `bash ${repo}/scripts/factory/sandbox-run.sh ${workWt} ${JSON.stringify(command)}`
}
```

In `runTaskVerifyLoop`, replace the inline `cd ${WORK_WT} && task workspace:validate && task test:all && task freshness:regenerate && git add -A && git commit …` with:

```javascript
const verifyCmd = 'task workspace:validate && task test:all && task freshness:regenerate'
// …prompt uses: `${wrapSandbox(WORK_WT, verifyCmd)} && cd ${WORK_WT} && git add -A && git commit …`
```

Export `wrapSandbox` in `module.exports` (append to the existing list). `node --check scripts/factory/build-loop.cjs` must stay clean; no new imports (S2).

- [ ] Re-run the build-loop test — must pass (GREEN). Confirm `wc -l scripts/factory/build-loop.cjs` < 200.

## Task 5: Line-neutral redirect in `pipeline.js` Implement phase + `wakeup.sh` preflight telemetry

- [ ] **`pipeline.js` (budget 0, line-neutral).** In the Implement-phase agent prompt (`scripts/factory/pipeline.js:418`), replace the existing single line

  `After implementing: cd ${WORK_WT} && task workspace:validate && task test:all && task freshness:regenerate`

  with a same-count line routing the same command through the runner, e.g.:

  `After implementing: bash ${REPO}/scripts/factory/sandbox-run.sh ${WORK_WT} 'task workspace:validate && task test:all && task freshness:regenerate'`

  This is a pure in-place string swap — no added lines, no new blocks (respects the `s1.ignore` sanction; `docs/code-quality/gates.yaml` keeps `pipeline.js` on the ignore list, so this file's growth is not CI-hard, but the plan holds it net-zero regardless).

- [ ] **`wakeup.sh` (budget 327).** Add a once-per-tick sandbox preflight before the dispatcher `PROMPT` is built (near the existing `otel-emit.sh metric factory.tick.count` call at `scripts/factory/wakeup.sh:117`): resolve and export the default backend and emit a mode metric:

```bash
# Sandbox preflight: resolve the default backend once and record it for this tick.
if [[ "${FACTORY_SANDBOX:-auto}" == "auto" ]]; then
  if docker info >/dev/null 2>&1; then export FACTORY_SANDBOX=docker
  elif kubectl --context "${FACTORY_SANDBOX_CTX:-k3d-mentolder-dev}" version >/dev/null 2>&1; then export FACTORY_SANDBOX=k8s
  else export FACTORY_SANDBOX=off; echo "wakeup.sh: no sandbox backend available — Implement runs UNSANDBOXED" >&2; fi
fi
bash "${REPO}/scripts/factory/otel-emit.sh" metric factory.sandbox.mode 1 "mode=${FACTORY_SANDBOX}" || true
```

- [ ] **Failing-Test-Step (RED).** Add a grep `@test` asserting the preflight is wired:

```bash
@test "FA-SF-SANDBOX: wakeup.sh performs a sandbox preflight and exports FACTORY_SANDBOX" {
  run grep -nE 'export FACTORY_SANDBOX=(docker|k8s|off)' scripts/factory/wakeup.sh
  [ "$status" -eq 0 ]
  run grep -nq 'factory.sandbox.mode' scripts/factory/wakeup.sh
  [ "$status" -eq 0 ]
}
tests/unit/lib/bats-core/bin/bats --filter 'wakeup.sh performs a sandbox preflight' tests/spec/software-factory.bats
# expected: FAIL (red — preflight not added yet)
```

- [ ] **Fix-Step (GREEN).** Apply the `wakeup.sh` and `pipeline.js` edits above; re-run the preflight test — must pass. Verify `bash -n scripts/factory/wakeup.sh` and `node --check scripts/factory/pipeline.js` are clean.

## Task 6: OpenSpec delta, test inventory, and final verification

- [ ] **OpenSpec delta.** The delta at `openspec/changes/factory-sandbox-runner/specs/software-factory.md` adds the `Sandboxed Command Execution for the Implement Phase` requirement (H2 `## ADDED Requirements`, H3 `### Requirement:`, H4 `#### Scenario:` — Requirements/Scenarios in English per `openspec/config.yaml`). Validate it:

```bash
bash scripts/openspec.sh validate
```

- [ ] **Test inventory.** Because `tests/spec/software-factory.bats` gained `@test` entries, regenerate and commit the inventory:

```bash
task test:inventory
git add website/src/data/test-inventory.json tests/spec/software-factory.bats
```

- [ ] **Final Verification.** Run the three mandatory CI gates and confirm they pass:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **plan-lint self-check.** Confirm this plan passes its own gate before finishing:

```bash
bash scripts/plan-lint.sh openspec/changes/factory-sandbox-runner/tasks.md
```
