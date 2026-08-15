#!/usr/bin/env bats
# tests/spec/ticket-ops/wave1-state-refetch.bats
# SSOT: openspec/specs/ticket-ops.md
# Fix: T006295
#
# Guard gegen stale Wave-1-Dispatches in ticket-ops: Die Dispatch-Prozedur (§Step 3.6
# in .claude/skills/references/ticket-ops-procedures.md) MUSS vor der Claim-Schleife
# den Ticket-Zustand jedes Wave-1-Tickets re-fetchen (status + FACTORY-PLAN-REF-Kommentar)
# und nur Tickets dispatchen, die seit dem Masterplan-Snapshot unveraendert sind.
#
# Pruefmodus (T002448-M4): Quelltext-Muster — Dokumentationskonvention, das Ergebnis
# manifestiert sich ausschliesslich im Prozedurtext (Ausnahme: grep ist hier das
# angemessene Mittel). Die Assertions haengen an semantischen Identifiers
# (FACTORY-PLAN-REF, STALE-STATE, Status-Spalte), nicht an Formulierungen (T002716).

setup() {
  # Diese Datei liegt in tests/spec/ticket-ops/ — drei Ebenen bis zur Repo-Wurzel.
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  PROC="$REPO/.claude/skills/references/ticket-ops-procedures.md"
}

# Extrahiert die Step-3.6-Sektion (letzte ###-Sektion der Datei) als Text.
step36_section() {
  sed -n '/^### Step 3.6/,/^## /p' "$PROC"
}

@test "Positiv-Anker: Step-3.6-Sektion existiert und ist nicht leer (T002356-M1)" {
  [ -f "$PROC" ]
  run step36_section
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | grep -c .)" -gt 5 ]
}

@test "Step 3.6: Ticket-State-Recheck ist vor der Claim-Schleife dokumentiert" {
  run step36_section
  # Re-Fetch-Query ist gegen die reale Schema-Spalte `status` und den
  # stage-plan-Marker FACTORY-PLAN-REF in ticket_comments erdged.
  printf '%s' "$output" | grep -qF 'tickets.tickets' || { echo "keine tickets.tickets-Referenz in Step 3.6"; return 1; }
  printf '%s' "$output" | grep -qF 'status' || { echo "kein status-Feld im Recheck"; return 1; }
  printf '%s' "$output" | grep -qF 'FACTORY-PLAN-REF' || { echo "kein FACTORY-PLAN-REF-Marker im Recheck"; return 1; }
}

@test "Step 3.6: STALE-STATE-Tickets werden vom Dispatch ausgeschlossen" {
  run step36_section
  printf '%s' "$output" | grep -qF 'STALE-STATE' || { echo "keine STALE-STATE-Meldung in Step 3.6"; return 1; }
  # Skip-Regel: nur seit dem Snapshot unveraenderte Tickets werden dispatched.
  printf '%s' "$output" | grep -qE 'unveraendert.*dispatch|dispatch.*unveraendert' \
    || { echo "keine nur-unveraendert-dispatchen-Regel in Step 3.6"; return 1; }
}
