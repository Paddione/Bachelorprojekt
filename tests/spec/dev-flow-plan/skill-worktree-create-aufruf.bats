#!/usr/bin/env bats
# T013678-Mishap #5: Der dev-flow-plan-Skilltext nannte worktree-create.sh ohne
# Pflicht-Pfadargument — ein Ein-Argument-Aufruf bricht mit dem Usage-Fehler ab.
# Der Fix bringt die Zwei-Argument-Form in den Skilltext; dieser Test ist der Guard.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SKILL_MD="$REPO_ROOT/.claude/skills/dev-flow-plan/SKILL.md"
}

@test "SKILL.md nennt die Zwei-Argument-Form von worktree-create.sh" {
  # Positiv-Anker zuerst: die korrekte Aufrufform steht im Text.
  run grep -n 'worktree-create.sh <branch> <path>' "$SKILL_MD"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "SKILL.md zeigt worktree-create.sh nicht mit <branch> ohne <path>" {
  # Negativ-Aussage: keine Zeile, die das Skript mit <branch>, aber ohne
  # nachfolgendes <path> zeigt — genau die Form, die den Usage-Abbruch ausloest.
  run grep -nE 'worktree-create\.sh[^<]*<branch>[^<]*$' "$SKILL_MD"
  [ "$status" -eq 1 ]
}
