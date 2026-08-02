#!/usr/bin/env bats
# T002578-M1 — .worktrees/ darf keine versionierten Dateien enthalten.
#
# Hintergrund: drei Plandateien eines fremden Worktrees lagen als getrackte
# Dateien in main (.worktrees/fix-plan-intel-merge-T002540/openspec/changes/…).
# .gitignore:197 ignoriert .worktrees/, die Dateien waren also force-added.
# Wirkung: sobald das Worktree-Verzeichnis lokal entfernt wird — der Normalfall
# nach `git worktree remove` — meldet git sie als geloescht und JEDER
# `git pull --rebase` bricht mit "cannot pull with rebase: You have unstaged
# changes" ab. Im Durchlauf von T002569 war deshalb nach jedem der acht
# Chargen-Merges ein manuelles `git checkout -- .worktrees/` noetig.
#
# Pruefmodus (T002448-M4): command output verification. Beide Tests FUEHREN
# `git ls-files` aus und pruefen dessen Ausgabe; keiner greppt Quelltext.

setup() {
  REPO_ROOT="$BATS_TEST_DIRNAME/../../.."
  cd "$REPO_ROOT" || return 1
}

# Positiv-Anker (Pflicht nach T002356-M1): ohne ihn waere der Negativtest
# unten auch dann gruen, wenn `git ls-files` gar nichts mehr liefert — etwa
# weil das Arbeitsverzeichnis kein Repo ist oder der Aufruf still scheitert.
@test "T002578: git ls-files liefert im Repo ueberhaupt Treffer (Anker)" {
  run git ls-files scripts/
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "T002578: keine versionierten Dateien unter .worktrees/" {
  run git ls-files .worktrees/
  [ "$status" -eq 0 ]
  if [ -n "$output" ]; then
    echo "Versionierte Dateien unter .worktrees/ gefunden:" >&2
    echo "$output" >&2
    echo "Fix: git rm --cached -r <pfad> — .gitignore ignoriert .worktrees/ bereits." >&2
    return 1
  fi
}

@test "T002578: .worktrees/ wird von .gitignore ignoriert" {
  run git check-ignore --no-index -q .worktrees/beliebiger-worktree/datei.md
  [ "$status" -eq 0 ]
}
