#!/usr/bin/env bats

# tests/spec/agent-skills/devflow-worktree-cwd-guard.bats
# SSOT: openspec/changes/devflow-worktree-cwd-guard/specs/agent-skills.md  [T006367]
#
# Pruefmodus: DOKUMENTATIONS-KONVENTION (grep-Modus) — begruendet im Dateikopf
# (T002448-M4-Ausnahme): Der Defekt aus T006367 (bare git-Aufrufe in dev-flow-
# Skills ohne git -C/cd+guard) manifestiert sich ausschliesslich im Text der
# Skill-Dateien. Ein Verhaltenstest ist hier nicht moeglich — die Konvention ist
# der Text. Der Abgleich ist formatfrei (grep -qF, keine Zeilenanker, T002716).
#
# Positiv-Anker-Pflicht (T002356-M1): Der Test prueft das VORHANDENSEIN der
# Regel-Phrase — ist die Implementierung (Regel in den Dateien) nicht da, ist
# der Test rot. Kein Negativ-Teil, der vakuos gruen werden koennte.
#
# RED-Phase: Der Test MUSS fehlschlagen, solange die betroffenen Skill-Dateien
# die kanonische Phrase "nie auf implizites cwd vertrauen" nicht tragen. Ist er
# gruen, bevor die Dateien erweitert sind, ist das ein Befund am Test, kein
# "schon erfuellt" (T003548).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

# Alle dev-flow-Skill-Dateien (Claude-Code + opencode), die bare git-Aufrufe
# enthalten und deshalb die Regel-Phrase tragen muessen (T006367).
AFFECTED_FILES=(
  ".claude/skills/dev-flow-plan/SKILL.md"
  ".claude/skills/references/dev-flow-plan-phases.md"
  ".claude/skills/dev-flow-execute/SKILL.md"
  ".claude/skills/dev-flow-chore/SKILL.md"
  ".opencode/skills/dev-flow-plan/SKILL.md"
  ".opencode/skills/dev-flow-execute/SKILL.md"
  ".opencode/skills/dev-flow-chore/SKILL.md"
)

@test "T006367: jede dev-flow-Skill-Datei traegt die Regel-Phrase 'nie auf implizites cwd vertrauen'" {
  local missing=""
  for f in "${AFFECTED_FILES[@]}"; do
    if [ ! -f "$REPO/$f" ]; then
      missing="$missing\nFEHLT-DATEI: $f"
      continue
    fi
    if ! grep -qF 'nie auf implizites cwd vertrauen' "$REPO/$f"; then
      missing="$missing\nFEHLT-PHRASE: $f"
    fi
  done
  if [ -n "$missing" ]; then
    echo "Regel-Phrase 'nie auf implizites cwd vertrauen' fehlt in:$missing"
    return 1
  fi
}

@test "T006367: jede dev-flow-Skill-Datei nennt die Pflichtform 'git -C' als Absicherung" {
  local missing=""
  for f in "${AFFECTED_FILES[@]}"; do
    if [ ! -f "$REPO/$f" ]; then
      missing="$missing\nFEHLT-DATEI: $f"
      continue
    fi
    if ! grep -qF 'git -C' "$REPO/$f"; then
      missing="$missing\nFEHLT-FORM: $f (kein 'git -C')"
    fi
  done
  if [ -n "$missing" ]; then
    echo "Pflichtform 'git -C' fehlt in:$missing"
    return 1
  fi
}
