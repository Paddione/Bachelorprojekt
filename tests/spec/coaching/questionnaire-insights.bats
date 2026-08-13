#!/usr/bin/env bats
# tests/spec/coaching/questionnaire-insights.bats
# T002652 — Questionnaire-Antworten semantisch analysieren und Insights generieren.
#
# Pruefmodus: strukturell. Das Ergebnis der Feature-Existenz manifestiert sich
# ausschliesslich im Quelltext (Lib-Funktionen, API-Endpoint, Migration, gemountete
# Komponente) — daher grep-basierte Assertions, dokumentiert im Header wie
# tests/spec/coaching-sessions-polish-guide.bats. Verhaltenslogik wird separat in
# website/src/lib/coaching-questionnaire-insights.test.ts geprueft.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}" && git rev-parse --show-toplevel)"
  WEB="$REPO_ROOT/website/src"
}

@test "insights lib exports embed, cluster and label" {
  [ -f "$WEB/lib/coaching-questionnaire-insights.ts" ]
  run grep -qE "export (async )?function (embed|cluster|label)" "$WEB/lib/coaching-questionnaire-insights.ts"
  [ "$status" -eq 0 ]
}

@test "insights lib embeds via embedBatch (bge-m3, fail-closed)" {
  # Positiv-Anker: ohne embedBatch-Aufruf bestuende auch ein totes embed() trivial.
  run grep -qF "embedBatch" "$WEB/lib/coaching-questionnaire-insights.ts"
  [ "$status" -eq 0 ]
  run grep -qF "EmbeddingQueryError" "$WEB/lib/coaching-questionnaire-insights.ts"
  [ "$status" -eq 0 ]
}

@test "insights endpoint exists with admin auth" {
  [ -f "$WEB/pages/api/admin/coaching/questionnaire/insights.ts" ]
  run grep -qF "getSession(request.headers.get('cookie'))" "$WEB/pages/api/admin/coaching/questionnaire/insights.ts"
  [ "$status" -eq 0 ]
  run grep -qF "isAdmin(session)" "$WEB/pages/api/admin/coaching/questionnaire/insights.ts"
  [ "$status" -eq 0 ]
  run grep -qF "Unauthorized" "$WEB/pages/api/admin/coaching/questionnaire/insights.ts"
  [ "$status" -eq 0 ]
}

@test "insights endpoint fails closed (503) when the embedding backend is down" {
  # Positiv-Anker: ohne 503-Zweig bestuende der Test trivial, solange der Endpoint
  # ueberhaupt existiert.
  run grep -qF "status: 503" "$WEB/pages/api/admin/coaching/questionnaire/insights.ts"
  [ "$status" -eq 0 ]
}

@test "insights DSGVO guard path is the coaching session-agent path" {
  # Labels duerfen nur ueber den Guard-Pfad erzeugt werden (on-premises-Pflicht).
  # Positiv-Anker: der Guard selbst muss existieren, sonst waere die Referenz leer.
  run grep -qF "createSessionAgent" "$WEB/lib/coaching-questionnaire-insights.ts"
  [ "$status" -eq 0 ]
  run grep -qF "DataResidencyError" "$WEB/lib/openai-compatible-session-agent.ts"
  [ "$status" -eq 0 ]
  run grep -qF "x-llm-local-only" "$WEB/lib/openai-compatible-session-agent.ts"
  [ "$status" -eq 0 ]
}

@test "insights cache migration exists with key/payload/created_at" {
  run grep -qF "questionnaire_insights_cache" "$REPO_ROOT/website/src/db/migrations/20260813_coaching_questionnaire_insights_cache.sql"
  [ "$status" -eq 0 ]
  run grep -qiE "key[[:space:]]+text[[:space:]]+(primary key|PRIMARY KEY)" "$REPO_ROOT/website/src/db/migrations/20260813_coaching_questionnaire_insights_cache.sql"
  [ "$status" -eq 0 ]
  run grep -qiE "payload[[:space:]]+jsonb" "$REPO_ROOT/website/src/db/migrations/20260813_coaching_questionnaire_insights_cache.sql"
  [ "$status" -eq 0 ]
  run grep -qiE "created_at[[:space:]]+timestamptz" "$REPO_ROOT/website/src/db/migrations/20260813_coaching_questionnaire_insights_cache.sql"
  [ "$status" -eq 0 ]
}

@test "insights cache read honours 24h freshness and force=1" {
  # Idempotenz: ein Treffer < 24h alt wird zurueckgegeben, force=1 umgeht den Cache.
  run grep -qF "force" "$WEB/lib/coaching-questionnaire-insights.ts"
  [ "$status" -eq 0 ]
  run grep -qE "24|interval|hours" "$WEB/lib/coaching-questionnaire-insights.ts"
  [ "$status" -eq 0 ]
}

@test "QuestionnaireInsights component exists and is mounted in settings" {
  [ -f "$WEB/components/admin/coaching/QuestionnaireInsights.svelte" ]
  run grep -qF "QuestionnaireInsights" "$WEB/pages/admin/coaching/settings.astro"
  [ "$status" -eq 0 ]
}
