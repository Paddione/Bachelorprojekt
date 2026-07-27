#!/usr/bin/env bats
# SSOT: openspec/specs/factory-reclaim-lock-respect.md
# Ticket: T002267 — Folge aus dem T002255/T002256-Zyklus.
#
# Der Factory-Dispatcher greift gestagte Tickets, obwohl eine interaktive Session sie
# haelt. Der vorhandene Sentinel (dispatcher.js: Regex auf das Label 'interactive-worker'
# + maxParallel-1) ist ticket-unabhaengig UND tot, weil dev-flow-plan/-execute mit den
# Labels 'dev-flow-plan'/'dev-flow-execute' claimen.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  DISPATCHER="$REPO_ROOT/scripts/factory/dispatcher.js"
  QUEUE="$REPO_ROOT/scripts/factory/queue.sh"
  TICKET_SH="$REPO_ROOT/scripts/ticket.sh"
  RECLAIM="$REPO_ROOT/scripts/ticket-reclaim.sh"
  AGENT_LOCK="$REPO_ROOT/scripts/agent-lock.sh"
  WATCHDOG="$REPO_ROOT/scripts/factory/watchdog.sh"
}

# ─────────────────────────────────────────────────────────────────────────────
# Dispatcher — ticket-scoped Lock-Respekt
# ─────────────────────────────────────────────────────────────────────────────

@test "T002267-D1: dispatcher fragt agent-lock pro Ticket (check ticket)" {
  run grep -nE "agent-lock\.sh['\"],\s*'check'|'check',\s*'ticket'|check.*ticket" "$DISPATCHER"
  [ "$status" -eq 0 ]
}

@test "T002267-D1: alter interactive-worker-Regex ist entfernt" {
  run grep -n "interactive-worker" "$DISPATCHER"
  [ "$status" -ne 0 ]
}

@test "T002267-D1: pauschaler maxParallel-Abzug ist entfernt" {
  run grep -nE "maxParallel = Math\.max\(1, launches\.length - 1\)" "$DISPATCHER"
  [ "$status" -ne 0 ]
}

@test "T002267-D1: uebersprungene Tickets werden geloggt" {
  # Ein stiller Skip laesst das Ticket als verschwunden erscheinen.
  run grep -nEi "skip.*(lock|claim|held)|held.*skip" "$DISPATCHER"
  [ "$status" -eq 0 ]
}

# Regressionswaechter: der Lock-Check darf NICHT gegen den stale-Fall blind sein.
# agent-lock cmd_check meldet fuer einen reapable Lock 'free' — genau darauf
# stuetzt sich der Dispatcher, damit eine tote Session die Queue nicht aushungert.
@test "T002267-D1: agent-lock check meldet 'free' fuer fehlenden Lock" {
  run bash "$AGENT_LOCK" check ticket T009999
  [ "$status" -eq 0 ]
  [[ "$output" == *"free"* ]]
}

# ─────────────────────────────────────────────────────────────────────────────
# queue.sh — Sichtbarkeit bleibt (Regressionswaechter)
# ─────────────────────────────────────────────────────────────────────────────

@test "T002267-Q1: queue.sh selektiert weiterhin plan_staged (Sichtbarkeit)" {
  run grep -n "plan_staged" "$QUEUE"
  [ "$status" -eq 0 ]
}

@test "T002267-Q1: queue.sh filtert NICHT selbst nach agent-lock" {
  # Der Skip gehoert in den Dispatcher, nicht in die Queue — sonst verschwindet
  # das Ticket aus der Sicht des Nutzers.
  run grep -n "agent-lock" "$QUEUE"
  [ "$status" -ne 0 ]
}

# ─────────────────────────────────────────────────────────────────────────────
# reclaim
# ─────────────────────────────────────────────────────────────────────────────

@test "T002267-R1: scripts/ticket-reclaim.sh existiert und ist ausfuehrbar" {
  [ -f "$RECLAIM" ]
  [ -x "$RECLAIM" ]
}

@test "T002267-R1: ticket.sh kennt das reclaim-Kommando" {
  run grep -nE "reclaim\)" "$TICKET_SH"
  [ "$status" -eq 0 ]
}

@test "T002267-R1: ticket.sh listet reclaim in der Commands-Zeile" {
  # NICHT unqualifiziert gegen $output matchen: die Usage-Zeile gibt $0 aus, und
  # der Worktree-Pfad (.worktrees/factory-reclaim-lock-respect/...) enthaelt den
  # Suchbegriff bereits — der Test waere dauerhaft gruen, ohne etwas zu pruefen.
  # Deshalb gezielt auf die "Commands:"-Zeile einschraenken.
  run bash -c "bash '$TICKET_SH' 2>&1 | grep '^Commands:' | grep -c 'reclaim'"
  [ "$output" != "0" ]
}

@test "T002267-R1: ticket.sh dispatcht reclaim an das eigene Skript" {
  # ticket.sh steht auf der s1.ignore-Liste (862 Zeilen) — die Logik gehoert
  # nicht zusaetzlich hinein.
  run grep -n "ticket-reclaim.sh" "$TICKET_SH"
  [ "$status" -eq 0 ]
}

@test "T002267-R2: reclaim setzt plan_staged, nicht blocked" {
  run grep -n "plan_staged" "$RECLAIM"
  [ "$status" -eq 0 ]
  run grep -nE "status.*=.*'?blocked'?|--status blocked" "$RECLAIM"
  [ "$status" -ne 0 ]
}

@test "T002267-R2: reclaim gibt den pipeline_slot frei" {
  run grep -nE "release-slot|slots\.sh release" "$RECLAIM"
  [ "$status" -eq 0 ]
}

@test "T002267-R2: reclaim claimt das Ticket fuer die aufrufende Session" {
  run grep -nE "agent-lock\.sh (claim|check-and-claim) ticket" "$RECLAIM"
  [ "$status" -eq 0 ]
}

@test "T002267-R3: reclaim prueft Worker-Liveness ueber updated_at" {
  run grep -n "updated_at" "$RECLAIM"
  [ "$status" -eq 0 ]
}

@test "T002267-R3: reclaim nutzt dieselbe Stale-Schwelle wie der watchdog" {
  # watchdog.sh nutzt STALE_MIN; reclaim muss dieselbe Semantik teilen, sonst
  # widersprechen sich die beiden Urteile ueber "Worker lebt".
  run grep -nE "STALE_MIN|FACTORY_STALE" "$RECLAIM"
  [ "$status" -eq 0 ]
  run grep -nE "STALE_MIN" "$WATCHDOG"
  [ "$status" -eq 0 ]
}

@test "T002267-R3: reclaim kennt --force" {
  run grep -nE '\-\-force' "$RECLAIM"
  [ "$status" -eq 0 ]
}

@test "T002267-R3: reclaim verweigert ohne --force bei lebendem Worker" {
  # Es muss einen Abbruchpfad mit Exit != 0 geben, der Slot/Status/Alter nennt.
  run grep -nEi "exit 1|return 1" "$RECLAIM"
  [ "$status" -eq 0 ]
  run grep -nEi "force" "$RECLAIM"
  [ "$status" -eq 0 ]
}

@test "T002267-R1: agent-lock.sh bleibt unveraendert (check-Kontrakt genuegt)" {
  # cmd_check liefert bereits free/mine/held mit Exit 0/0/3 und ist stale-sicher.
  run grep -nE '^\s*echo "free"; return 0|echo "held"; cat "\$f"; return 3' "$AGENT_LOCK"
  [ "$status" -eq 0 ]
}
