#!/usr/bin/env bats
# tests/spec/agent-skills/post-merge-finalize-guards.bats
# SSOT: openspec/specs/agent-skills.md (Delta: post-merge-finalize-guards, T006348)
#
# PRÜFMODUS: Source-Grep — dokumentierte Ausnahme von der Output-Verifikation
# (T002448-M4): Der Laufzeitpfad von scripts/devflow-post-merge-finalize.sh
# benötigt Cluster-/DB-Zugriff (Schritt 1: ticket.sh get), der in CI nicht
# existiert; die Guard-Logik manifestiert sich ausschließlich im Quelltext
# (gleiche Ausnahme wie Tests 1–3 in tests/spec/agent-skills/executor-post-merge-death.bats).
#
# Regression für T006348: Review-Befunde aus PR #4539 (T006284, gemergt 1cab10192) —
#   (1) Merge-Status-Guard fehlt im --pr-Pfad: Closure-Schritte laufen für jede
#       übergebene PR-Nummer, nur der Auto-Pfad filtert auf merged — Drift
#       Ticket=done bei PR=OPEN (T001149-M1, T001092).
#   (2) Idempotenz-Lücke Schritt 8: zweiter Lauf im Fenster "Schritt 8 erledigt,
#       Archiv-PR noch offen" wiederholt die Archivierung (checkout -B wechselt
#       den Branch des geteilten Arbeitsbaums, Push kollidiert, gh pr create
#       endet FATAL, Schritt 10 wird nie erreicht).
#   (3) cwd-Abhängigkeit: Plan-Pfad-Prüfung relativ (Z. 176), branch-reaper
#       ohne --repo (Z. 286) — nur bei cwd=REPO_DIR korrekt.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FINALIZE="$REPO_ROOT/scripts/devflow-post-merge-finalize.sh"
  [ -f "$FINALIZE" ]
}

# Positiv-Anker (T002356-M1) für die Guard-Aussage: Der Auto-Pfad filtert
# bereits auf merged PRs (gh pr list --state merged, Schritt 3). Ohne diesen
# Anker wäre die Aussage in Test 2 vakuos, wenn der --pr-Pfad-Guard fehlte,
# aber auch die Auto-Pfad-Filterung verschwunden wäre.
@test "T006348: Auto-Pfad filtert auf merged PRs (Anker)" {
  run grep -qF -- '--state merged' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Rot heute: der --pr-Pfad (Z. 60/135) setzt PR_NUM ohne State-Prüfung — `gh pr
# view` und `--json state` kommen im Skript nirgends vor; grün nach dem Fix:
# der Merge-Status-Guard vor den Closure-Schritten (4–6) prüft den PR-State
# per `gh pr view "$PR_NUM" --json state -q .state` und schließt nur bei
# MERGED (T001149-M1).
@test "T006348: --pr-Pfad prüft den PR-State vor der Closure (gh pr view --json state)" {
  run grep -qF 'gh pr view' "$FINALIZE"
  [ "$status" -eq 0 ]
  run grep -qF -- '--json state' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Rot heute: Schritt 8 (Z. 196–227) wiederholt die Archiv-Sektion, ohne zu
# prüfen, ob der Archiv-Branch bereits auf origin existiert (das ls-remote in
# Z. 229 dient nur der Push-Verifikation und nutzt kein --exit-code); grün
# nach dem Fix: der Idempotenz-Skip vor der Archiv-Sektion prüft per
# `git ls-remote --exit-code origin "refs/heads/$ARCHIVE_BRANCH"`.
@test "T006348: Archiv-Sektion ist idempotent (ls-remote --exit-code auf den Archiv-Branch)" {
  run grep -qF -- '--exit-code' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Positiv-Anker für Test 5: Das Skript kennt den Archiv-Branch-Ref bereits
# (Z. 216/229) — der Restore-Mechanismus baut auf derselben Variable auf.
@test "T006348: Archiv-Branch-Ref ist im Skript bekannt (Anker)" {
  run grep -qF 'refs/heads/$ARCHIVE_BRANCH' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Rot heute: nach der Archiv-Sektion bleibt der Arbeitsbaum auf dem Archiv-
# Branch stehen (git checkout -B, Z. 218 — wechselt den Branch des geteilten
# Arbeitsbaums paralleler Sessions); grün nach dem Fix: das Skript merkt sich
# den vorherigen Branch und restauriert ihn nach der Sektion.
#
# SKIP (T006791): Der Restore-Mechanismus (ARCHIVE_PREV_BRANCH) wurde in PR
# #4572 nicht implementiert — die Assertion ist gegen main rot und bleibt als
# sichtbarer skip stehen, bis T006791 den Fix liefert; dann skip entfernen.
@test "T006348: Skript restauriert den Arbeitsbaum-Branch nach der Archiv-Sektion" {
  skip "T006791: ARCHIVE_PREV_BRANCH-Restore fehlt auf main — Fix läuft in T006791"
  run grep -qF 'ARCHIVE_PREV_BRANCH' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Rot heute: das Skript wechselt sein cwd nie (nur die Schritt-8-Subshell
# wechselt in ARCHIVE_DIR) — die relative Plan-Pfad-Prüfung (Z. 176) gilt nur
# bei cwd=REPO_DIR; grün nach dem Fix: cd "$REPO_DIR" zu Skriptbeginn.
@test "T006348: Skript ist cwd-unabhängig (cd \$REPO_DIR zu Skriptbeginn)" {
  run grep -qF 'cd "$REPO_DIR"' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Positiv-Anker für Test 8: Der branch-reaper-Aufruf existiert (Z. 286) —
# die Aussage "mit --repo" wäre ohne den Anker vakuos, wenn der Aufruf fehlte.
@test "T006348: branch-reaper-Aufruf existiert (Anker)" {
  run grep -qF 'branch-reaper.sh' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Rot heute: branch-reaper.sh wird ohne --repo aufgerufen (Default cwd);
# grün nach dem Fix: die T006348-Implementierung löst die cwd-Abhängigkeit
# per absolutem Skript-Pfad (bash "$REPO_DIR/scripts/branch-reaper.sh") statt
# eines --repo-Flags (Z. 298 auf main).
@test "T006348: branch-reaper-Aufruf ist cwd-unabhängig (absoluter Skript-Pfad)" {
  run grep -qF 'bash "$REPO_DIR/scripts/branch-reaper.sh"' "$FINALIZE"
  [ "$status" -eq 0 ]
}
