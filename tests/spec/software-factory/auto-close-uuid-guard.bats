#!/usr/bin/env bats
# tests/spec/software-factory/auto-close-uuid-guard.bats — T015010
#
# Die Post-Merge-Closure (scripts/factory/auto-close-merged.sh) loeste den
# [T-NNNNNN]-Tag im PR-Titel blind per external_id auf. Nach dem Loesch-/
# Reuse-Vorfall T014936 (Incident T015005) schloss sie dadurch das FALSCHE
# (neu herausgegebene) Ticket. Diese Tests sichern den Identity-Guard:
# Pre-Merge-Anker (ticket_links kind='pr', ticket_plans branch/pr_number)
# muessen die UUID der Kandidaten-Zeile bestaetigen, sonst wird geskippt.

load '_sf_common'

setup() {
  _sf_setup
  SCRIPT="$REPO_ROOT/scripts/factory/auto-close-merged.sh"
}

@test "T015010: Closure-Lookup joint Pre-Merge-Anker (ticket_links kind='pr' + ticket_plans)" {
  [ -f "$SCRIPT" ]
  grep -q "tickets.ticket_links" "$SCRIPT"
  grep -q "kind = 'pr' AND pr_number" "$SCRIPT"
  grep -q "tickets.ticket_plans" "$SCRIPT"
  grep -q "p.branch = '\$branch' OR p.pr_number" "$SCRIPT"
}

@test "T015010: Anker werden per UUID gegen die Kandidaten-Zeile geprueft (nicht per external_id)" {
  [ -f "$SCRIPT" ]
  # Der EXISTS-Vergleich läuft über die Ticket-UUID (c.id), nicht die external_id
  grep -q "a.ticket_uuid = c.id" "$SCRIPT"
}

@test "T015010: Identity-Guard blockiert bei Anker-Mismatch (reine Entscheidungsfunktion)" {
  run bash -c 'source "'"$SCRIPT"'"; identity_guard_blocks 2 f'
  [ "$status" -eq 0 ]  # blockieren
  run bash -c 'source "'"$SCRIPT"'"; identity_guard_blocks 1 f'
  [ "$status" -eq 0 ]  # blockieren
  run bash -c 'source "'"$SCRIPT"'"; identity_guard_blocks "" f'
  [ "$status" -eq 0 ]  # blockieren (leerer Count ist nicht "keine Anker geprueft")
}

@test "T015010: Identity-Guard erlaubt Closure bei UUID-Konsens oder fehlenden Ankern" {
  run bash -c 'source "'"$SCRIPT"'"; identity_guard_blocks 3 t'
  [ "$status" -eq 1 ]  # Anker bestaetigt → weiter
  run bash -c 'source "'"$SCRIPT"'"; identity_guard_blocks 0 f'
  [ "$status" -eq 1 ]  # keine Anker (Legacy-Pfad, z.B. manueller Chore) → weiter
}

@test "T015010: Guard sitzt VOR dem Closure-Schreibzugriff (update-status)" {
  [ -f "$SCRIPT" ]
  local guard_line close_line
  guard_line=$(grep -n 'identity_guard_blocks "\$anchor_count"' "$SCRIPT" | head -1 | cut -d: -f1)
  close_line=$(grep -n 'update-status.*--status.*done' "$SCRIPT" | head -1 | cut -d: -f1)
  [ -n "$guard_line" ] || { echo "FAIL: Identity-Guard-Aufruf fehlt"; false; }
  [ -n "$close_line" ] || { echo "FAIL: update-status-Aufruf fehlt"; false; }
  [ "$guard_line" -lt "$close_line" ] || { echo "FAIL: Guard muss VOR dem Closure-Schreibzugriff liegen"; false; }
}

@test "T015010: Mismatch-Skip meldet ID-Reuse-Verdacht mit Incident-Referenz" {
  [ -f "$SCRIPT" ]
  grep -q 'NICHT geschlossen — Identity-Guard' "$SCRIPT"
  grep -q 'T015005' "$SCRIPT"
}

# [T015670] Spec-Gap-Schließung (Change closure-identity-guard): die beiden
# folgenden Verhalten sind im Delta-Spec beschrieben, aber bislang ungetestet.

@test "T015010: Konsens-Kantfall — Match-Flag ohne Anker blockiert nicht" {
  # anchor_count=0 ist der Legacy-Pfad (z.B. manueller Chore ohne Plan/Link);
  # der Guard darf dort unabhängig vom Match-Flag weitermachen.
  run bash -c 'source "'"$SCRIPT"'"; identity_guard_blocks 0 t'
  [ "$status" -eq 1 ]  # keine Anker → weiter, auch bei anchor_match='t'
}

@test "T015010: Terminal-Status-Skip (done/archived) läuft VOR dem Identity-Guard" {
  # Struktureller Fakt wie in "Guard sitzt VOR dem Closure-Schreibzugriff":
  # er manifestiert sich ausschließlich in der Quellreihenfolge. Positionen
  # verifiziert gegen main (T015670): done|archived=223, Guard=232.
  [ -f "$SCRIPT" ]
  local term_line guard_line
  term_line=$(grep -n 'done|archived' "$SCRIPT" | head -1 | cut -d: -f1)
  guard_line=$(grep -n 'identity_guard_blocks "\$anchor_count"' "$SCRIPT" | head -1 | cut -d: -f1)
  [ -n "$term_line" ] || { echo "FAIL: Terminal-Status-Check fehlt"; false; }
  [ -n "$guard_line" ] || { echo "FAIL: Identity-Guard-Aufruf fehlt"; false; }
  [ "$term_line" -lt "$guard_line" ] || { echo "FAIL: Terminal-Skip muss VOR dem Guard liegen"; false; }
}
