#!/usr/bin/env bats
# tests/spec/lavish.bats
# SSOT delta: openspec/specs/dev-flow-plan.md (Requirement: lavish reload safety)
# T001393 — Lavish-Reload-Protokoll kann In-Flight-Formulareingaben verwerfen.
#
# Reproduces the mishap from T001373 M3: an agent iterating on layout_warnings
# fixes re-runs `npx -y lavish-axi <html-file>` (which reloads the browser tab)
# while a form (`input` playbook) has an unsubmitted selection in flight. The
# reload wipes the client-only DOM state before the user's submit click lands,
# so the next `poll` still reports empty prompts even though the user believes
# they answered.
#
# This test asserts that `.claude/skills/lavish/SKILL.md` documents a concrete,
# grep-able "Reload Safety" protocol closing this gap. It MUST FAIL on the
# current `fix/t001393-lavish-reload` branch (no such section exists yet) and
# PASS once the fix lands.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SKILL="$REPO/.claude/skills/lavish/SKILL.md"
}

# Slice the "Reload Safety" section: from its header up to the next H2 (## )
# or end of file. Mirrors the _step37_block() pattern used in
# tests/spec/dev-flow-plan-ticket-sh-mishaps.bats.
_reload_safety_block() {
  awk '
    /^## .*Reload Safety/ { capture = 1; print; next }
    capture && /^## /     { exit }
    capture               { print }
  ' "$SKILL"
}

@test "lavish SKILL.md has a dedicated Reload Safety section" {
  block="$(_reload_safety_block)"
  [ -n "$block" ] || {
    echo "MISSING '## ... Reload Safety' section in $SKILL"
    return 1
  }
}

@test "lavish SKILL.md Reload Safety section forbids reloading while a poll is outstanding" {
  block="$(_reload_safety_block)"
  echo "$block" | grep -Eqi 'never.*reload.*poll|poll.*outstanding|while a `?poll`? (call )?is (still )?outstanding' || {
    echo "MISSING rule against reloading while a poll is outstanding"
    return 1
  }
}

@test "lavish SKILL.md Reload Safety section requires checking poll status before reopening/reloading" {
  block="$(_reload_safety_block)"
  echo "$block" | grep -Eqi 'poll (result|status)' || {
    echo "MISSING requirement to check poll result/status before reload"
    return 1
  }
}

@test "lavish SKILL.md Reload Safety section calls out the input playbook / form state risk" {
  block="$(_reload_safety_block)"
  echo "$block" | grep -Eqi 'input.{0,20}playbook|form state|unsubmitted' || {
    echo "MISSING reference to the input playbook / form-state risk"
    return 1
  }
}

@test "lavish SKILL.md Reload Safety section instructs warning the user before a risky reload" {
  block="$(_reload_safety_block)"
  echo "$block" | grep -Eqi 'warn the user|explicitly warn' || {
    echo "MISSING instruction to warn the user before a risky reload"
    return 1
  }
}

@test "dev-flow-gotchas references the lavish reload-safety rule" {
  gotchas="$REPO/.claude/skills/references/dev-flow-gotchas.md"
  [ -f "$gotchas" ] || skip "dev-flow-gotchas.md not found"
  grep -Eqi 'lavish.*reload|reload.*lavish' "$gotchas" || {
    echo "MISSING lavish reload-safety cross-reference in $gotchas"
    return 1
  }
}
