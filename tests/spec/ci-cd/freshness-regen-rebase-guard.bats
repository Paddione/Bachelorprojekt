#!/usr/bin/env bats
# tests/spec/ci-cd/freshness-regen-rebase-guard.bats
# SSOT: openspec/specs/ci-cd.md (delta: openspec/changes/freshness-regen-rebase-guard/specs/ci-cd.md)
# T002669: PR #3788 (T002634) needed two expensive regen-commit-push cycles
# (~1-2min each) because `main` advanced twice mid-session (two release
# commits) while the branch's committed freshness artifacts were generated
# against an older tree. `task freshness:check` already WARNS about this
# (T002561, archived under
# openspec/changes/archive/2026-08-02-freshness-check-base-mismatch/) but
# only AFTER `freshness:regenerate` has already run, and only inside the
# Taskfile — not inside the `git-workflow` skill step an agent actually
# follows before pushing. Chosen fix (Variante a, see proposal.md): a
# second, later Pull-First checkpoint directly in front of the
# freshness:regenerate reference in git-workflow Schritt 1, so the
# regen-commit-push cycle only ever runs once per divergence.
#
# Test mode: source verification. `.claude/skills/git-workflow/SKILL.md` is
# a documentation/skill file, not directly executable application code —
# the behavior under test IS the prose/shell-snippet text of Schritt 1, so
# grepping it is the appropriate check per CLAUDE.md's documented exception
# (cross-cutting doc-convention tests) and matches the established
# precedent in tests/spec/ci-cd/freshness-check-base-mismatch.bats.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SKILL="$REPO_ROOT/.claude/skills/git-workflow/SKILL.md"
}

# Extract the "Schritt 1" section body: from the "## Schritt 1" heading up
# to (not including) the next "## Schritt" heading.
_schritt1_block() {
  awk '
    /^## Schritt 1/ { capture=1; print; next }
    capture && /^## Schritt [0-9]/ { capture=0 }
    capture { print }
  ' "$SKILL"
}

# Extract the "Schritt 0" section body (control anchor).
_schritt0_block() {
  awk '
    /^## Schritt 0/ { capture=1; print; next }
    capture && /^## Schritt [0-9]/ { capture=0 }
    capture { print }
  ' "$SKILL"
}

@test "T002669: git-workflow Schritt 0 (Pull-First) still contains git pull --rebase origin main (positive anchor, control)" {
  [ -f "$SKILL" ] || { echo "MISSING skill file: $SKILL"; return 1; }
  block="$(_schritt0_block)"
  [ -n "$block" ] || { echo "MISSING '## Schritt 0' section in $SKILL"; return 1; }

  echo "$block" | grep -qE 'git pull --rebase origin main' \
    || { echo "MISSING 'git pull --rebase origin main' in Schritt 0 — control anchor broke, something else changed this section"; return 1; }
}

@test "T002669: git-workflow Schritt 1 rebases against origin/main before referencing freshness:regenerate (RED against main)" {
  [ -f "$SKILL" ] || { echo "MISSING skill file: $SKILL"; return 1; }
  block="$(_schritt1_block)"
  [ -n "$block" ] || { echo "MISSING '## Schritt 1' section in $SKILL"; return 1; }

  # Must still reference freshness:regenerate (positive anchor: the section
  # under test actually exists and is non-trivial).
  echo "$block" | grep -qE 'freshness:regenerate' \
    || { echo "MISSING 'freshness:regenerate' reference in Schritt 1"; return 1; }

  # The divergence check must appear BEFORE the freshness:regenerate
  # reference, and must actually check origin/main divergence.
  before_regen="$(echo "$block" | awk '/freshness:regenerate/ { exit } { print }')"

  echo "$before_regen" | grep -qE 'rev-list[[:space:]]+--count[[:space:]]+HEAD\.\.origin/main' \
    || { echo "MISSING 'git rev-list --count HEAD..origin/main' divergence check BEFORE the freshness:regenerate reference in Schritt 1"; return 1; }

  echo "$before_regen" | grep -qiE 'rebas' \
    || { echo "MISSING a rebase instruction BEFORE the freshness:regenerate reference in Schritt 1"; return 1; }
}
