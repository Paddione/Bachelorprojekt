#!/usr/bin/env bats

load "../../unit/lib/bats-support/load"
load "../../unit/lib/bats-assert/load"

setup() {
  export REPO_ROOT="${BATS_TEST_DIRNAME}/../../.."
}

@test "Taskfile: test:changed handles unreachable localhost:4321 gracefully for RUN_E2E_WEBSITE" {
  grep -A 8 'RUN_E2E_WEBSITE' "${REPO_ROOT}/Taskfile.yml" | grep -q 'exec 3<>/dev/tcp/127.0.0.1/4321'
}

@test "s2-cycles.mjs: resolves madge binary robustly" {
  node -e '
    import { existsSync } from "node:fs";
    import { runS2 } from "./scripts/code-quality/gates/s2-cycles.mjs";
    import { loadGates } from "./scripts/code-quality/load.mjs";
    const gates = loadGates("docs/code-quality");
    const res = runS2(process.cwd(), gates);
    if (!res || !res.gate || res.gate !== "S2") process.exit(1);
  '
}

@test "website cockpit unit tests pass without cluster DB" {
  cd "${REPO_ROOT}/website"
  node node_modules/vitest/vitest.mjs run src/lib/sdlc/tickets/__tests__/cockpit-api.test.ts
}
