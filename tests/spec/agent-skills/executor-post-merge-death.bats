#!/usr/bin/env bats
# tests/spec/agent-skills/executor-post-merge-death.bats
# SSOT: openspec/specs/agent-skills.md (Delta: executor-post-merge-death, T006284)
#
# PRÜFMODUS: gemischt —
#   (1) Tests 1–3: Source-Grep — dokumentierte Ausnahme von der
#       Output-Verifikation (T002448-M4): Querschnittstest auf Skill-/Doku-Content;
#       das Verhalten (Finalizer-Delegation) manifestiert sich ausschließlich im
#       Quelltext der SKILL.md, es gibt keinen Laufzeit-Output.
#   (2) Tests 4–6: Output-Verifikation — Aufrufvertrag des Finalize-Skripts
#       (Exit-Codes, Usage, Offline-Fehlerpfad), semantisch statt darstellungs-
#       abhängig (T002716).
#
# Regression für T006284: Nach dem Merge von PR #4460 starb der dev-flow-execute-
# Executor an Kontext-Erschöpfung; Ticket-Closure, Plan-Archivierung und Cleanup
# blieben liegen, die Eskalation musste alles manuell nachholen. Der Test erzwingt
# die Härtung: (1) die Post-Merge-Finalisierung (Schritte 6.4–7.5) ist als
# Delegation an einen frischen Finalizer-Subagenten ausgewiesen, (2) die
# Abschluss-Schritte sind als idempotente Skript-Einheit
# (scripts/devflow-post-merge-finalize.sh) aufrufbar — für den Finalizer, für
# Recovery-Sessions und für den Factory-Poller.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SKILL="$REPO_ROOT/.claude/skills/dev-flow-execute/SKILL.md"
  FINALIZE="$REPO_ROOT/scripts/devflow-post-merge-finalize.sh"
}

# Positiv-Anker (T002356-M1): Die Aussagen in Tests 2–3 wären ohne diesen Test
# vakuos (fehlt der Abschnitt ganz, gälte "nicht enthalten" trivial). Der Anker
# stellt sicher, dass der Post-Merge-Abschnitt existiert und das Merge-Wait-Motiv
# (Drift Ticket=done bei PR=OPEN, T001149-M1) nennt — er wird rot, sobald der
# Abschnitt verschwindet.
@test "T006284: Post-Merge-Abschnitt (6.4-7.5) existiert und nennt das Merge-Wait-Motiv" {
  POST_MERGE="$(awk '/^## Schritte 6\.4/{flag=1; next} /^## /&&flag{exit} flag' "$SKILL")"
  [ -n "$POST_MERGE" ]
  run grep -qF "T001149" <<<"$POST_MERGE"
  [ "$status" -eq 0 ]
}

# Rot heute: der Post-Merge-Abschnitt kennt keinen Finalizer (die Schritte laufen
# im Orchestrator-Kontext); grün nach dem Fix: die Finalisierung ist als
# Delegation an einen frischen Finalizer-Subagenten ausgewiesen.
@test "T006284: Post-Merge-Abschnitt weist die Finalisierung als Finalizer-Delegation aus" {
  POST_MERGE="$(awk '/^## Schritte 6\.4/{flag=1; next} /^## /&&flag{exit} flag' "$SKILL")"
  run grep -qF "Finalizer" <<<"$POST_MERGE"
  [ "$status" -eq 0 ]
  run grep -qF "frischen" <<<"$POST_MERGE"
  [ "$status" -eq 0 ]
}

# Rot heute: die Skill referenziert das Finalize-Skript nirgends; grün nach dem
# Fix: der Finalizer-Auftrag verweist auf die idempotente Skript-Einheit.
@test "T006284: Skill referenziert scripts/devflow-post-merge-finalize.sh" {
  run grep -qF "devflow-post-merge-finalize.sh" "$SKILL"
  [ "$status" -eq 0 ]
}

# Rot heute: das Skript existiert nicht (Exit 127); grün nach dem Fix:
# --help liefert Usage und Exit 0 (Aufrufvertrag).
@test "T006284: Finalize-Skript existiert und --help endet mit Exit 0" {
  [ -f "$FINALIZE" ]
  run bash "$FINALIZE" --help
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

# Rot heute: kein Skript; grün nach dem Fix: Aufruf ohne Ticket-ID endet mit
# Exit ungleich 0 und Usage-Hinweis (Fehlersemantik, kein Wording-Anker).
@test "T006284: Finalize-Skript ohne Ticket-ID endet mit Exit ungleich 0" {
  [ -f "$FINALIZE" ]
  run bash "$FINALIZE"
  [ "$status" -ne 0 ]
}

# Rot heute: kein Skript; grün nach dem Fix: im Offline-Modus (TICKET_OFFLINE,
# keine Cluster-/DB-Zugriffe möglich) endet das Skript mit klarer Meldung und
# Exit ungleich 0 statt still falsche Zustände zu melden.
@test "T006284: Finalize-Skript hat dokumentierten Offline-Fehlerpfad" {
  [ -f "$FINALIZE" ]
  run env TICKET_OFFLINE=1 bash "$FINALIZE" T006284
  [ "$status" -ne 0 ]
  [ -n "$output" ]
}

# T006348: Skript ist unempfindlich gegenüber beliebigem cwd beim Aufruf
@test "T006348: Finalize-Skript funktioniert unbeeinflusst vom Arbeitsverzeichnis" {
  [ -f "$FINALIZE" ]
  run bash -c "cd /tmp && bash '$FINALIZE' --help"
  [ "$status" -eq 0 ]
}
