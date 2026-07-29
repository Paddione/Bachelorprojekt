#!/usr/bin/env bats
# tests/spec/ci-cd/pr-refresh-batch.bats — Sammellauf von scripts/pr-refresh.sh [T002417]
#
# Gehoert zur SSOT-Spec ci-cd. Eigene Datei nach der Verzeichniskonvention aus T002416.
#
# Der Vorgang: `pr-refresh.sh 3461 3457 3449 3442` verarbeitete nur den ERSTEN PR. Jeder
# Guard beendete per exit das ganze Skript, die restlichen Nummern wurden nie betrachtet.
# Da bei der Messung drei von vier CONFLICTING-PRs an ausgecheckten Worktrees hingen, war
# eine Ablehnung der Normalfall — der dokumentierte Sammelaufruf war damit praktisch
# unbenutzbar.
#
# ACHTUNG $0-Falle (CLAUDE.md): der Worktree heisst pr-refresh-T002417. Assertions auf
# blosse PR-Nummern oder auf "pr-refresh" waeren durch das Pfad-Echo in der Usage immer
# wahr. Alle Assertions unten sind auf konkrete, verankerte Ausgabezeilen verengt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/pr-refresh.sh"

  # gh-Stub mit Fixture-VERZEICHNIS: der Sammellauf fragt mehrere PRs ab und braucht
  # pro Nummer eine eigene Antwort. Die Nummer steht in `pr view <num> --json ...`.
  STUB_DIR="${BATS_TEST_TMPDIR}/stub"
  mkdir -p "$STUB_DIR"
  cat > "${STUB_DIR}/gh-stub.sh" <<'STUB'
#!/usr/bin/env bash
# Aufrufform: gh pr view <num> --json ...
num="$3"
f="${GH_FIXTURE_DIR:?GH_FIXTURE_DIR not set}/${num}.json"
[ -f "$f" ] || { printf 'gh-stub: keine Fixture fuer PR %s\n' "$num" >&2; exit 1; }
cat "$f"
STUB
  chmod +x "${STUB_DIR}/gh-stub.sh"

  GH_FIXTURE_DIR="${BATS_TEST_TMPDIR}/fixtures"
  mkdir -p "$GH_FIXTURE_DIR"
  export GH_FIXTURE_DIR

  PUSH_LOG="${BATS_TEST_TMPDIR}/push.log"
  : > "$PUSH_LOG"

  export PR_REFRESH_GH_CMD="${STUB_DIR}/gh-stub.sh"
  export PR_REFRESH_PUSH_LOG="$PUSH_LOG"
  export PR_REFRESH_DRY_PUSH=1
  export PR_REFRESH_ME="Paddione"
}

# _pr <num> <mergeable> <author> — legt eine Fixture ab.
_pr() {
  printf '{"number":%s,"mergeable":"%s","headRefName":"feature/pr-%s","author":{"login":"%s"}}' \
    "$1" "$2" "$1" "$3" > "${GH_FIXTURE_DIR}/$1.json"
}

@test "T002417: eine Ablehnung beendet den Sammellauf nicht — folgende PRs werden verarbeitet" {
  # PR 2 wird von Guard 2 (fremder Autor) abgelehnt, PR 3 ist MERGEABLE und muss
  # trotzdem noch bewertet werden.
  _pr 2 CONFLICTING SomeoneElse
  _pr 3 MERGEABLE   Paddione

  run bash "$SCRIPT" 2 3

  # Positiv-Anker: die Ablehnung ist ueberhaupt eingetreten und nennt den fremden Login.
  # Ohne diesen Anker koennte der Test auch bei komplett fehlendem Guard bestehen.
  printf '%s\n' "$output" | grep -q 'SomeoneElse'

  # Kern der Aussage: der ZWEITE PR wurde erreicht. Verankert auf die konkrete
  # Bewertungszeile, nicht auf die blosse Ziffer 3 (siehe $0-Falle im Dateikopf).
  printf '%s\n' "$output" | grep -qE '^pr-refresh: PR 3 ist MERGEABLE'

  # Exit-Code bleibt != 0, damit Automatisierung die Ablehnung nicht uebersieht.
  [ "$status" -ne 0 ]
  [ ! -s "$PUSH_LOG" ]
}

@test "T002417: der Sammellauf gibt eine Bilanz aus (geheilt / uebersprungen / abgelehnt)" {
  _pr 4 MERGEABLE   Paddione      # uebersprungen — nichts zu tun
  _pr 5 CONFLICTING SomeoneElse   # abgelehnt — fremder Autor
  _pr 6 CONFLICTING Paddione      # im Dry-run: waere geheilt

  run bash "$SCRIPT" --dry-run 4 5 6

  # Positiv-Anker: alle drei PRs wurden wirklich betrachtet.
  printf '%s\n' "$output" | grep -qE '^pr-refresh: PR 4 ist MERGEABLE'
  printf '%s\n' "$output" | grep -q 'SomeoneElse'
  printf '%s\n' "$output" | grep -E '^\[dry-run\]' | grep -q 'PR 6'

  # Die Bilanzzeile nennt alle drei Kategorien mit ihren Zahlen.
  bilanz="$(printf '%s\n' "$output" | grep -E '^pr-refresh: Bilanz')"
  [ -n "$bilanz" ]
  printf '%s\n' "$bilanz" | grep -qE '1 geheilt'
  printf '%s\n' "$bilanz" | grep -qE '1 uebersprungen'
  printf '%s\n' "$bilanz" | grep -qE '1 abgelehnt'
}

@test "T002417: ohne Ablehnung endet der Sammellauf mit Exit 0" {
  _pr 7 MERGEABLE Paddione
  _pr 8 MERGEABLE Paddione

  run bash "$SCRIPT" 7 8

  # Positiv-Anker: beide PRs wurden bewertet ...
  printf '%s\n' "$output" | grep -qE '^pr-refresh: PR 7 ist MERGEABLE'
  printf '%s\n' "$output" | grep -qE '^pr-refresh: PR 8 ist MERGEABLE'
  # ... und der Lauf meldet sauberen Abschluss.
  [ "$status" -eq 0 ]
}

@test "T002417: ein nicht abrufbarer PR ueberspringt nur sich selbst" {
  # Fuer PR 98 existiert keine Fixture — der gh-Stub scheitert. Frueher beendete
  # `_die "PR 98 nicht abrufbar"` den ganzen Lauf.
  _pr 99 MERGEABLE Paddione

  run bash "$SCRIPT" 98 99

  # Positiv-Anker: der Fehlschlag ist eingetreten und wird benannt.
  printf '%s\n' "$output" | grep -qE '^pr-refresh: PR 98 nicht abrufbar'
  # Kern: PR 99 wurde trotzdem erreicht.
  printf '%s\n' "$output" | grep -qE '^pr-refresh: PR 99 ist MERGEABLE'
  [ "$status" -ne 0 ]
}
