#!/usr/bin/env bats

# PRUEFMODUS: Output-Verifikation
# SSOT: openspec/specs/agent-skills.md
# Ticket: T900047 — `scripts/hooks/worktree-write-guard.sh` haengt den Repo-Root
# vor einen bereits absoluten Pfad (`case "$TARGET" in /*)` erkennt nur
# POSIX-`/...` als absolut; `C:\...` / `C:/...` faellt in den `*`-Zweig und bekommt
# `$PWD/` vorangestellt: `Pfad: /c/Users/.../Bachelorprojekt/C:\Users\...`).
#
# Die Windows-Schreibweisen werden aus der POSIX-Form des echten Repo-Pfads
# abgeleitet (`cd && pwd`). Auf Windows/Git-Bash bezeichnen sie dieselbe Stelle
# wie der Claim (Regel 2 -> erlaubt nach Fix), auf Linux liegen sie ausserhalb
# des Repos (Regel 1 -> erlaubt nach Fix). Vor dem Fix wird in beiden Welten
# verstuemmelt (`$PWD/`-Praefix) und mit Exit 2 abgelehnt.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  BATS_TMPDIR=$(mktemp -d)
  REPO="$BATS_TMPDIR/repo"
  mkdir -p "$REPO/wt-real"
  touch "$REPO/wt-real/README.md"
  touch "$REPO/outside.txt"

  cd "$REPO"
  git init -b main >/dev/null 2>&1
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -m "chore: init" >/dev/null 2>&1

  export AGENT_LOCK_DIR="$BATS_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"

  export SID="sid-T900047"
  export AGENT_LOCK_SID="$SID"

  # POSIX-Schreibweise des Repo-Pfads (`cd && pwd` normalisiert die
  # Windows-Form aus mktemp/$TMPDIR zur /c/...- bzw. /tmp/...-Form). Alle
  # TARGET-Ableitungen gehen von hier aus, damit der Test auf Linux UND
  # Windows/Git-Bash dieselbe Stelle meint.
  REPO_POSIX="$(cd "$REPO" && pwd)"
  echo "{\"owner_sid\":\"$SID\",\"owner_pid\":\"1234\",\"worktree\":\"$REPO_POSIX/wt-real\",\"branch\":\"fix/demo-T900047\",\"label\":\"live\"}" > "$AGENT_LOCK_DIR/ticket__T900047.json"

  GUARD="$REPO_ROOT/scripts/hooks/worktree-write-guard.sh"

  POSIX_REAL="$REPO_POSIX/wt-real/README.md"
  if [[ "$REPO_POSIX" =~ ^/([A-Za-z])/(.*)$ ]]; then
    # Git-Bash: /c/Users/... -> C:/Users/... (eigener Claim, Regel 2 nach Fix).
    DRIVE="${BASH_REMATCH[1]^}"
    REST="${BASH_REMATCH[2]}"
    WIN_SLASH="$DRIVE:/$REST/wt-real/README.md"
    WIN_LOWER="${DRIVE,}:$REST/wt-real/README.md"
    POSIX_DRIVE="$POSIX_REAL"
  else
    # Linux: C:/tmp/... liegt ausserhalb des Repos (Regel 1 nach Fix).
    WIN_SLASH="C:$POSIX_REAL"
    WIN_LOWER="c:$POSIX_REAL"
    POSIX_DRIVE="/c$POSIX_REAL"
  fi
  WIN_BACKSLASH="$(printf '%s' "$WIN_SLASH" | tr '/' '\\')"
}

# JSON-sicher verpacken OHNE python3: Dessen argv wird auf Windows-Hosts
# (Store-Alias, nativer Win32-Prozess) von der MSYS2-Runtime konvertiert —
# `/tmp/...` kommt als `C:/Users/PATRIC~1/...` an und verfaelscht den Test.
# Reines bash/sed-Escaping (Backslash + Quote) reicht fuer Pfade voellig.
json_input() {
  local esc
  esc="$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
  printf '{"tool_input":{"file_path":"%s"}}' "$esc"
}

teardown() {
  rm -rf "$BATS_TMPDIR"
}

@test "T1: Windows-Laufwerkspfad mit Slashes im eigenen Worktree -> erlaubt (exit 0)" {
  run bash "$GUARD" <<< "$(json_input "$WIN_SLASH")"
  [ "$status" -eq 0 ]
}

@test "T2: Windows-Laufwerkspfad mit Backslashes im eigenen Worktree -> erlaubt (exit 0)" {
  run bash "$GUARD" <<< "$(json_input "$WIN_BACKSLASH")"
  [ "$status" -eq 0 ]
}

@test "T3: kleingeschriebener Laufwerksbuchstabe matcht Claim-Pfad (exit 0)" {
  run bash "$GUARD" <<< "$(json_input "$WIN_LOWER")"
  [ "$status" -eq 0 ]
}

@test "T4: UNC-absoluter Pfad wird nicht verstuemmelt (exit 0)" {
  local UNC='\\testserver\share\wt-real\README.md'
  run bash "$GUARD" <<< "$(json_input "$UNC")"
  [ "$status" -eq 0 ]
}

@test "T5: POSIX-Drive-Schreibweise bleibt erlaubt (exit 0, Regression)" {
  run bash "$GUARD" <<< "$(json_input "$POSIX_DRIVE")"
  [ "$status" -eq 0 ]
}

@test "T6: Guard blockt weiterhin - Positiv-Anker plus Negativ-Faelle im selben Test" {
  # Positiv-Anker: normaler POSIX-Pfad im eigenen Worktree geht durch.
  run bash "$GUARD" <<< "$(json_input "$POSIX_REAL")"
  [ "$status" -eq 0 ]

  # Negativ 1: POSIX-Pfad im Repo, aber ausserhalb des eigenen Claims, bleibt blockiert.
  run bash "$GUARD" <<< "$(json_input "$REPO_POSIX/outside.txt")"
  [ "$status" -eq 2 ]

  # Negativ 2: Laufwerk-relativer Pfad (kein Slash nach dem Doppelpunkt) bleibt relativ.
  run bash "$GUARD" <<< "$(json_input "C:relative.txt")"
  [ "$status" -eq 2 ]
}
