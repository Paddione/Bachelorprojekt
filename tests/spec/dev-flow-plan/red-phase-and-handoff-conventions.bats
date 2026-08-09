#!/usr/bin/env bats
# tests/spec/dev-flow-plan/red-phase-and-handoff-conventions.bats
# T002816 / T002820 / T002829 — drei Runbook-Konventionen in .claude/skills/dev-flow-plan/SKILL.md
#
# PRUEFMODUS: Source-Grep auf die Skill-Datei.
# Das ist die ausdrueckliche Ausnahme der Test-Resultats-Konvention [T002448-M4]: die
# geprueften Gegenstaende sind Dokumentationskonventionen eines Runbooks, deren Ergebnis
# sich ausschliesslich im Quelltext manifestiert — es gibt kein Kommando, dessen Output
# sie belegen koennte.
#
# Die Zusicherungen haengen an der Semantik (Ticket-Referenz, Schluesselbegriff,
# relative Position im Ablauf), nicht an der Formulierung: keine Zeilenanker auf Prosa,
# keine festgeschriebenen Satzbauten [T002716].

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SKILL="$REPO/.claude/skills/dev-flow-plan/SKILL.md"
}

@test "dev-flow-plan SKILL.md ist lesbar und traegt seinen Frontmatter-Namen (Positiv-Anker)" {
  [ -r "$SKILL" ]
  run grep -cF 'name: dev-flow-plan' "$SKILL"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "T002829: Prior-Art-Suche ueber openspec/specs vor der Architekturfrage ist dokumentiert" {
  run grep -F 'T002829' "$SKILL"
  [ "$status" -eq 0 ]
  # Der Kern der Ableitung: gesucht wird ueber die Requirements, nicht nur ueber den Code.
  echo "$output" | grep -qiF 'architekturfrage'
  grep -qF 'openspec/specs/' "$SKILL"
}

@test "T002829: die Prior-Art-Suche steht VOR den Pfad-Abschnitten, nicht am Dateiende" {
  local prior feature fix
  prior="$(grep -nF 'T002829' "$SKILL" | head -1 | cut -d: -f1)"
  feature="$(grep -n '^## Feature-Pfad' "$SKILL" | head -1 | cut -d: -f1)"
  fix="$(grep -n '^## Fix-Pfad' "$SKILL" | head -1 | cut -d: -f1)"
  # Positiv-Anker: beide Pfad-Ueberschriften existieren ueberhaupt.
  [ -n "$feature" ]
  [ -n "$fix" ]
  [ -n "$prior" ]
  # Recherche ist Eingang: sie liegt vor beiden Pfaden.
  [ "$prior" -lt "$feature" ]
  [ "$prior" -lt "$fix" ]
}

@test "T002820: Verfuegbarkeits-Guard fuer externe Binaries gehoert in die Rotphase" {
  run grep -F 'T002820' "$SKILL"
  [ "$status" -eq 0 ]
  # Das konkrete Muster muss im Runbook stehen, nicht nur die Absicht.
  grep -qF 'command -v' "$SKILL"
  grep -qF 'skip' "$SKILL"
  # Und der Hinweis, wie man CI-Verfuegbarkeit ueberhaupt prueft.
  grep -qF '.github/workflows/' "$SKILL"
}

@test "T002820: die Rotphasen-Konvention steht im Fix-Pfad, nicht in der Uebergabe" {
  local guard fix handoff
  guard="$(grep -nF 'T002820' "$SKILL" | head -1 | cut -d: -f1)"
  fix="$(grep -n '^## Fix-Pfad' "$SKILL" | head -1 | cut -d: -f1)"
  handoff="$(grep -n '^## Uebergabe an dev-flow-execute\|^## Übergabe an dev-flow-execute' "$SKILL" | head -1 | cut -d: -f1)"
  [ -n "$fix" ]
  [ -n "$handoff" ]
  [ -n "$guard" ]
  [ "$guard" -gt "$fix" ]
  [ "$guard" -lt "$handoff" ]
}

@test "T002816: Plan-Stand oeffnet keinen fertig aussehenden PR" {
  run grep -F 'T002816' "$SKILL"
  [ "$status" -eq 0 ]
  # Der Ausweg, falls doch frueh ein PR gebraucht wird, ist benannt.
  grep -qF -e '--draft' "$SKILL"
  grep -qF '[plan-only]' "$SKILL"
}

@test "T002816: die PR-Konvention steht in der Uebergabe, also am Ausgang" {
  local guard handoff
  guard="$(grep -nF 'T002816' "$SKILL" | head -1 | cut -d: -f1)"
  handoff="$(grep -n '^## Uebergabe an dev-flow-execute\|^## Übergabe an dev-flow-execute' "$SKILL" | head -1 | cut -d: -f1)"
  [ -n "$handoff" ]
  [ -n "$guard" ]
  [ "$guard" -gt "$handoff" ]
}
