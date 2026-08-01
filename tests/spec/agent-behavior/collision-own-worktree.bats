#!/usr/bin/env bats
# tests/spec/agent-behavior/collision-own-worktree.bats — [T002523, Mishap 2]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION. Der Test legt echte Repos und Lock-Dateien an und
# prüft, was `scripts/agent-collision.sh check --all` tatsächlich ausgibt.
#
# Hintergrund: Der Detektor überspringt den eigenen Lock per `[ "$sid" = "$mysid" ]`. Das
# greift nicht, wenn Lock und Aufruf verschiedene Identitätsbegriffe verwenden: beim Claim
# wird AGENT_LOCK_SID als Session-UUID gesetzt und gespeichert, beim pre-commit-Aufruf ist die
# Variable nicht gesetzt, sodass _my_sid() auf die numerische `ps -o sess=` zurückfällt.
# Eine UUID ist nie gleich einer Zahl — die eigene Session wird als Kollision gemeldet.

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  COLLISION="$PROJECT_DIR/scripts/agent-collision.sh"

  MINE="$BATS_TEST_TMPDIR/mine"    # der Baum, aus dem heraus geprueft wird
  PEER="$BATS_TEST_TMPDIR/peer"    # ein zweiter Baum, der als fremde Session auftritt
  LOCKS="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$LOCKS"

  for d in "$MINE" "$PEER"; do
    mkdir -p "$d"
    git init --quiet "$d"
    git -C "$d" config user.email t@example.com
    git -C "$d" config user.name Test
    echo "base" > "$d/datei.txt"
    git -C "$d" add datei.txt
    git -C "$d" commit --quiet -m "base"
    git -C "$d" branch -M main
    # Uncommittete Aenderung in BEIDEN: nur dann sieht der Detektor eine Ueberschneidung.
    echo "geaendert in $d" > "$d/datei.txt"
  done

  export AGENT_LOCK_DIR="$LOCKS"
}

# _write_lock <sid> <worktree-pfad>
_write_lock() {
  cat > "$LOCKS/branch__main.json" <<EOF
{"scope":"branch","id":"main","owner_sid":"$1","owner_pid":999999,
 "tool":"claude","label":"dev-flow-plan","branch":"main","worktree":"$2"}
EOF
}

@test "T002523-M2: Positiv-Anker — eine FREMDE Session an derselben Datei wird gemeldet" {
  # Muss zuerst laufen: schlaegt er fehl, meldet der Detektor generell nichts und die
  # Negativ-Aussagen unten bestuenden vakuos.
  _write_lock "fremde-session-uuid-0000" "$PEER"
  cd "$MINE" || return 1
  run env AGENT_LOCK_SID="meine-session-uuid-1111" bash "$COLLISION" check --all
  [ "$(printf '%s\n' "$output" | grep -c 'COLLISION')" -ge 1 ]
}

@test "T002523-M2: fremder Worktree mit der EIGENEN SID wird nicht gemeldet" {
  _write_lock "meine-session-uuid-1111" "$PEER"
  cd "$MINE" || return 1
  run env AGENT_LOCK_SID="meine-session-uuid-1111" bash "$COLLISION" check --all
  [ "$(printf '%s\n' "$output" | grep -c 'COLLISION')" -eq 0 ]
}

@test "T002523-M2: der eigene Worktree wird nicht gemeldet, auch wenn AGENT_LOCK_SID fehlt" {
  # Der eigentliche Mishap: der Lock traegt eine UUID, der Aufruf hat kein AGENT_LOCK_SID
  # und faellt auf eine numerische SID zurueck. Der SID-Vergleich kann nicht greifen —
  # der Worktree-Pfad ist hier das verlaessliche Identitaetsmerkmal.
  _write_lock "meine-session-uuid-1111" "$MINE"
  cd "$MINE" || return 1
  run env -u AGENT_LOCK_SID bash "$COLLISION" check --all
  [ "$(printf '%s\n' "$output" | grep -c 'COLLISION')" -eq 0 ]
}
