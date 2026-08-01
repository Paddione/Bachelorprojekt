#!/usr/bin/env bats
# SSOT: openspec/specs/factory-reclaim-lock-respect.md
# Ticket: T002267 — Folge aus dem T002255/T002256-Zyklus.
#
# BEFUND (korrigiert gegenueber dem ersten Planentwurf): der ticket-scoped
# Lock-Check im Dispatcher EXISTIERT bereits (dispatcher-prep.sh:82, "T000510";
# die frueher hier ebenfalls genannten factory-prep-runner.sh und
# factory-prep-bridge.sh sind seit T002324 als toter Code geloescht).
# Er griff bei T002255 trotzdem nicht, weil agent-lock.sh einen Lock der
# LEBENDEN Session faelschlich als reapable einstuft und `check` dann `free`
# meldet. Zwei Defekte in _reapable:
#
#   A) _sid_alive prueft numerische SIDs per `pgrep -s`. Die Claude-Session-SID
#      ist numerisch, aber pgrep findet sie nicht -> SID gilt als tot. Ein
#      LEBENDER owner_pid wird nirgends als Schutz gewertet (Zeile 144-151
#      reapt nur bei totem PID), also faellt der Lock auf sid-dead durch.
#   B) branch-scoped Locks haben branch:"" (der Name steht in `id`), weshalb der
#      Worktree+Branch-Fallback (T002204) fuer sie prinzipiell nie greift.
#
# Die Tests unten pruefen VERHALTEN, nicht Dateiinhalt: agent-lock.sh ist ueber
# AGENT_LOCK_DIR + AGENT_LOCK_FAKE_ALIVE isoliert testbar.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  AGENT_LOCK="$REPO_ROOT/scripts/agent-lock.sh"
  TICKET_SH="$REPO_ROOT/scripts/ticket.sh"
  RECLAIM="$REPO_ROOT/scripts/ticket-reclaim.sh"

  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"
  # Keine SID gilt als lebend -> erzwingt die Fallback-Pfade in _reapable.
  export AGENT_LOCK_FAKE_ALIVE=""
}

# Schreibt eine Lock-Datei mit kontrollierten Feldern.
# usage: _mk_lock <scope> <id> <sid> <pid> <worktree> <branch> <age_seconds>
_mk_lock() {
  local scope="$1" id="$2" sid="$3" pid="$4" wt="$5" br="$6" age="$7"
  local safe ts
  safe="$(printf '%s' "$id" | tr '/ ' '--')"
  ts=$(( $(date +%s) - age ))
  cat > "$AGENT_LOCK_DIR/${scope}__${safe}.json" <<EOF
{
  "scope": "$scope",
  "id": "$id",
  "owner_sid": "$sid",
  "owner_pid": "$pid",
  "tool": "claude",
  "label": "dev-flow-plan",
  "worktree": "$wt",
  "branch": "$br",
  "ticket": "",
  "host": "testhost",
  "created_at": "$ts",
  "heartbeat_at": "$ts"
}
EOF
}

# ─────────────────────────────────────────────────────────────────────────────
# Defekt A — ein lebender owner_pid muss den Lock schuetzen
# ─────────────────────────────────────────────────────────────────────────────

# Kernfall: SID gilt als tot, Worktree existiert (damit worktree-missing nicht
# greift), branch leer (damit der T002204-Fallback nicht greift), Claim aelter
# als die Grace-Periode — aber der owner_pid LEBT. Heute meldet check 'free',
# die Factory greift zu. Erwartet: 'held'.
@test "T002267-A1: lebender owner_pid schuetzt den Lock vor sid-dead-Reap" {
  # Use /nonexistent/worktree so the worktree-match heuristic (T002392-M1)
  # doesn't short-circuit the PID check.
  _mk_lock ticket T009001 999999 "$$" "/nonexistent/worktree" "" 86400
  run bash "$AGENT_LOCK" check ticket T009001
  [ "$status" -eq 3 ]
  [[ "$output" == *"held"* ]]
}

@test "T002267-A1: toter owner_pid + tote SID bleibt reapable (free)" {
  # Gegenprobe — der Fix darf nicht pauschal alles schuetzen.
  # PID 2^22 existiert praktisch nie (ueber dem ueblichen pid_max).
  _mk_lock ticket T009002 999999 4194303 "$REPO_ROOT" "" 86400
  run bash "$AGENT_LOCK" check ticket T009002
  [ "$status" -eq 0 ]
  [[ "$output" == *"free"* ]]
}

@test "T002267-A1: lebender owner_pid schuetzt auch bei fehlendem Worktree" {
  # worktree-missing (Zeile 152) darf einen lebenden Prozess nicht ueberstimmen.
  _mk_lock ticket T009003 999999 "$$" "/nonexistent/worktree" "" 86400
  run bash "$AGENT_LOCK" check ticket T009003
  [ "$status" -eq 3 ]
}

# ─────────────────────────────────────────────────────────────────────────────
# Defekt B — branch-scoped Claims muessen ihr branch-Feld tragen
# ─────────────────────────────────────────────────────────────────────────────

@test "T002267-B1: claim branch schreibt das branch-Feld (nicht leer)" {
  run bash "$AGENT_LOCK" claim branch "fix/demo-T009004" --worktree "$REPO_ROOT" --label test
  [ "$status" -eq 0 ]
  run grep -E '"branch":\s*"fix/demo-T009004"' "$AGENT_LOCK_DIR/branch__fix-demo-T009004.json"
  [ "$status" -eq 0 ]
}

@test "T002267-B1: explizites --branch ueberschreibt die id nicht faelschlich" {
  run bash "$AGENT_LOCK" claim branch "fix/demo-T009005" --worktree "$REPO_ROOT" --branch "fix/demo-T009005" --label test
  [ "$status" -eq 0 ]
  run grep -E '"branch":\s*"fix/demo-T009005"' "$AGENT_LOCK_DIR/branch__fix-demo-T009005.json"
  [ "$status" -eq 0 ]
}

# ─────────────────────────────────────────────────────────────────────────────
# Regressionswaechter — der vorhandene Guard bleibt, wie er ist
# ─────────────────────────────────────────────────────────────────────────────

# [T002324] Die beiden Waechter fuer factory-prep-runner.sh und
# factory-prep-bridge.sh sind entfallen: beide Skripte waren toter Code (keine
# einzige Referenz ausser Kommentaren) und wurden geloescht. Der T000510-Guard,
# den sie absicherten, lebt weiterhin in dispatcher-prep.sh — dafuer bleibt der
# Test unten. `vda.sh factory-prep` ist davon unberuehrt; es dispatcht auf
# scripts/vda/factory-prep.sh, eine eigenstaendige Datei.

@test "T002267-G1: check meldet weiterhin 'free' fuer einen fehlenden Lock" {
  run bash "$AGENT_LOCK" check ticket T009999
  [ "$status" -eq 0 ]
  [[ "$output" == *"free"* ]]
}

# ─────────────────────────────────────────────────────────────────────────────
# reclaim
# ─────────────────────────────────────────────────────────────────────────────

@test "T002267-R1: scripts/ticket-reclaim.sh existiert und ist ausfuehrbar" {
  [ -f "$RECLAIM" ]
  [ -x "$RECLAIM" ]
}

@test "T002267-R1: ticket.sh kennt das reclaim-Kommando" {
  run grep -nE "^\s*reclaim\)" "$TICKET_SH"
  [ "$status" -eq 0 ]
}

@test "T002267-R1: ticket.sh listet reclaim in der Commands-Zeile" {
  # NICHT unqualifiziert gegen $output matchen: die Usage-Zeile gibt $0 aus, und
  # der Worktree-Pfad (.worktrees/factory-reclaim-lock-respect/...) enthaelt den
  # Suchbegriff bereits — der Test waere dauerhaft gruen, ohne etwas zu pruefen.
  run bash -c "bash '$TICKET_SH' 2>&1 | grep '^Commands:' | grep -c 'reclaim'"
  [ "$output" != "0" ]
}

@test "T002267-R1: ticket.sh dispatcht reclaim an das eigene Skript" {
  run grep -n "ticket-reclaim.sh" "$TICKET_SH"
  [ "$status" -eq 0 ]
}

@test "T002267-R2: reclaim setzt plan_staged, nicht blocked" {
  run grep -n "plan_staged" "$RECLAIM"
  [ "$status" -eq 0 ]
  run grep -nE "status blocked|status='blocked'" "$RECLAIM"
  [ "$status" -ne 0 ]
}

@test "T002267-R2: reclaim gibt den pipeline_slot frei" {
  run grep -nE "release-slot|slots\.sh release" "$RECLAIM"
  [ "$status" -eq 0 ]
}

@test "T002267-R2: reclaim claimt das Ticket fuer die aufrufende Session" {
  # Toleriert Quoting im Pfad ("$HERE/agent-lock.sh" claim ticket ...).
  run grep -nE "agent-lock\.sh\"? (claim|check-and-claim) ticket" "$RECLAIM"
  [ "$status" -eq 0 ]
}

@test "T002267-R3: reclaim prueft Worker-Liveness ueber updated_at" {
  run grep -n "updated_at" "$RECLAIM"
  [ "$status" -eq 0 ]
}

@test "T002267-R3: reclaim kennt --force" {
  run grep -nE '\-\-force' "$RECLAIM"
  [ "$status" -eq 0 ]
}

@test "T002267-R3: reclaim ohne Ticket-ID schlaegt fehl statt still zu laufen" {
  run bash "$RECLAIM"
  [ "$status" -ne 0 ]
}
