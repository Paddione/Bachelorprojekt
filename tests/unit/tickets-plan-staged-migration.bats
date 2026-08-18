#!/usr/bin/env bats
# Offline-safe: prüft den Migrations-Quelltext in tickets/migrations.ts und die
# Status-Reihenfolge in tickets/status.ts (TICKET_STATUSES, SSOT seit T007955).
# Stellt sicher, dass 'plan_staged' im Status-CHECK steht (der CHECK wird seit
# T007955 dynamisch aus der SSOT gebaut) und das Muster idempotent (drop+add) ist.
# Kein Cluster / keine DB nötig.
# As of T001155 (G-RH01 Batch 2), the status-CHECK migration lives in
# tickets/migrations.ts. #2114 (G-CQ07) moved initTicketsSchema() into
# tickets-schema.ts, which must still call applyLegacyMigrations(pool) so the
# migration gets installed.

setup() {
  SRC="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets-schema.ts"
  TMIG="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets/migrations.ts"
  STATUSES="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets/statuses.json"
}

# Seit T007955 baut migrations.ts den Status-CHECK aus TICKET_STATUSES statt aus
# einem SQL-Literal. Die Statusliste selbst ist damit die pruefbare Quelle — die
# beiden folgenden Tests pruefen sie, nicht mehr den erzeugten SQL-Text.
#
# Die frueheren Fassungen greppten dafuer in migrations.ts. Das war doppelt
# unbrauchbar: Der Reihenfolge-Test fiel, weil das Literal dort nicht mehr
# existiert, und der Enthalten-Test BESTAND, weil 'plan_staged' in zwei
# Kommentarzeilen vorkommt — er haette den Verlust des Status nie bemerkt.

@test "tickets: plan_staged ist ein gueltiger Status (SSOT statuses.json)" {
  run jq -e 'index("plan_staged") != null' "$STATUSES"
  [ "$status" -eq 0 ]
}

@test "tickets: status-Migration ist idempotent (DROP CONSTRAINT IF EXISTS)" {
  run grep -F "DROP CONSTRAINT IF EXISTS tickets_status_check" "$TMIG"
  [ "$status" -eq 0 ]
}

@test "tickets: plan_staged steht zwischen planning und backlog im CHECK" {
  # T007955: der CHECK wird seitdem aus TICKET_STATUSES (status.ts, SSOT) gebaut —
  # die Reihenfolge lebt dort als Tuple-Literal, nicht mehr als SQL-Literal in
  # migrations.ts. Semantik pruefen: 'plan_staged' kommt nach 'planning' und vor
  # 'backlog' vor (awk-Flags, kein Source-Grep aufs Migrations-SQL).
  STS="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets/status.ts"
  run awk -v p=0 -v s=0 -v b=0 \
    '/'"'"'planning'"'"'/{p=1} /'"'"'plan_staged'"'"'/{s=p} /'"'"'backlog'"'"'/{b=s} END{exit !(p && s && b)}' "$STS"
  [ "$status" -eq 0 ]
}

@test "tickets: plan_staged steht zwischen planning und backlog (SSOT statuses.json)" {
  # Zweite Ebene, absichtlich neben dem Test darueber: jener prueft das
  # Tuple-Literal in status.ts (Compile-Time-Kontrakt), dieser die JSON-Datei, aus
  # der status.ts zur Laufzeit liest. Driften die beiden auseinander, faellt das
  # sonst niemandem auf — die Reihenfolge im Tuple ist reine Typ-Deklaration.
  #
  # Positiv-Anker: erst belegen, dass alle drei Status ueberhaupt vorhanden sind —
  # sonst bestuende der Reihenfolge-Vergleich bei fehlenden Eintraegen vakuos.
  run jq -e 'index("planning") != null and index("plan_staged") != null and index("backlog") != null' "$STATUSES"
  [ "$status" -eq 0 ]

  run jq -e 'index("planning") < index("plan_staged") and index("plan_staged") < index("backlog")' "$STATUSES"
  [ "$status" -eq 0 ]
}

@test "tickets: der Status-CHECK wird aus TICKET_STATUSES gebaut, nicht aus einem Literal" {
  # Die Zusicherung aus T007955: DB-Constraint und TypeScript-Union koennen nicht
  # driften, weil beide aus derselben Liste stammen. Genau diese Umstellung hat den
  # frueheren Literal-Test gebrochen — sie gehoert deshalb selbst unter einen Guard.
  run grep -F "TICKET_STATUSES.map" "$TMIG"
  [ "$status" -eq 0 ]
}

@test "tickets-schema.ts calls applyLegacyMigrations(pool) (regression guard for the split)" {
  # Without this call, the status-CHECK migration above would never install.
  run grep -E "applyLegacyMigrations\([[:space:]]*pool[[:space:]]*\)" "$SRC"
  [ "$status" -eq 0 ]
}

@test "status.ts ist die Status-SSOT: exportiert alle 11 kanonischen Status (T007955)" {
  STS="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets/status.ts"
  for s in triage planning plan_staged backlog in_progress in_review qa_review blocked awaiting_deploy done archived; do
    run grep -F "$s" "$STS"
    [ "$status" -eq 0 ]
  done
}

@test "status.ts exportiert SSOT-Surface (TICKET_STATUSES, VALID_STATUSES, isValidStatus, TicketStatus)" {
  STS="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets/status.ts"
  for pat in "export const TICKET_STATUSES" "export const VALID_STATUSES" "export function isValidStatus" "export type TicketStatus"; do
    run grep -F "$pat" "$STS"
    [ "$status" -eq 0 ]
  done
}

@test "Consumers importieren aus status.ts statt lokaler Duplikate (T007955)" {
  ADMIN="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets/admin.ts"
  TRANS="$BATS_TEST_DIRNAME/../../components/website/src/lib/tickets/transition.ts"
  COCKPIT_DB="$BATS_TEST_DIRNAME/../../components/website/src/lib/sdlc/tickets/cockpit-db.ts"
  ROUTE="$BATS_TEST_DIRNAME/../../components/website/src/pages/sdlc/api/cockpit/ticket-status.ts"
  run grep -F "from './status'" "$ADMIN"
  [ "$status" -eq 0 ]
  run grep -F "from './status'" "$TRANS"
  [ "$status" -eq 0 ]
  run grep -F "tickets/status" "$COCKPIT_DB"
  [ "$status" -eq 0 ]
  run grep -F "lib/tickets/status" "$ROUTE"
  [ "$status" -eq 0 ]
}
