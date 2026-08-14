#!/usr/bin/env bats
# tests/spec/agent-skills/review-gate-before-auto-merge.bats
# SSOT: openspec/specs/agent-skills.md (Delta: review-gate-enforce, T005565)
#
# PRÜFMODUS: Source-Grep — dokumentierte Ausnahme von der Output-Verifikation
# (T002448-M4): Querschnittstest auf Skill-/Doku-Content; das Ergebnis
# manifestiert sich ausschließlich im Quelltext der SKILL.md, es gibt keinen
# Laufzeit-Output, der das Verhalten messbar machte.
#
# Regression für T005307/T005565: Das Review-Gate (Schritt 3.8,
# requesting-code-review) wurde übersprungen; PR #4444 wurde bei grüner CI
# ohne separaten Review gemergt. Der Test erzwingt die Härtung (Richtung B,
# Orchestrator-Gate): (1) `gh pr merge --auto` ist aus dem Implementer-Mandat
# (Schritt 2) entfernt — der Implementer kann Auto-Merge nicht mehr selbst
# anfordern; (2) der Abschnitt, der `gh pr merge --auto` ausführt, IST das
# Code-Review-Gate: er benennt requesting-code-review und die
# Orchestrator-Zuständigkeit.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SKILL="$REPO_ROOT/.claude/skills/dev-flow-execute/SKILL.md"
}

# Positiv-Anker (T002356-M1): Die Negativ-Aussage in Test 2 wäre ohne diesen
# Test vakuos (leeres Mandat → "nicht enthalten" gälte trivial). Der Anker
# stellt sicher, dass der Schritt-2-Abschnitt existiert und die PR-Erstellung
# nennt — er wird rot, sobald der Abschnitt verschwindet.
@test "T005565: Implementer-Mandat nennt weiterhin die PR-Erstellung" {
  MANDATE="$(awk '/^## Schritt 2:/{flag=1; next} /^## /&&flag{exit} flag' "$SKILL")"
  run grep -qF "Erstelle einen PR" <<<"$MANDATE"
  [ "$status" -eq 0 ]
}

# Rot heute (Zeile 87: "Erstelle einen PR und fordere Auto-Merge an");
# grün nach dem Fix: das Mandat endet nach der PR-Erstellung, Auto-Merge ist
# Orchestrator-Aufgabe nach dem Review-Gate.
@test "T005565: Auto-Merge ist aus dem Implementer-Mandat entfernt" {
  MANDATE="$(awk '/^## Schritt 2:/{flag=1; next} /^## /&&flag{exit} flag' "$SKILL")"
  run grep -qF "merge --auto" <<<"$MANDATE"
  [ "$status" -ne 0 ]
}

# Rot heute: kein Abschnitt trägt die Überschrift "Code-Review-Gate" (der
# Auto-Merge-Block liegt in Schritt 5, das Review-Gate getrennt in Schritt 3.8);
# grün nach dem Fix: der Code-Review-Gate-Abschnitt (Orchestrator) führt den
# Auto-Merge-Befehl aus und benennt requesting-code-review.
@test "T005565: Auto-Merge liegt im Code-Review-Gate-Abschnitt (requesting-code-review, Orchestrator)" {
  GATE_SECTION="$(awk '/^## .*Code-Review-Gate/{flag=1; next} /^## /&&flag{exit} flag' "$SKILL")"
  run grep -qF "gh pr merge --auto" <<<"$GATE_SECTION"
  [ "$status" -eq 0 ]
  run grep -qF "requesting-code-review" <<<"$GATE_SECTION"
  [ "$status" -eq 0 ]
  run grep -qF "Orchestrator" <<<"$GATE_SECTION"
  [ "$status" -eq 0 ]
}
