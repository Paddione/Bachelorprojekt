#!/usr/bin/env bats
# tests/spec/agent-skills/review-gate-before-auto-merge.bats
#
# Review ist optional seit dem Nutzerentscheid 2026-09-27: grüne Required
# Checks plus bestandener fail-closed Phase-Chain-Assert sind das
# Merge-Kriterium; ein Code-Review läuft nur auf ausdrücklichen Zuruf des
# Operators. Aktives Auto-Merge wird nicht deaktiviert und ist kein
# Abbruchgrund (T900655 / PR #6062).
#
# PRÜFMODUS: Source-Grep — dokumentierte Ausnahme von der Output-Verifikation
# (T002448-M4): Querschnittstest auf Skill-/Doku-Content; das Ergebnis
# manifestiert sich ausschließlich im Quelltext der SKILL.md, es gibt keinen
# Laufzeit-Output, der das Verhalten messbar machte.
#
# Historische Regression T005307/T005565: Das Review-Gate (Schritt 3.8,
# requesting-code-review) wurde übersprungen; PR #4444 wurde bei grüner CI
# ohne separaten Review gemergt. Die Härtung (Richtung B, Orchestrator-Gate)
# bleibt über die zwei Schritt-2-Mandate greifend: (1) `gh pr merge --auto`
# ist aus dem Implementer-Mandat (Schritt 2) entfernt — der Implementer kann
# Auto-Merge nicht mehr selbst anfordern; (2) der Orchestrator-Abschnitt
# (Merge-Gate, Schritt 3.8) ist der einzige Ort, der `gh pr merge --auto`
# ausführt, und benennt requesting-code-review sowie die
# Orchestrator-Zuständigkeit.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SKILL="$REPO_ROOT/.claude/skills/dev-flow-execute/SKILL.md"
}

# Positiv-Anker (T002356-M1): Die Negativ-Aussage in Test 2 wäre ohne diesen
# Test vakuos (leeres Mandat → "nicht enthalten" gälte trivial). Der Anker
# stellt sicher, dass der Schritt-2-Abschnitt existiert und die PR-Erstellung
# nennt — er wird rot, sobald der Abschnitt verschwindet. Anker-Wortlaut folgt
# dem Skill-Text ("Implementer bis PR-Erstellung → ENDE", T900346).
@test "T005565: Implementer-Mandat nennt weiterhin die PR-Erstellung" {
  MANDATE="$(awk '/^## Schritt 2:/{flag=1; next} /^## /&&flag{exit} flag' "$SKILL")"
  run grep -qF "PR-Erstellung" <<<"$MANDATE"
  [ "$status" -eq 0 ]
}

@test "T005565: Auto-Merge ist aus dem Implementer-Mandat entfernt" {
  MANDATE="$(awk '/^## Schritt 2:/{flag=1; next} /^## /&&flag{exit} flag' "$SKILL")"
  run grep -qF "merge --auto" <<<"$MANDATE"
  [ "$status" -ne 0 ]
}

# Merge-Gate (Schritt 3.8): der Abschnitt fordert Auto-Merge an
# (`gh pr merge --auto`), benennt requesting-code-review und die
# Orchestrator-Zuständigkeit; das Review läuft nur auf ausdrücklichen
# Zuruf (T900687).
@test "T900687: Merge-Gate (Schritt 3.8) fordert Auto-Merge an, Review nur auf Zuruf" {
  GATE_SECTION="$(awk '/^## Schritt 3\.8: Merge-Gate/{flag=1; next} /^## /&&flag{exit} flag' "$SKILL")"
  run grep -qF "gh pr merge --auto" <<<"$GATE_SECTION"
  [ "$status" -eq 0 ]
  run grep -qF "requesting-code-review" <<<"$GATE_SECTION"
  [ "$status" -eq 0 ]
  run grep -qF "Orchestrator" <<<"$GATE_SECTION"
  [ "$status" -eq 0 ]
  run grep -qF "Zuruf" <<<"$GATE_SECTION"
  [ "$status" -eq 0 ]
}

@test "T900687: Merge-Gate deaktiviert aktives Auto-Merge nicht" {
  GATE_SECTION="$(awk '/^## Schritt 3\.8: Merge-Gate/{flag=1; next} /^## /&&flag{exit} flag' "$SKILL")"
  run grep -qF -e "--disable-auto" <<<"$GATE_SECTION"
  [ "$status" -ne 0 ]
  run grep -qF "rc=1" <<<"$GATE_SECTION"
  [ "$status" -eq 0 ]
}

@test "T900687: kein Pflicht-Review-Gate mehr in SKILL.md" {
  run grep -c "PFLICHT vor Auto-Merge" "$SKILL"
  [ "$output" = "0" ]
}
