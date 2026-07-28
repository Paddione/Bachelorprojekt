#!/usr/bin/env bats
# tests/spec/ci-cd/devflow-execute-hardening-t002365.bats
# SSOT: openspec/changes/devflow-execute-hardening-T002365/specs/devflow-execute-hardening-T002365.md
#
# Regression tests for T002365 — three consolidated dev-flow-execute mishaps:
#   1) CI-watch ownership moved from Implementer to Orchestrator (T002351-M3)
#   2) Worktree cleanup stays explicitly excluded from the Implementer prompt (T002352-M1)
#   3) preflight-pr-scope.sh always called with its mandatory PR-title argument (T002353-M1)

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SKILL="${REPO_ROOT}/.claude/skills/dev-flow-execute/SKILL.md"
}

# ── Mishap 1: CI-watch is Orchestrator-owned, not Implementer-owned ────────

@test "T002365-M1: SKILL.md documents the Implementer/Orchestrator split" {
  # Positiv-Anker: the Arbeitsteilung note itself must exist.
  run grep -c 'Arbeitsteilung (T002365' "$SKILL"
  [ "$output" -ge 1 ]
  # Negativ: the Implementer-facing Auftrag no longer tells it to invoke the CI loop itself
  # (the split table's mention of the script name, assigned to the Orchestrator, is fine —
  # only an actual invocation command in the Implementer section would be wrong).
  IMPL_SECTION=$(awk '/^## Schritt 2:/{flag=1; next} /^## Schritt 5:/{flag=0} flag' "$SKILL")
  echo "$IMPL_SECTION" | grep -c 'bash scripts/devflow-ci-watch.sh' | grep -qx '0'
}

@test "T002365-M1: Schritt 5.5 is explicitly marked as Orchestrator responsibility" {
  run grep -c '^## Schritt 5.5: CI/CD-Fix-Schleife (Orchestrator-Zuständigkeit' "$SKILL"
  [ "$output" -ge 1 ]
}

@test "T002365-M1: conflict handoff uses SendMessage to the existing Implementer, not a new spawn" {
  # Positiv-Anker: the exit-3/4 conflict paths are still documented at all.
  run grep -c 'Exit-Code' "$SKILL"
  [ "$output" -ge 1 ]
  run grep -c 'SendMessage' "$SKILL"
  [ "$output" -ge 2 ]
  run grep -c 'kein neuer Spawn' "$SKILL"
  [ "$output" -ge 1 ]
}

# ── Mishap 2: Worktree cleanup stays out of the Implementer's scope ────────

@test "T002365-M2: Implementer Auftrag explicitly excludes worktree removal" {
  IMPL_SECTION=$(awk '/^## Schritt 2:/{flag=1; next} /^## Schritt 5:/{flag=0} flag' "$SKILL")
  # Positiv-Anker: the Auftrag section exists and is non-empty.
  [ -n "$IMPL_SECTION" ]
  echo "$IMPL_SECTION" | grep -qi 'wird NICHT von dir entfernt'
}

@test "T002365-M2: SKILL.md never contains the literal 'git worktree remove' string" {
  # Positiv-Anker: worktree cleanup is still documented (just not in SKILL.md's own body).
  run grep -c 'Worktree' "$SKILL"
  [ "$output" -ge 1 ]
  run grep -c 'git worktree remove' "$SKILL"
  [ "$output" -eq 0 ]
}

# ── Mishap 3: preflight-pr-scope.sh always carries its PR-title argument ───

@test "T002365-M3: git-workflow-procedures.md quick-reference passes a PR title to preflight-pr-scope.sh" {
  PROC="${REPO_ROOT}/.claude/skills/references/git-workflow-procedures.md"
  # Positiv-Anker: the quick-reference row for preflight still exists.
  run grep -c 'preflight-pr-scope.sh' "$PROC"
  [ "$output" -ge 1 ]
  # Negativ: no bare (argumentless) invocation remains in a fenced/table code context.
  run grep -c 'scripts/preflight-pr-scope\.sh`[^" ]' "$PROC"
  [ "$output" -eq 0 ]
  run grep -c 'preflight-pr-scope.sh "<PR title>"' "$PROC"
  [ "$output" -ge 1 ]
}
