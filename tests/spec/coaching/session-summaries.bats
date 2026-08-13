#!/usr/bin/env bats
# tests/spec/coaching/session-summaries.bats
# T002653 — Session-Zusammenfassungen automatisch per LLM erstellen.
#
# Pruefmodus: strukturell. Das Ergebnis der Feature-Existenz manifestiert sich
# ausschliesslich im Quelltext (Lib-Funktionen, API-Endpoint, Migration, gemountete
# Komponente) — daher grep-basierte Assertions, dokumentiert im Header wie
# tests/spec/coaching-sessions-polish-guide.bats. Verhaltenslogik wird separat in
# website/src/lib/coaching-summary.test.ts geprueft.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}" && git rev-parse --show-toplevel)"
  WEB="$REPO_ROOT/website/src"
}

@test "summary lib exports buildSummaryInput and generateSessionSummary" {
  [ -f "$WEB/lib/coaching-summary.ts" ]
  run grep -qE "export (async )?function (buildSummaryInput|generateSessionSummary)" "$WEB/lib/coaching-summary.ts"
  [ "$status" -eq 0 ]
}

@test "summary input is built from ai_response and coach_notes of all steps" {
  # Positiv-Anker: beide Quellspalten muessen im Input-Bau vorkommen, sonst waere
  # die Zusammenfassung nur ein Teil der Session.
  run grep -qF "aiResponse" "$WEB/lib/coaching-summary.ts"
  [ "$status" -eq 0 ]
  run grep -qF "coachNotes" "$WEB/lib/coaching-summary.ts"
  [ "$status" -eq 0 ]
}

@test "summary endpoint exists with admin auth and no-provider 503" {
  [ -f "$WEB/pages/api/admin/coaching/sessions/[id]/summary.ts" ]
  run grep -qF "getSession(request.headers.get('cookie'))" "$WEB/pages/api/admin/coaching/sessions/[id]/summary.ts"
  [ "$status" -eq 0 ]
  run grep -qF "isAdmin(session)" "$WEB/pages/api/admin/coaching/sessions/[id]/summary.ts"
  [ "$status" -eq 0 ]
  run grep -qF "status: 503" "$WEB/pages/api/admin/coaching/sessions/[id]/summary.ts"
  [ "$status" -eq 0 ]
}

@test "summary generation uses the DSGVO-guarded session-agent path" {
  # Positiv-Anker: ohne den Agenten-Pfad gaebe es nichts, das der Guard schuetzt.
  run grep -qF "createSessionAgent" "$WEB/lib/coaching-summary.ts"
  [ "$status" -eq 0 ]
  run grep -qF "getActiveProvider" "$WEB/lib/coaching-summary.ts"
  [ "$status" -eq 0 ]
}

@test "summary migration adds llm_summary columns to coaching.sessions" {
  run grep -qF "llm_summary" "$REPO_ROOT/website/src/db/migrations/20260813_coaching_session_summary.sql"
  [ "$status" -eq 0 ]
  run grep -qF "llm_summary_at" "$REPO_ROOT/website/src/db/migrations/20260813_coaching_session_summary.sql"
  [ "$status" -eq 0 ]
}

@test "summary is idempotent: existing llm_summary_at without force skips the LLM" {
  # Idempotenz-Pfad: der Guard gegen einen zweiten LLM-Aufruf existiert, und der
  # UPDATE-Helfer, der den Zeitstempel setzt, ist im Session-DB-Modul angesiedelt.
  run grep -qF "llm_summary_at" "$WEB/lib/coaching-summary.ts"
  [ "$status" -eq 0 ]
  run grep -qE "export async function updateSessionSummary" "$WEB/lib/coaching-session-db.ts"
  [ "$status" -eq 0 ]
}

@test "SessionSummary component exists and is mounted in the session page" {
  [ -f "$WEB/components/admin/coaching/SessionSummary.svelte" ]
  run grep -qF "SessionSummary" "$WEB/pages/admin/coaching/sessions/[id].astro"
  [ "$status" -eq 0 ]
}
