#!/usr/bin/env bats
# tests/spec/agent-skills/devflow-review-gate.bats
# Failing Test für T005565: Der Implementer-Auftrag in
# .claude/skills/dev-flow-execute/SKILL.md muss das Review-Gate als PFLICHT
# verankern — ohne diese Zeile überspringt der Implementer das formale Review
# und erstellt direkt den Auto-Merge-PR (beobachtet bei T005307/PR #4444).
#
# Prüfmodus (T002448-M4): Dokumentationskonventions-Test — die Zusicherung
# manifestiert sich ausschließlich im Quelltext, grep ist das angemessene
# Mittel; die Suche ist auf den Auftrag-Abschnitt eingegrenzt (T003104).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SKILL_FILE="${REPO_ROOT}/.claude/skills/dev-flow-execute/SKILL.md"
}

@test "dev-flow-execute-Auftrag verankert das Review-Gate als PFLICHT (T005565)" {
  [ -f "$SKILL_FILE" ]

  # Abschnitt zwischen der '- **Auftrag:**'-Zeile und der nächsten '## '-Überschrift.
  auftrag="$(awk '/^- \*\*Auftrag:\*\*$/{f=1} f{print} /^## /{if(f) exit}' "$SKILL_FILE")"

  # Positiv-Anker (T002356-M1): der Auftrag-Abschnitt existiert überhaupt.
  echo "$auftrag" | grep -qF -- '**/goal: Finish dev-flow-execute'

  echo "$auftrag" | grep -qF -- 'requesting-code-review'
  echo "$auftrag" | grep -qF -- 'PFLICHT'
}
