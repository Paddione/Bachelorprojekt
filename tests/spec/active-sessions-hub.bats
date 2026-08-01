#!/usr/bin/env bats
# tests/spec/active-sessions-hub.bats
# SSOT: openspec/specs/active-sessions-hub.md
#
# Deckt den Argument-Vertrag von `agent-lock.sh claim` / `check-and-claim` ab. [T002363]
# Der frühere Platzhalter-Test (`run true`) ist durch echte Abdeckung ersetzt.
#
# ACHTUNG — $output-Falle: der Worktree dieses Changes heißt
# `agent-lock-claim-strict-args` und enthält damit die Begriffe "claim", "args" und
# "lock". Jede unqualifizierte Assertion gegen `$output` kann allein über den in der
# Ausgabe auftauchenden Pfad grün werden. Alle Assertions unten prüfen deshalb
# entweder den Exit-Code, die Existenz einer Lock-Datei oder eine auf `AGENT-LOCK:`
# eingeschränkte Zeile.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  export AGENT_LOCK_DIR
  AGENT_LOCK_DIR="$(mktemp -d)"
  export CLAUDE_SESSION_ID="claude-t002363-suite"
  unset AGENT_LOCK_SID
}

teardown() {
  rm -rf "$AGENT_LOCK_DIR" 2>/dev/null || true
}

# ── claim weist unbekannte Argumente ab ─────────────────────────────────── #

@test "T002363: claim lehnt ein positionales Argument mit Exit != 0 ab" {
  run bash "$LOCK" claim ticket T002363 dev-flow-plan
  [ "$status" -ne 0 ]
}

@test "T002363: claim legt bei abgelehntem Argument KEINE Lock-Datei an" {
  run bash "$LOCK" claim ticket T002363 dev-flow-plan
  [ ! -f "$AGENT_LOCK_DIR/ticket__T002363.json" ]
}

@test "T002363: die Fehlermeldung nennt das abgelehnte Argument" {
  # Auf die AGENT-LOCK-Zeile einschränken — der Worktree-Pfad enthält sonst selbst
  # Begriffe, die eine unqualifizierte Suche befriedigen würden.
  run bash -c "bash '$LOCK' claim ticket T002363 dev-flow-plan 2>&1 | grep '^AGENT-LOCK:' | grep -c \"dev-flow-plan\""
  [ "$output" != "0" ]
}

@test "T002363: check-and-claim lehnt ein positionales Argument ebenfalls ab" {
  run bash "$LOCK" check-and-claim ticket T002363 dev-flow-execute
  [ "$status" -ne 0 ]
  [ ! -f "$AGENT_LOCK_DIR/ticket__T002363.json" ]
}

# ── der gültige Aufruf bleibt unverändert ───────────────────────────────── #

@test "T002363: claim mit benannten Flags schreibt branch und label in den Lock" {
  run bash "$LOCK" claim ticket T002363 --label dev-flow-plan --branch chore/probe-T002363
  [ "$status" -eq 0 ]
  [ -f "$AGENT_LOCK_DIR/ticket__T002363.json" ]

  run bash -c "jq -r '.branch' '$AGENT_LOCK_DIR/ticket__T002363.json'"
  [ "$output" = "chore/probe-T002363" ]

  run bash -c "jq -r '.label' '$AGENT_LOCK_DIR/ticket__T002363.json'"
  [ "$output" = "dev-flow-plan" ]
}

@test "T002363: branch-scoped claim leitet branch weiterhin aus der id ab (T002267)" {
  # Regressionsschutz: bei --scope branch übergeben Aufrufer kein --branch; das Feld
  # muss trotzdem gefüllt sein, sonst greift der worktree+branch-Liveness-Fallback
  # in _reapable nicht.
  run bash "$LOCK" claim branch chore/probe-T002363 --label dev-flow-chore
  [ "$status" -eq 0 ]

  run bash -c "jq -r '.branch' '$AGENT_LOCK_DIR/branch__chore-probe-T002363.json'"
  [ "$output" = "chore/probe-T002363" ]
}

# ── T002513: Regel 0b (Worktree+Branch-Match) respektiert die Heartbeat-TTL ──#
#
# Regel 0b (T002204, Session-Resume) schuetzt einen Claim, sobald der Worktree existiert
# und auf dem im Lock vermerkten Branch steht — ohne Alters-/Heartbeat-Pruefung. Ein
# toter Halter mit intaktem Worktree (owner_sid + owner_pid tot, Heartbeat lange
# abgelaufen) gilt dadurch dauerhaft als "live" und blockiert den Worktree.
#
# Fix: 0b wird an die Heartbeat-TTL gekoppelt. Ein Resume erneuert den Heartbeat
# (Re-Claim/refresh schreiben heartbeat_at frisch), ein toter Halter nicht.

# Schreibt einen Lock mit totem SID+PID und passendem Worktree+Branch-Match in
# $AGENT_LOCK_DIR und gibt den Worktree-Pfad zurueck. <mode> = stale | fresh | none
# (none: Altformat ohne heartbeat_at-Feld).
_write_rule0b_lock() {
  local name="$1" mode="$2"
  local tmprepo; tmprepo="$(mktemp -d)"
  git -C "$tmprepo" init -q -b probe-branch
  git -C "$tmprepo" -c user.email=t@example.invalid -c user.name=t \
    commit -q --allow-empty -m init
  local now ttl stale
  now="$(date +%s)"; ttl="${AGENT_LOCK_TTL:-1800}"; stale=$(( now - ttl - 60 ))
  if [ "$mode" = "stale" ] || [ "$mode" = "fresh" ]; then
    local hb; [ "$mode" = "stale" ] && hb="$stale" || hb="$now"
    cat > "$AGENT_LOCK_DIR/$name.json" <<JSON
{
  "scope": "ticket",
  "id": "$name",
  "owner_sid": "99999999",
  "owner_pid": 999999,
  "label": "probe",
  "branch": "probe-branch",
  "worktree": "$tmprepo",
  "created_at": "$stale",
  "heartbeat_at": "$hb"
}
JSON
  else
    cat > "$AGENT_LOCK_DIR/$name.json" <<JSON
{
  "scope": "ticket",
  "id": "$name",
  "owner_sid": "99999999",
  "owner_pid": 999999,
  "label": "probe",
  "branch": "probe-branch",
  "worktree": "$tmprepo",
  "created_at": "$stale"
}
JSON
  fi
  # [T002502] .last-fetch-Marker: der erste reap in einem frischen Lock-Dir wuerde sonst
  # ein Netzwerk-Fetch ausloesen. Marker frisch anlegen => fetch uebersprungen.
  touch "$AGENT_LOCK_DIR/.last-fetch"
  printf '%s' "$tmprepo"
}

@test "T002513: reap entfernt Lock mit Worktree-Match bei abgelaufenem Heartbeat" {
  local wt; wt="$(_write_rule0b_lock ticket__T002513 stale)"
  run env AGENT_LOCK_DIR="$AGENT_LOCK_DIR" AGENT_LOCK_TTL=1800 \
    bash -c "cd '$wt' && bash '$LOCK' reap"
  local reaped=0; [ ! -f "$AGENT_LOCK_DIR/ticket__T002513.json" ] && reaped=1
  rm -rf "$AGENT_LOCK_DIR/ticket__T002513.json" "$wt"
  [ "$reaped" -eq 1 ] || { echo "reap liess Lock mit totem Halter + abgelaufenem Heartbeat stehen (Regel 0b ohne TTL)"; false; }
}

@test "T002513: reap loggt heartbeat-ttl fuer den entfernten Lock" {
  local wt; wt="$(_write_rule0b_lock ticket__T002513b stale)"
  run env AGENT_LOCK_DIR="$AGENT_LOCK_DIR" AGENT_LOCK_TTL=1800 \
    bash -c "cd '$wt' && bash '$LOCK' reap"
  local logged=0
  grep -q 'ticket__T002513b heartbeat-ttl' "$AGENT_LOCK_DIR/.reap.log" 2>/dev/null && logged=1
  rm -rf "$AGENT_LOCK_DIR/ticket__T002513b.json" "$wt"
  [ "$logged" -eq 1 ] || { echo ".reap.log enthaelt keinen heartbeat-ttl-Eintrag fuer T002513b"; false; }
}

@test "T002513: reap laesst Lock mit Worktree-Match und frischem Heartbeat stehen" {
  # Gegenprobe zur Resume-Semantik: der Worktree+Branch-Match MUSS einen Lock schuetzen,
  # solange der Heartbeat frisch ist — Regel 0b verliert ihre Schutzfunktion nicht.
  local wt; wt="$(_write_rule0b_lock ticket__T002513c fresh)"
  run env AGENT_LOCK_DIR="$AGENT_LOCK_DIR" AGENT_LOCK_TTL=1800 \
    bash -c "cd '$wt' && bash '$LOCK' reap"
  local survived=0; [ -f "$AGENT_LOCK_DIR/ticket__T002513c.json" ] && survived=1
  rm -rf "$AGENT_LOCK_DIR/ticket__T002513c.json" "$wt"
  [ "$survived" -eq 1 ] || { echo "reap hat Lock mit frischem Heartbeat abgeraeumt (Over-Reap)"; false; }
}

@test "T002513: reap laesst Altformat ohne heartbeat_at durch Regel 0b stehen" {
  # Altformat (prae-Heartbeat-Claims): kein heartbeat_at-Feld => Regel 0b bleibt voll
  # schuetzend, damit alte Locks nicht durch den TTL-Kopplungs-Fix abgeraeumt werden.
  local wt; wt="$(_write_rule0b_lock ticket__T002513d none)"
  run env AGENT_LOCK_DIR="$AGENT_LOCK_DIR" AGENT_LOCK_TTL=1800 \
    bash -c "cd '$wt' && bash '$LOCK' reap"
  local survived=0; [ -f "$AGENT_LOCK_DIR/ticket__T002513d.json" ] && survived=1
  rm -rf "$AGENT_LOCK_DIR/ticket__T002513d.json" "$wt"
  [ "$survived" -eq 1 ] || { echo "reap hat Altformat-Lock ohne heartbeat_at abgeraeumt"; false; }
}
