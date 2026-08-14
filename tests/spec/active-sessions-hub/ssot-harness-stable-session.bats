#!/usr/bin/env bats
# Prüfmodus: Source-Grep auf openspec/specs/active-sessions-hub.md (Dokumentationskonvention,
# T002448-M4-Ausnahme; Positiv-Anker vor Negativ-Aussage T002356-M1).
#
# Wächter gegen T005676: Der 54-Batch-Archiv-Merge (9ca6710b0, Delta von
# devflow-flow-frictions-T002671) ersetzte die 5-Szenario-Sektion
# "Harness-Stable Session Identity for agent-lock" durch 2 opencode-Szenarien — 3 Szenarien
# (CLAUDE_CODE_SESSION_ID wins, CLAUDE_SESSION_ID accepted, Release across tool calls,
# AGENT_LOCK_SID authoritative, Harness-owned not reaped) gingen verloren. Dieser Guard
# friert die vollständige Sektion ein: alle 5 wiederherzustellenden + die 2 opencode-Szenarien.

setup() {
  SPEC="$BATS_TEST_DIRNAME/../../../openspec/specs/active-sessions-hub.md"
  [ -f "$SPEC" ] || skip "openspec/specs/active-sessions-hub.md not found"
}

@test "Harness-Stable requirement exists" {
  grep -q '^### Requirement: Harness-Stable Session Identity for agent-lock$' "$SPEC"
}

@test "all 7 Harness-Stable scenarios are present" {
  for title in \
    "CLAUDE_CODE_SESSION_ID wins over Unix SID" \
    "CLAUDE_SESSION_ID remains accepted" \
    "Release succeeds across separate tool calls of the same session" \
    "Test override AGENT_LOCK_SID remains authoritative" \
    "Harness-owned lock is not reaped by a different harness session" \
    "opencode session id resolves to a stable owner_sid instead of the per-call Unix SID" \
    "opencode session is reported as tool \`opencode\`, not \`unknown\` or \`claude\`"; do
    grep -qF "#### Scenario: $title" "$SPEC" \
      || { echo "missing scenario: $title" >&2; return 1; }
  done
}

@test "Harness-Stable requirement keeps its prose anchors" {
  # Positiv-Anker zuerst: der Header muss existieren, sonst wäre die Aussage vakuos.
  grep -q '^### Requirement: Harness-Stable Session Identity for agent-lock$' "$SPEC"
  grep -qF 'AGENT_LOCK_SID' "$SPEC"
  grep -qF 'CLAUDE_CODE_SESSION_ID' "$SPEC"
  grep -qF 'OPENCODE_SESSION_ID' "$SPEC"
  grep -qF '_detect_tool' "$SPEC"
}
