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
