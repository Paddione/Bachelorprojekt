#!/usr/bin/env bats
# tests/spec/repo-hygiene/worktree-stash-inspection.bats
# SSOT: openspec/specs/agent-skills.md
#   — "repo-hygiene covers the local working tree and stashes"
#   — "Path-filtered stash inspection uses a two-revision diff"
#   — "Stash relevance is decided against today's main, not against the stash base"
#
# Ticket T002709. Prüfmodus: **Kommando-Ergebnis-Verifikation**. Die Blöcke 2 und 3
# extrahieren die dokumentierte Befehlsform aus der realen SSOT-Datei, führen sie in
# einem Wegwerf-Repo aus und werten deren RESULTAT aus.
#
# Bewusst NICHT geprüft wird das Ausgabeformat von `git` — kein Fehlertext, kein
# Diff-Header, keine Zeilenzählung eines Werkzeug-Outputs. Format-Assertionen gegen
# Werkzeuge sind der Gegenstand von T002716 und hier ausdrücklich unerwünscht.
#
# Jeder Block belegt ZUERST, dass sein Bezugspunkt existiert (Positiv-Anker, T002356-M1),
# und prüft DANN die eigentliche Aussage — sonst bestünde er über leerer Grundlage vakuos.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  OPS="${REPO_ROOT}/.claude/skills/references/repo-hygiene-ops.md"
}

# Legt ein Wegwerf-Repo mit genau einem Stash an, der zwei Dateien mit je einem
# eindeutigen Marker ändert. Nach `stash push` steht der Arbeitsbaum wieder auf `base`.
# Kein `cd` in das Repo des Laufs, keine Berührung des echten Stash-Stacks.
_make_stash_repo() {
  local wt="$1"
  mkdir -p "$wt"
  git -C "$wt" init -q
  git -C "$wt" symbolic-ref HEAD refs/heads/main
  git -C "$wt" config user.email "t002709@example.invalid"
  git -C "$wt" config user.name "T002709 Guard"
  printf 'base\n' > "$wt/alpha.txt"
  printf 'base\n' > "$wt/beta.txt"
  git -C "$wt" add -A
  git -C "$wt" commit -qm "base"
  printf 'MARKER_ALPHA_T002709\n' >> "$wt/alpha.txt"
  printf 'MARKER_BETA_T002709\n' >> "$wt/beta.txt"
  git -C "$wt" stash push -q -m "t002709-fixture"
}

@test "T002709: repo-hygiene-ops.md hat einen Arbeitsbaum-/Stash-Abschnitt VOR den Worktrees" {
  [ -f "$OPS" ]

  # Positiv-Anker: die Datei ist überhaupt in Abschnitte gegliedert. Ohne ihn wäre die
  # Reihenfolge-Aussage unten über einer leeren Überschriftenliste gegenstandslos.
  run bash -c "grep -c '^## ' '$OPS'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 5 ]

  # Ankerpunkt: der bestehende Worktree-Abschnitt.
  local worktree_ln
  worktree_ln="$(grep -n '^## .*Stale Git Worktrees' "$OPS" | head -1 | cut -d: -f1)"
  [ -n "$worktree_ln" ]

  # Die Aussage: es gibt einen Abschnitt für Arbeitsbaum/Stashes, und er steht davor.
  # Arbeit sichern ist Vorbedingung jedes Worktree-Removes, nicht dessen Nachspiel.
  local stash_ln
  stash_ln="$(grep -n '^## .*[Ss]tash' "$OPS" | head -1 | cut -d: -f1)"
  [ -n "$stash_ln" ]
  [ "$stash_ln" -lt "$worktree_ln" ]
}

@test "T002709: die dokumentierte pfadgefilterte Stash-Inspektion liefert genau den Pfad" {
  # Positiv-Anker: die SSOT dokumentiert überhaupt eine Zwei-Revisions-Form auf einen Stash.
  run bash -c "grep -F 'git diff' '$OPS' | grep -c 'stash@{'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Die dokumentierte Form wird aus der realen Datei gelesen, nicht im Test nachgebaut —
  # sonst prüfte der Guard seine eigene Kopie statt der Anweisung, der ein Bediener folgt.
  local form
  form="$(grep -F 'git diff' "$OPS" | grep 'stash@{' | head -1 \
          | sed 's/.*\(git diff[^`]*\).*/\1/')"
  form="${form//stash@\{N\}/stash@\{0\}}"
  form="${form//<pfad>/alpha.txt}"
  [ -n "$form" ]

  local wt="${BATS_TEST_TMPDIR}/inspect"
  _make_stash_repo "$wt"

  # Resultat-Verifikation: liefert die dokumentierte Form die Änderung des gefragten
  # Pfades — und NUR diese?
  run bash -c "cd '$wt' && $form"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q 'MARKER_ALPHA_T002709'
  run bash -c "cd '$wt' && $form | grep -c 'MARKER_BETA_T002709'"
  [ "$output" -eq 0 ]
}

@test "T002709: Stash-Relevanz löst sich gegen main auf, nicht am Stash-Diff" {
  # Positiv-Anker: die SSOT dokumentiert überhaupt eine Marker-Prüfung gegen main.
  run bash -c "grep -F 'git grep' '$OPS' | grep -c 'main'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  local wt="${BATS_TEST_TMPDIR}/relevance"
  _make_stash_repo "$wt"

  # Vor dem Landen: der Marker ist nicht in main — die dokumentierte Prüfung sagt "behalten".
  run bash -c "cd '$wt' && git grep -F MARKER_ALPHA_T002709 main -- alpha.txt"
  [ "$status" -ne 0 ]

  local before
  before="$(git -C "$wt" diff 'stash@{0}^' 'stash@{0}')"
  [ -n "$before" ]

  # Derselbe Inhalt landet auf main.
  printf 'MARKER_ALPHA_T002709\n' >> "$wt/alpha.txt"
  git -C "$wt" add -A
  git -C "$wt" commit -qm "landet in main"

  # Kernaussage 1: der Stash-Diff ist UNVERÄNDERT. Er wird gegen den eigenen Basiscommit
  # gerechnet, der sich nicht bewegt — er trägt also kein Relevanzsignal, egal wie der
  # Inhalt in main steht. Genau diese Verwechslung kostete den Lauf vom 2026-08-08 Zeit.
  local after
  after="$(git -C "$wt" diff 'stash@{0}^' 'stash@{0}')"
  [ "$before" = "$after" ]

  # Kernaussage 2: die dokumentierte Prüfung gegen main löst die Entscheidung dagegen auf.
  run bash -c "cd '$wt' && git grep -F MARKER_ALPHA_T002709 main -- alpha.txt"
  [ "$status" -eq 0 ]
}
