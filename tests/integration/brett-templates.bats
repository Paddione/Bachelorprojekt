#!/usr/bin/env bats

# Brett coaching-templates API. Structural assertions run offline; the live
# curl is skipped unless BRETT_BASE_URL points at a running server.

@test "index.ts registers GET /api/templates route" {
  run grep -F "app.get('/api/templates'" brett/src/server/index.ts
  [ "$status" -eq 0 ]
}

@test "index.ts registers GET /api/templates/:id route" {
  run grep -F "app.get('/api/templates/:id'" brett/src/server/index.ts
  [ "$status" -eq 0 ]
}

@test "migration seeds the Beziehungsdynamik system template" {
  run grep -F "sys-beziehungsdynamik-familiensystem" brett/src/server/migrations/002_coaching_templates.sql
  [ "$status" -eq 0 ]
}

@test "live: GET /api/templates returns the seeded template" {
  [ -n "${BRETT_BASE_URL:-}" ] || skip "BRETT_BASE_URL not set"
  run curl -fsS "${BRETT_BASE_URL}/api/templates?brand=mentolder"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "Beziehungsdynamik"
}
