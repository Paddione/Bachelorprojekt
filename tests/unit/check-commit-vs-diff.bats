#!/usr/bin/env bats
# tests/unit/check-commit-vs-diff.bats
#
# Unit tests for scripts/check-commit-vs-diff.sh — the commit-msg guard that
# rejects commits whose subject uses an implementation type (fix/feat/
# refactor/perf) but whose staged diff contains only test/spec/plan files.
#
# Closes the T001434 mishap: a dev-flow-plan stage commit used
#   "fix(infra): chain loggingMiddleware in middleware.ts via sequence() [T001434]"
# as its title, but the diff only contained the RED integration test plus
# plan artifacts. The next implementer (dev-flow-execute) trusted the title
# and skipped the actual fix; the bug landed in a follow-up commit instead
# of the same PR.
#
# SSOT: this script + hook implements the policy declared in
#   openspec/specs/ci-cd.md (commit-msg-guard requirement).
# Convention: one .bats per script. BATS runs as part of `task test:unit`.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/check-commit-vs-diff.sh"
  HOOK="$REPO_ROOT/.githooks/commit-msg"
  TMP="$(mktemp -d)"
  export TMP
}

teardown() {
  [[ -n "$TMP" && -d "$TMP" ]] && rm -rf "$TMP"
}

# ── 1. Script exists and is executable ──────────────────────────────────────

@test "check-commit-vs-diff.sh exists" {
  [ -f "$SCRIPT" ]
}

@test "check-commit-vs-diff.sh is executable" {
  [ -x "$SCRIPT" ]
}

# ── 2. Subject-line classification (allow cases) ─────────────────────────────

@test "allows: fix(real-code) — production-code change" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'src/middleware.ts' > "$TMP/msg-subject"
  mkdir -p src && printf 'real code' > src/middleware.ts
  git add src/middleware.ts
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -eq 0 ]
}

@test "allows: fix(real-code+test) — production + test in same commit" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'fix(infra): chain middleware sequence\n' > "$TMP/msg-subject"
  mkdir -p src && printf 'real' > src/middleware.ts && printf 'test' > src/middleware.test.ts
  git add src/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -eq 0 ]
}

@test "allows: test(red-only) — RED-test commit uses test: prefix" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'test(red): verify locals.requestLogger is set\n' > "$TMP/msg-subject"
  mkdir -p src && printf 'test' > src/middleware.test.ts
  git add src/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -eq 0 ]
}

@test "allows: chore(plan-only) — plan-only commit uses chore(plans):" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'chore(plans): stage t001434 for execution [T001434]\n' > "$TMP/msg-subject"
  mkdir -p openspec/changes/t001434 && printf 'plan' > openspec/changes/t001434/tasks.md
  git add openspec/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -eq 0 ]
}

@test "allows: docs: readme update is not an implementation claim" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'docs: update README\n' > "$TMP/msg-subject"
  printf 'hello' > README.md
  git add README.md
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -eq 0 ]
}

@test "allows: ci: workflow bump is not an implementation claim" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'ci: bump action versions\n' > "$TMP/msg-subject"
  mkdir -p .github/workflows && printf 'on: push' > .github/workflows/ci.yml
  git add .github/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -eq 0 ]
}

@test "allows: fix(kustomize) — yaml/manifest counts as production code" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'fix(infra): tweak configmap\n' > "$TMP/msg-subject"
  mkdir -p k3d && printf 'data:' > k3d/configmap-domains.yaml
  git add k3d/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -eq 0 ]
}

@test "allows: fix(scope-less) — no-scope implementation title is still fine if real code is staged" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'fix: typo in error message\n' > "$TMP/msg-subject"
  mkdir -p src && printf 'export const E = 1;' > src/typo.ts
  git add src/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -eq 0 ]
}

@test "allows: feat!: breaking-change marker still allowed" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'feat(api)!: drop legacy /v1 endpoints\n' > "$TMP/msg-subject"
  mkdir -p src/api && printf 'export {}' > src/api/v2.ts
  git add src/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -eq 0 ]
}

# ── 3. Block cases — the T001434 pattern ────────────────────────────────────

@test "blocks: fix(red-only-test) — the T001434 pattern (T001434-mishap)" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'fix(infra): chain loggingMiddleware in middleware.ts via sequence() [T001434]\n' > "$TMP/msg-subject"
  mkdir -p src && printf 'test' > src/middleware.test.ts
  git add src/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -ne 0 ]
  [[ "$output" == *"T001434 mishap pattern"* ]]
  [[ "$output" == *"test(red):"* ]]
  [[ "$output" == *"chore(plan):"* ]]
}

@test "blocks: fix(plan-only)" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'fix(infra): chain middleware\n' > "$TMP/msg-subject"
  mkdir -p openspec/changes/x && printf 'plan' > openspec/changes/x/tasks.md
  git add openspec/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -ne 0 ]
}

@test "blocks: fix(plan-and-test combined)" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'fix(infra): chain middleware\n' > "$TMP/msg-subject"
  mkdir -p src && printf 'test' > src/middleware.test.ts
  mkdir -p openspec/changes/x && printf 'plan' > openspec/changes/x/tasks.md
  git add src/ openspec/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -ne 0 ]
}

@test "blocks: fix(spec-only — openspec/specs)" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'fix(infra): chain middleware\n' > "$TMP/msg-subject"
  mkdir -p openspec/specs && printf 'spec' > openspec/specs/centralized-logging.md
  git add openspec/specs/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -ne 0 ]
}

@test "blocks: feat(plan-only)" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'feat(infra): add logging chain\n' > "$TMP/msg-subject"
  mkdir -p openspec/changes/x && printf 'p' > openspec/changes/x/tasks.md && printf 'p' > openspec/changes/x/proposal.md
  git add openspec/changes/x/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -ne 0 ]
}

@test "blocks: refactor(plan-only)" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'refactor(scripts): consolidate guards\n' > "$TMP/msg-subject"
  mkdir -p openspec/changes/cleanup && printf 'p' > openspec/changes/cleanup/tasks.md
  git add openspec/changes/cleanup/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -ne 0 ]
}

@test "blocks: perf(plan-only)" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'perf(db): index tickets table\n' > "$TMP/msg-subject"
  mkdir -p openspec/changes/perf && printf 'p' > openspec/changes/perf/tasks.md
  git add openspec/changes/perf/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -ne 0 ]
}

@test "blocks: doc-only files (superpowers specs) with implementation title" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'fix(infra): chain middleware\n' > "$TMP/msg-subject"
  mkdir -p docs/superpowers/specs && printf 'spec' > docs/superpowers/specs/2026-07-02-design.md
  git add docs/superpowers/specs/
  run bash "$SCRIPT" "$TMP/msg-subject"
  [ "$status" -ne 0 ]
}

# ── 4. Bypass semantics ──────────────────────────────────────────────────────

@test "SKIP_COMMIT_VS_DIFF=1 bypasses the check (commit-msg hook)" {
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && git config user.email t@t && git config user.name t
  printf 'fix(infra): should be allowed with SKIP_COMMIT_VS_DIFF=1\n' > "$TMP/msg-subject"
  mkdir -p src && printf 'test' > src/middleware.test.ts
  git add src/
  SKIP_COMMIT_VS_DIFF=1 run bash "$HOOK" "$TMP/msg-subject"
  [ "$status" -eq 0 ]
}

# ── 5. Self-test ─────────────────────────────────────────────────────────────

@test "--self-test passes (15+ cases)" {
  run bash "$SCRIPT" --self-test
  [ "$status" -eq 0 ]
  [[ "$output" == *"self-test passed"* ]]
}
