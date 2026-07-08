#!/usr/bin/env bats
# task-oracle-fastpath.bats — Structured fast-path in task-oracle.sh

bats_require_minimum_version 1.5.0
load test_helper

ORACLE="${PROJECT_DIR}/scripts/task-oracle.sh"

setup() {
  FAKE_BIN="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$FAKE_BIN"

  # Fake task: handles --list-all, --summary, and execution
  cat > "${FAKE_BIN}/task" <<'TASK'
#!/usr/bin/env bash
if [[ "$1" == "--list-all" ]]; then
  printf '* workspace:deploy:  Deploy workspace services\n'
  printf '* workspace:verify:  Verify workspace\n'
  printf '* website:redeploy:  Rebuild and deploy website\n'
  printf '* feature:website:  Rebuild website on BOTH prod\n'
  printf '* feature:website:all-prods:  All-prods website deploy\n'
  printf '* fleet:deploy:brand:  Deploy ONE brand to fleet (requires BRAND)\n'
  exit 0
fi
if [[ "$1" == "--summary" ]]; then
  printf '\n\nDeploy workspace services (ENV=mentolder|korczewski)\n'
  exit 0
fi
echo "TASK_CALLED: $*"
exit 0
TASK
  chmod +x "${FAKE_BIN}/task"

  # Suppress OpenClaw: fake curl always reports the healthz endpoint as down
  cat > "${FAKE_BIN}/curl" <<'CURL'
#!/usr/bin/env bash
exit 7
CURL
  chmod +x "${FAKE_BIN}/curl"

  export PATH="${FAKE_BIN}:${PATH}"

  # Suppress Hermes — /dev/null is not executable so the -x check fails immediately
  export HERMES=/dev/null
}

@test "structured input with ENV runs task directly" {
  run bash "$ORACLE" "workspace:deploy ENV=mentolder"
  [ "$status" -eq 0 ]
  [[ "$output" == *"TASK_CALLED: workspace:deploy ENV=mentolder"* ]]
}

@test "stderr carries [fast-path] tag for structured input" {
  run --separate-stderr bash "$ORACLE" "workspace:deploy ENV=mentolder"
  [ "$status" -eq 0 ]
  [[ "$stderr" == *"[fast-path]"* ]]
}

@test "structured input without ENV runs task with no ENV override" {
  run bash "$ORACLE" "workspace:deploy"
  [ "$status" -eq 0 ]
  [[ "$output" == *"TASK_CALLED: workspace:deploy"* ]]
  [[ "$output" != *"TASK_CALLED: workspace:deploy ENV="* ]]
}

@test "ENV=both uses all-prods sibling when it exists" {
  run bash "$ORACLE" "feature:website ENV=both"
  [ "$status" -eq 0 ]
  [[ "$output" == *"TASK_CALLED: feature:website:all-prods"* ]]
}

@test "ENV=both without all-prods sibling runs sequentially on both clusters" {
  run bash "$ORACLE" "workspace:deploy ENV=both"
  [ "$status" -eq 0 ]
  [[ "$output" == *"TASK_CALLED: workspace:deploy ENV=mentolder"* ]]
  [[ "$output" == *"TASK_CALLED: workspace:deploy ENV=korczewski"* ]]
}

@test "unknown task name exits 1 with descriptive error" {
  run --separate-stderr bash "$ORACLE" "workspace:dploy"
  [ "$status" -eq 1 ]
  [[ "$stderr" == *"Unknown task"* ]]
  [[ "$stderr" == *"workspace:dploy"* ]]
}

# T001583 code-review finding: fastpath's "ENV=<token>" DSL is just a token
# carrier — it must be materialized against the REAL Taskfile.yml's
# requires:/vars: block for the target task, not echoed back verbatim.
# fleet:deploy:brand requires BRAND, not ENV, in the actual Taskfile.yml.
@test "structured input for a BRAND-only task materializes BRAND=, not ENV=" {
  run bash "$ORACLE" "fleet:deploy:brand ENV=mentolder"
  [ "$status" -eq 0 ]
  [[ "$output" == *"TASK_CALLED: fleet:deploy:brand BRAND=fleet-mentolder"* ]]
}

@test "natural language input does not trigger fast-path" {
  run --separate-stderr bash "$ORACLE" "deploy the website to mentolder"
  [ "$status" -eq 1 ]
  [[ "$stderr" == *"Neither Hermes nor OpenClaw"* ]]
}

@test "input with only a namespace (no colon-action) does not trigger fast-path" {
  run --separate-stderr bash "$ORACLE" "workspace"
  [ "$status" -eq 1 ]
  [[ "$stderr" == *"Neither Hermes nor OpenClaw"* ]]
}
