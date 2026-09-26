#!/usr/bin/env bats
# tests/spec/ci-cd/git-flow-poll-and-branch-order.bats
#
# Prüfmodus: Source-Grep auf Konventionen — die dokumentierte Ausnahme der
# Test-Resultats-Konvention [T002448-M4], weil die Zusicherungen in
# Skill-Referenzen und Skript-Konfiguration sitzen, nicht im Laufzeitverhalten:
#   1. Machine-Parsing-Flows pollen über `gh`, nicht über `gh-axi`
#      (gh-axi liefert TOON-Text und ignoriert `--json` still mit Exit 0 —
#      Mishap-Rollup T003533, Eintrag 2026-08-11 08:04 #6; Fix T004612).
#      T900399: der einzige geprüfte gh-Stelle-Halter war der gh-Resolver des
#      mit dem Factory-Baum entfallenen pr-babysit-ticket.sh. Die Regel selbst
#      lebt als Positiv-Anker (devflow-ci-watch.sh) im Doku-Guard am Ende weiter.
#   2. Fix-PR-Merges tragen kein `--delete-branch` — die OpenSpec-Archivierung
#      (dev-flow Schritt 7) läuft NACH dem Merge und braucht den Branch noch;
#      gelöscht wird erst in Schritt 7.5. Einzige Ausnahme: der Archiv-PR-Merge
#      (dessen Wegwerf-Branch hängt an nichts mehr) — dokumentiert in
#      plan-archive-steps.md und seit T006284/#4539 zusätzlich in
#      scripts/devflow-post-merge-finalize.sh umgesetzt.
#   3. Die gh-axi-Referenz dokumentiert die JSON/Polling-Regel (Drift-Schutz).

setup() {
  REPO="$(git rev-parse --show-toplevel)"
}

@test "Fix-PR-Merges ohne --delete-branch — einzige Ausnahme ist der Archiv-PR (T004612)" {
  # Positiv-Anker: der Archiv-PR-Merge in plan-archive-steps.md trägt sein --delete-branch weiter
  run grep -n 'gh pr merge --auto --squash --delete-branch "\$ARCHIVE_PR_URL"' \
    "$REPO/.claude/skills/references/plan-archive-steps.md"
  [ "$status" -eq 0 ]
  # Negativ-Aussage: alle übrigen pr-merge-Befehle in Skills/Skripten ohne --delete-branch.
  # Kommentare (#) und Backticks begrenzen die Zeile — Treffer nur über echte Befehlsspannen.
  # Ausnahmen: die beiden dokumentierten Archiv-PR-Merge (plan-archive-steps.md und
  # devflow-post-merge-finalize.sh, T004612/T006284).
  run bash -c "git -C '$REPO' grep -E -n 'pr merge[^#\`]*--delete-branch' -- '.claude/skills' '.opencode/skills' 'scripts' | grep -v -e 'plan-archive-steps.md' -e 'devflow-post-merge-finalize.sh'"
  [ "$status" -ne 0 ]
}

@test "gh-axi-Referenz schreibt die JSON/Polling-Regel fest (T004612)" {
  run grep -n 'maschinell weiterverarbeitet' "$REPO/.claude/skills/references/gh-axi.md"
  [ "$status" -eq 0 ]
  run grep -n 'ignoriert.*--json.*still' "$REPO/.claude/skills/references/gh-axi.md"
  [ "$status" -eq 0 ]
}
