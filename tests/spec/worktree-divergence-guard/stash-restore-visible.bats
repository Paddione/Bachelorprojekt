#!/usr/bin/env bats
# tests/spec/worktree-divergence-guard/stash-restore-visible.bats [T002673]
#
# PRÜFMODUS: Output-Verifikation. Der Test baut ein echtes Repo-Paar (bare
# origin + Klon), erzeugt genau die Lage, in der `git stash pop` scheitern muss,
# ruft `scripts/worktree-create.sh` als Kommando auf und prüft dessen Ausgabe.
# Kein Source-Grep — der bestehende Nachbartest zu derselben Datei
# (worktree-divergence-guard-T002387.bats) arbeitet so, hier ist das Verhalten
# aber direkt beobachtbar.
#
# HINTERGRUND: Das Skript stasht einen dirty Haupt-Checkout, um `git pull
# --rebase origin main` fahren zu können, und poppt danach zurück:
#
#   git stash push -m "worktree-create-auto-stash" 2>/dev/null || true
#   ...
#   $_needs_pop && git stash pop 2>/dev/null || true
#
# Scheitert der Pop — typisch, wenn der Stash mit inzwischen gemergten
# main-Änderungen kollidiert — verschluckt `2>/dev/null || true` Meldung UND
# Exit-Code. Das Skript meldet "ready", der Aufrufer hält seine Änderungen für
# wiederhergestellt, und sie liegen im Stash. Real aufgetreten am 2026-08-04.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/worktree-create.sh"
  ORIGIN="${BATS_TEST_TMPDIR}/origin.git"
  CLONE="${BATS_TEST_TMPDIR}/clone"

  git init -q --bare -b main "$ORIGIN"
  git clone -q "$ORIGIN" "$CLONE"
  cd "$CLONE" || return 1
  git config user.email "test@example.invalid"
  git config user.name "Test"
  git config commit.gpgsign false

  echo "zeile-eins" > shared.txt
  git add shared.txt
  git commit -qm "base"
  git branch -M main
  git push -q origin main

  # origin bekommt einen Commit, der dieselbe Zeile ändert -> local main liegt
  # zurück, und ein Stash auf dieser Datei kollidiert beim Pop.
  local upstream="${BATS_TEST_TMPDIR}/upstream"
  git clone -q -b main "$ORIGIN" "$upstream"
  git -C "$upstream" config user.email "test@example.invalid"
  git -C "$upstream" config user.name "Test"
  git -C "$upstream" config commit.gpgsign false
  echo "zeile-eins-vom-remote" > "$upstream/shared.txt"
  git -C "$upstream" commit -qam "remote ändert dieselbe Zeile"
  git -C "$upstream" push -q origin main

  git fetch -q origin

  # Dirty im Haupt-Checkout, dieselbe Zeile -> Pop-Konflikt garantiert.
  echo "zeile-eins-lokal-uneingecheckt" > shared.txt
}

# Regressionsschutz für den Normalfall: bei SAUBEREM Haupt-Checkout gibt es
# nichts zu stashen, und das Skript muss den Fast-Forward-Pfad trotzdem
# vollständig durchlaufen. Der Test deckt die Variante ab, in der die
# Rückspiel-Logik fälschlich auch ohne vorherigen Stash anspringt oder den
# Ablauf abbricht.
#
# Ausdrücklich NICHT belegt: dass `$_needs_pop && cmd` unter `set -e` abbräche.
# Nachgemessen am 2026-08-04 — tut es nicht, weil Bash Fehler in AND-Listen vom
# errexit ausnimmt. Die `if`-Form im Skript ist eine Lesbarkeitsentscheidung,
# keine Fehlerbehebung; dieser Kommentar steht hier, damit niemand die
# Begründung später aus dem Testnamen zurückliest.
@test "worktree-create: sauberer Haupt-Checkout laeuft trotz Fast-Forward durch" {
  git checkout -q -- shared.txt   # dirty-Zustand aus setup() zuruecknehmen
  git diff --quiet HEAD

  run bash "$SCRIPT" fix/clean-probe-T000002 "${BATS_TEST_TMPDIR}/wt-clean"

  # Positiv-Anker: das Skript hat den Fast-Forward-Pfad ueberhaupt betreten.
  [[ "$output" == *"behind origin/main"* ]]

  # Und ist nicht daran gestorben.
  [ "$status" -eq 0 ]
  [[ "$output" == *"ready on"* ]]
}

@test "worktree-create: gescheiterter stash pop wird laut gemeldet, nicht verschluckt" {
  run bash "$SCRIPT" fix/stash-probe-T000001 "${BATS_TEST_TMPDIR}/wt"

  # Positiv-Anker [T002356-M1]: erst belegen, dass das Skript überhaupt gelaufen
  # ist und den Stash-Pfad erreicht hat. Ohne ihn wäre die Aussage über die
  # Warnung trivial wahr, sobald das Skript früher abbricht.
  [ -n "$output" ]
  [[ "$output" == *"stash"* ]] || [[ "$output" == *"Stash"* ]]

  # Der Stash darf nicht unbemerkt liegenbleiben: entweder wurde er sauber
  # zurückgespielt (dann ist die Arbeitskopie wieder dirty), oder das Skript
  # sagt unmissverständlich, dass er liegengeblieben ist.
  local stash_count
  stash_count="$(git stash list | grep -c 'worktree-create-auto-stash' || true)"
  if [ "$stash_count" -gt 0 ]; then
    # Liegengeblieben -> die Ausgabe MUSS darauf hinweisen und den Namen nennen.
    [[ "$output" == *"worktree-create-auto-stash"* ]]
    [[ "$output" == *"git stash"* ]]
  else
    # Sauber zurückgespielt -> die lokale Änderung ist wieder da.
    grep -q "zeile-eins-lokal-uneingecheckt" shared.txt
  fi
}
