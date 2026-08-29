#!/usr/bin/env bats
# tests/spec/ci-cd/freshness-heal-on-pr.bats
# SSOT: openspec/specs/ci-cd.md (Delta: openspec/changes/freshness-heal-on-pr/specs/ci-cd.md)
# T-PENDING: Der Freshness-Step in ci.yml committet bei Drift die regenerierten
# Artefakte auf den PR-Branch statt zu failen (Heal-on-PR). Das Verhalten liegt
# in scripts/heal-freshness.sh — GitHub-Actions-Code, nicht direkt ausfuehrbar;
# Source-Verifikation gegen den Skript-/Workflow-Text ist die dokumentierte
# Ausnahme in CLAUDE.md (Test-Resultats-Konvention, T002448-M4).
#
# Fail-loud (D2): Race (Branch-Head bewegt) oder fehlender PAT -> exit 1.
# Kein [skip ci] (T002158): der durch den Bot-Commit ausgeloeste Re-Run ist der
# Zweck. Kein repo-index.json in der FILES-Liste (T002687).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  CI_YML="$REPO_ROOT/.github/workflows/ci.yml"
  HEAL="$REPO_ROOT/scripts/heal-freshness.sh"
}

@test "T-PENDING: ci.yml freshness step calls scripts/heal-freshness.sh" {
  [ -f "$CI_YML" ] || { echo "MISSING ci.yml: $CI_YML"; return 1; }
  grep -q 'bash scripts/heal-freshness.sh' "$CI_YML" \
    || { echo "MISSING heal-freshness.sh invocation in ci.yml freshness step"; return 1; }
}

@test "T-PENDING: heal-freshness.sh compares the branch head SHA (race guard, D2)" {
  [ -f "$HEAL" ] || { echo "MISSING heal script: $HEAL"; return 1; }
  grep -qE 'git ls-remote origin' "$HEAL" \
    || { echo "MISSING remote-head comparison in heal-freshness.sh"; return 1; }
  grep -qE 'rev-parse HEAD\^2' "$HEAL" \
    || { echo "MISSING merge-commit head extraction (HEAD^2) in heal-freshness.sh"; return 1; }
}

@test "T-PENDING: heal-freshness.sh commits with the bot title, no [skip ci] (T002158)" {
  [ -f "$HEAL" ] || { echo "MISSING heal script: $HEAL"; return 1; }
  grep -qF 'chore: auto-regenerate freshness artifacts' "$HEAL" \
    || { echo "MISSING bot commit title in heal-freshness.sh"; return 1; }
  skipci="$(grep -F '[skip ci]' "$HEAL" || true)"
  [ -z "$skipci" ] || { echo "FORBIDDEN [skip ci] in heal-freshness.sh — the re-run is the point (T002158)"; return 1; }
}

@test "T-PENDING: heal-freshness.sh FILES list excludes repo-index.json (T002687)" {
  [ -f "$HEAL" ] || { echo "MISSING heal script: $HEAL"; return 1; }
  grep -qF 'components/website/src/data/test-inventory.json' "$HEAL" \
    || { echo "MISSING test-inventory.json in FILES list — positive anchor broken"; return 1; }
  repoindex="$(grep -F 'repo-index.json' "$HEAL" || true)"
  [ -z "$repoindex" ] || { echo "FORBIDDEN repo-index.json in heal-freshness.sh FILES list (T002687)"; return 1; }
}

@test "T-PENDING: heal-freshness.sh still runs the full freshness:check gate (control)" {
  [ -f "$HEAL" ] || { echo "MISSING heal script: $HEAL"; return 1; }
  grep -qE 'task freshness:check' "$HEAL" \
    || { echo "MISSING 'task freshness:check' in heal-freshness.sh — gate over-suppressed!"; return 1; }
}
