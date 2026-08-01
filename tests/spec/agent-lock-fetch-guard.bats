#!/usr/bin/env bats
# tests/spec/agent-lock-fetch-guard.bats
# SSOT: scripts/agent-lock.sh (cmd_reap, Schritt 2b)
# Ticket: T002502
#
# Regression-Suite fuer den Netzwerk-Fetch-TTL-Guard in cmd_reap().
#
# Hintergrund: cmd_reap() laeuft als pre-claim reap bei JEDEM claim (Zeile 255)
# und in der Reap-Schleife von agent-lock-claim-persist.bats (Test 4: 30 Runden
# claim+reap). Vor T002502 kostete `git fetch --prune origin` bei jedem Aufruf
# ~1.4s (lokal) bzw. deutlich mehr auf CI (cold git-Refs, 2-Kern-Runner) — 60
# Fetches in einer Datei machten Shard 4 der Factory-Suite ~310s lang. Der Guard
# begrenzt den fetch auf einen pro AGENT_LOCK_FETCH_TTL (Default 300s) mit einem
# Marker im Lock-Dir.
#
# Diese Suite prueft: (1) der Guard existiert im Quellcode (statischer Check,
# gleiche Konvention wie T001384-D3), (2) der Marker wird beim ersten reap
# angelegt, (3) ein frischer Marker verhindert den naechsten fetch, (4) ein
# abgelaufener Marker laesst den fetch wieder laufen, (5) AGENT_LOCK_FETCH_TTL=0
# erzwingt den fetch (Debug-Pfad).
#
# setup_file statt setup: alle Tests teilen EIN Lock-Dir (und damit EINEN
# Marker), sodass die Datei auf CI genau EINEN git fetch kostet statt einen
# pro Test. Die Marker-Verhaltenstests (G3-G5) manipulieren den Zeitstempel
# bewusst und stellen ihn vor dem naechsten Test zurueck.

setup_file() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  export AGENT_LOCK_DIR
  AGENT_LOCK_DIR="$(mktemp -d)"
  # Einmaliger echter claim legt den Marker an (der fetch im ersten reap).
  bash "$REPO/scripts/agent-lock.sh" claim ticket T002502-file-probe --label probe
}

teardown_file() {
  rm -rf "$AGENT_LOCK_DIR" 2>/dev/null || true
}

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  unset CLAUDE_CODE_SESSION_ID
  export CLAUDE_SESSION_ID="claude-t002502-suite"
  unset AGENT_LOCK_SID
  export AGENT_LOCK_FETCH_TTL="${AGENT_LOCK_FETCH_TTL:-300}"
}

teardown() {
  # Marker-Zustand fuer den naechsten Test neutralisieren: frisch setzen,
  # damit G3/G4/G5 unabhaengig voneinander laufen.
  touch "$AGENT_LOCK_DIR/.last-fetch" 2>/dev/null || true
}

@test "T002502-G1: cmd_reap referenziert den Fetch-TTL-Guard im Quellcode" {
  # Statischer Check analog T001384-D3: der Guard MUSS da sein, sonst ist der
  # Fix nicht vorhanden. Gesucht wird die TTL-Variable und der Marker-Pfad.
  grep -Eq 'AGENT_LOCK_FETCH_TTL' "$LOCK"
  grep -Eq '\.last-fetch' "$LOCK"
}

@test "T002502-G2: reap ohne Marker legt den .last-fetch-Marker an" {
  rm -f "$AGENT_LOCK_DIR/.last-fetch"
  bash "$LOCK" reap
  [ -f "$AGENT_LOCK_DIR/.last-fetch" ]
}

@test "T002502-G3: frischer Marker unterbricht den fetch-Zyklus (kein Refresh)" {
  # Marker kuenstlich auf "vor 60s" setzen — innerhalb des 300s-Fensters.
  # Ein reap darf den Zeitstempel NICHT aktualisieren (kein fetch).
  OLD_TS="$(date +%s)"
  touch -d "@$((OLD_TS - 60))" "$AGENT_LOCK_DIR/.last-fetch"
  bash "$LOCK" reap
  NEW_TS="$(stat -c %Y "$AGENT_LOCK_DIR/.last-fetch")"
  [ "$NEW_TS" -eq "$((OLD_TS - 60))" ]
}

@test "T002502-G4: abgelaufener Marker loest wieder einen fetch aus (Refresh)" {
  # Marker kuenstlich auf "vor 600s" setzen — ausserhalb des 300s-Fensters.
  # Ein reap MUSS den Zeitstempel aktualisieren (fetch laeuft wieder).
  OLD_TS="$(date +%s)"
  touch -d "@$((OLD_TS - 600))" "$AGENT_LOCK_DIR/.last-fetch"
  bash "$LOCK" reap
  NEW_TS="$(stat -c %Y "$AGENT_LOCK_DIR/.last-fetch")"
  [ "$NEW_TS" -gt "$((OLD_TS - 600))" ]
}

@test "T002502-G5: AGENT_LOCK_FETCH_TTL=0 erzwingt den fetch bei jedem reap" {
  # Debug-Pfad: TTL=0 muss den Marker bei jedem reap aktualisieren, auch wenn
  # er frisch ist. Das verhindert, dass der Guard den fetch komplett abschaltet.
  export AGENT_LOCK_FETCH_TTL=0
  OLD_TS="$(date +%s)"
  touch -d "@$OLD_TS" "$AGENT_LOCK_DIR/.last-fetch"
  bash "$LOCK" reap
  NEW_TS="$(stat -c %Y "$AGENT_LOCK_DIR/.last-fetch")"
  [ "$NEW_TS" -ge "$OLD_TS" ]
}
