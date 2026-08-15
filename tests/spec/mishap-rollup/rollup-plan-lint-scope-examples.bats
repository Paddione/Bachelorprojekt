#!/usr/bin/env bats
# tests/spec/mishap-rollup/rollup-plan-lint-scope-examples.bats — T007000
#
# Pruefmodus: OUTPUT-VERIFIKATION [T002448-M4]. Regressionsschutz fuer den
# Generator-Fix: plan-lint P2 scannt die gesamte tasks.md auf Commit-Scope-
# Vorschreibungen type(scope): — Batch-Kommentare duerfen solche Muster als
# BEISPIELE enthalten (der 10er-Batch vom 2026-08-15 enthielt feat(llm):/
# test(llm): aus dem plan-quality-gates-Mishap und brachte den Driver mit
# plan-lint FAIL zum Stehen).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/factory/mishap-rollup.sh"
  LINT="$REPO_ROOT/scripts/plan-lint.sh"
}

# Minimal gueltiger Plan (F1/F2/STRUCT1-3 erfuellt, kein Partial-Modus) mit
# der Batch-Sektion als Variable — gespiegelt am Generator-Template, damit
# der Test nur an der P2-Frage scheitern kann.
_plan() {
  local batch="$1"
  cat <<EOF
---
title: "test — Implementation Plan"
ticket_id: T999999
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# test — Implementation Plan

## File Structure

\`\`\`
tests/spec/software-factory/example.bats
\`\`\`

## Mishap-Batches

$batch

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

\`\`\`bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
\`\`\`

- [ ] **Fix-Step (GREEN).**

- [ ] **Final Verification.**

\`\`\`bash
task test:changed; task freshness:regenerate; task freshness:check
\`\`\`
EOF
}

@test "T007000: Generator praefixiert Batch-Zeilen mit '> ' (sed-Transform vorhanden)" {
  run grep -nF "sed 's/^[[:space:]]*/&> /'" "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "T007000: plan-lint P2 exemptet blockquote-Zeilen ('> feat(llm):'-Beispiel passiert)" {
  local dir="$BATS_TEST_TMPDIR/quoted"; mkdir -p "$dir"
  _plan "> Beispiel aus einem Batch: der Subagent schrieb feat(llm): statt ops — test(llm): analog" > "$dir/tasks.md"
  run bash "$LINT" "$dir/tasks.md"
  [ "$status" -eq 0 ]
}

@test "T007000: Kontrolle — rohe Scope-Vorschreibung in tasks.md failt weiterhin hart" {
  local dir="$BATS_TEST_TMPDIR/raw"; mkdir -p "$dir"
  _plan "Commit-Scope: feat(llm): Beispiel ohne Blockquote" > "$dir/tasks.md"
  run bash "$LINT" "$dir/tasks.md"
  [ "$status" -eq 1 ]
  grep -qF "P2" <<<"$output"
}
