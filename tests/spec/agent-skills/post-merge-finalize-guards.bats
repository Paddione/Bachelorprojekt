#!/usr/bin/env bats
# tests/spec/agent-skills/post-merge-finalize-guards.bats
# SSOT: openspec/specs/agent-skills.md (Delta: post-merge-finalize-guards, T006348)
#
# PRÜFMODUS: Source-Grep — dokumentierte Ausnahme von der Output-Verifikation
# (T002448-M4): Der Laufzeitpfad von scripts/devflow-post-merge-finalize.sh
# benötigt Cluster-/DB-Zugriff (Schritt 1: ticket.sh get), der in CI nicht
# existiert; die Guard-Logik manifestiert sich ausschließlich im Quelltext
# (gleiche Ausnahme wie Tests 1–3 in tests/spec/agent-skills/executor-post-merge-death.bats).
# T006791: Die Restore-Mechanik der Archiv-Sektion wurde zusätzlich isoliert
# verifiziert (Bare-Git-Repo + Fake-openspec.sh, Code-Review PR #4586) — ein
# voller BATS-Runtime-Test bleibt unmöglich, weil die Sektion nicht als Funktion
# isolierbar ist und Schritt 1 (ticket.sh get) die Ticket-DB braucht.
#
# Regression für T006348: Review-Befunde aus PR #4539 (T006284, gemergt 1cab10192) —
#   (1) Merge-Status-Guard fehlt im --pr-Pfad: Closure-Schritte laufen für jede
#       übergebene PR-Nummer, nur der Auto-Pfad filtert auf merged — Drift
#       Ticket=done bei PR=OPEN (T001149-M1, T001092).
#   (2) Idempotenz-Lücke Schritt 8: zweiter Lauf im Fenster "Schritt 8 erledigt,
#       Archiv-PR noch offen" wiederholt die Archivierung (checkout -B wechselt
#       den Branch des geteilten Arbeitsbaums, Push kollidiert, gh pr create
#       endet FATAL, Schritt 10 wird nie erreicht).
#   (3) cwd-Abhängigkeit: Plan-Pfad-Prüfung relativ, branch-reaper ohne --repo
#       — nur bei cwd=REPO_DIR korrekt.

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

# Rot heute: der --pr-Pfad setzt PR_NUM ohne State-Prüfung — `gh pr
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

# Rot heute: Schritt 8 wiederholt die Archiv-Sektion, ohne zu prüfen, ob der
# Archiv-Branch bereits auf origin existiert (das ls-remote diente nur der
# Push-Verifikation und nutzte kein --exit-code); grün nach dem Fix: der
# Idempotenz-Skip vor der Archiv-Sektion prüft per
# `git ls-remote --exit-code origin "refs/heads/$ARCHIVE_BRANCH"`.
@test "T006348: Archiv-Sektion ist idempotent (ls-remote --exit-code auf den Archiv-Branch)" {
  run grep -qF -- '--exit-code' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Positiv-Anker für Test 5: Das Skript kennt den Archiv-Branch-Ref bereits —
# der Restore-Mechanismus baut auf derselben Variable auf.
@test "T006348: Archiv-Branch-Ref ist im Skript bekannt (Anker)" {
  run grep -qF 'refs/heads/$ARCHIVE_BRANCH' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Rot vor T006791: nach der Archiv-Sektion blieb der Arbeitsbaum auf dem
# Archiv-Branch stehen (git checkout -B wechselt den Branch des geteilten
# Arbeitsbaums paralleler Sessions); grün nach dem Fix (T006791): das Skript
# merkt sich den vorherigen Branch (ARCHIVE_PREV_BRANCH) vor der Archiv-Sektion
# und registriert in der Sektions-Subshell eine EXIT-Trap (trap
# _restore_prev_branch EXIT), die ihn auch auf Fehlerpfaden wiederherstellt
# (T002357-Fallenklasse). Assertion auf das Trap-Signal statt nur auf die
# Variable: die Capture-Zeile allein (ARCHIVE_PREV_BRANCH=...) wäre vakuos —
# ein Refactor, der die Trap entfernt, muss rot werden (Code-Review PR #4586).
@test "T006348: Skript restauriert den Arbeitsbaum-Branch nach der Archiv-Sektion" {
  run grep -qF 'ARCHIVE_PREV_BRANCH' "$FINALIZE"
  [ "$status" -eq 0 ]
  run grep -qF 'trap _restore_prev_branch EXIT' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Rot heute: das Skript wechselt sein cwd nie (nur die Schritt-8-Subshell
# wechselt in ARCHIVE_DIR) — die relative Plan-Pfad-Prüfung galt nur bei
# cwd=REPO_DIR; grün nach dem Fix: cd "$REPO_DIR" zu Skriptbeginn.
@test "T006348: Skript ist cwd-unabhängig (cd \$REPO_DIR zu Skriptbeginn)" {
  run grep -qF 'cd "$REPO_DIR"' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Positiv-Anker für Test 8: Der branch-reaper-Aufruf existiert — die Aussage
# "mit --repo" wäre ohne den Anker vakuos, wenn der Aufruf fehlte.
@test "T006348: branch-reaper-Aufruf existiert (Anker)" {
  run grep -qF 'branch-reaper.sh' "$FINALIZE"
  [ "$status" -eq 0 ]
}

# Rot heute: branch-reaper.sh wird ohne --repo aufgerufen (Default cwd);
# grün nach dem Fix: die T006348-Implementierung löst die cwd-Abhängigkeit
# per absolutem Skript-Pfad (bash "$REPO_DIR/scripts/branch-reaper.sh") statt
# eines --repo-Flags.
@test "T006348: branch-reaper-Aufruf ist cwd-unabhängig (absoluter Skript-Pfad)" {
  run grep -qF 'bash "$REPO_DIR/scripts/branch-reaper.sh"' "$FINALIZE"
  [ "$status" -eq 0 ]
}
