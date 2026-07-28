#!/usr/bin/env bats
# T002331 — Schema-Diät: ai_question/human_answer/scope wurden aus
# tickets.tickets zurückgebaut (Code + DDL-Migration). Diese Datei prüft,
# dass keine Referenz auf die entfernten Spalten im Website-Code übrig
# bleibt und dass die neue DROP-COLUMN-Migration existiert und die
# richtigen drei Spalten nennt — nicht mehr, nicht weniger.

setup() {
  REPO="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "grilling_answers (bewusst alive belassene Spalte) ist weiterhin im Code referenziert — Positiv-Anker" {
  # Beweist, dass der Grep-Scope unten nicht vakuos ist: würde admin.ts aus
  # Versehen leer sein oder der Suchpfad falsch, würde auch dieser Fund auf
  # 0 fallen und den Test rot machen, statt die Negativ-Aussage trivial
  # wahr werden zu lassen.
  run grep -rl "grilling_answers" "$REPO/website/src/lib/tickets/admin.ts"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "ai_question / human_answer sind aus dem Website-Code entfernt" {
  run grep -rln "ai_question\|human_answer\|aiQuestion\|humanAnswer" \
    "$REPO/website/src/lib/tickets/admin.ts" \
    "$REPO/website/src/lib/tickets/admin.test.ts" \
    "$REPO/website/src/pages/api/admin/tickets/[id].ts"
  [ "$status" -eq 1 ]
}

@test "tickets.tickets.scope ist aus migrations.ts entfernt (pr_events.scope bleibt unangetastet)" {
  run grep -n "ADD COLUMN IF NOT EXISTS scope" "$REPO/website/src/lib/tickets/migrations.ts"
  [ "$status" -eq 1 ]

  # Positiv-Anker: pr_events.scope (andere Tabelle) muss unverändert bleiben.
  run grep -n "scope        TEXT," "$REPO/website/src/lib/tickets/tables/tickets.ts"
  [ "$status" -eq 0 ]
}

@test "neue Migration droppt genau ai_question, human_answer, scope — nicht mehr" {
  MIGRATION="$REPO/scripts/migrations/2026-07-28-schema-diaet-T002331.sql"
  [ -f "$MIGRATION" ]

  run grep -c '^ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS' "$MIGRATION"
  [ "$status" -eq 0 ]
  [ "$output" -eq 3 ]

  run grep -q 'DROP COLUMN IF EXISTS ai_question;' "$MIGRATION"
  [ "$status" -eq 0 ]
  run grep -q 'DROP COLUMN IF EXISTS human_answer;' "$MIGRATION"
  [ "$status" -eq 0 ]
  run grep -q 'DROP COLUMN IF EXISTS scope;' "$MIGRATION"
  [ "$status" -eq 0 ]
}
