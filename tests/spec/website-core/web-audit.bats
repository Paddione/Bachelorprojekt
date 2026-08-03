#!/usr/bin/env bats
# tests/spec/website-core/web-audit.bats
# SSOT: openspec/changes/web-audit/specs/website-core.md

AUDIT_SCRIPT="scripts/web-audit.mjs"
FIXTURE_HTML="tests/fixtures/web-audit/route-sample.html"
FIXTURE_AXE="tests/fixtures/web-audit/axe-sample.json"
FIXTURE_LH="tests/fixtures/web-audit/lighthouse-sample.json"

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

# ── Scenario 1: Semantik-Extrakt ───────────────────────────────────────────────

@test "extract: enthaelt erwartete alt-Texte mit Bild-URLs (Positiv-Anker)" {
  run node "${REPO_ROOT}/${AUDIT_SCRIPT}" --extract-fixture "${REPO_ROOT}/${FIXTURE_HTML}"
  [ "$status" -eq 0 ]

  echo "$output" | grep -q '"alt": "Portraitfoto der Coachin"'
  echo "$output" | grep -q '"alt": "Mentolder Coaching Logo"'
  echo "$output" | grep -q '"alt": "header-bg-2.webp"'
  echo "$output" | grep -q '"src": "/images/portrait.jpg"'
  echo "$output" | grep -q '"src": "/images/header-bg-2.webp"'
}

@test "extract: Output enthaelt KEIN HTML-Markup" {
  run node "${REPO_ROOT}/${AUDIT_SCRIPT}" --extract-fixture "${REPO_ROOT}/${FIXTURE_HTML}"
  [ "$status" -eq 0 ]

  ! echo "$output" | grep -qE '<(img|a|div|span|h[1-6]|meta|header|main|footer|nav|section|body|html|p|title|link)'
  ! echo "$output" | grep -q '</'
}

@test "extract: enthaelt Meta-Tags" {
  run node "${REPO_ROOT}/${AUDIT_SCRIPT}" --extract-fixture "${REPO_ROOT}/${FIXTURE_HTML}"
  [ "$status" -eq 0 ]

  echo "$output" | grep -q '"name": "description"'
  echo "$output" | grep -q 'Professionelles Coaching'
  echo "$output" | grep -q '"name": "viewport"'
  echo "$output" | grep -q '"name": "charset"'
}

@test "extract: enthaelt Ueberschriften-Hierarchie" {
  run node "${REPO_ROOT}/${AUDIT_SCRIPT}" --extract-fixture "${REPO_ROOT}/${FIXTURE_HTML}"
  [ "$status" -eq 0 ]

  echo "$output" | grep -q '"level": 1'
  echo "$output" | grep -q 'Willkommen bei Mentolder'
  echo "$output" | grep -q '"level": 2'
  echo "$output" | grep -q 'Unsere Leistungen'
}

@test "extract: enthaelt Link-Labels mit Ziel" {
  run node "${REPO_ROOT}/${AUDIT_SCRIPT}" --extract-fixture "${REPO_ROOT}/${FIXTURE_HTML}"
  [ "$status" -eq 0 ]

  echo "$output" | grep -q '"text": "Start"'
  echo "$output" | grep -q '"href": "/"'
  echo "$output" | grep -q '"text": "Kontaktformular öffnen"'
  echo "$output" | grep -q '"href": "/kontakt"'
  echo "$output" | grep -q '"text": "Mehr erfahren"'
  echo "$output" | grep -q '"href": "/coaching"'
}

# ── Scenario 2: Prompt unter 32000 Token ───────────────────────────────────────

@test "prompt: bleibt bei drei Routen unter 32000 Token" {
  run node "${REPO_ROOT}/${AUDIT_SCRIPT}" \
    --extract-fixture "${REPO_ROOT}/${FIXTURE_HTML}" \
    --check-tokens \
    --routes /,/ueber-mich,/kontakt
  [ "$status" -eq 0 ]

  local token_count="${lines[0]}"
  [ -n "$token_count" ]
  [ "$token_count" -ge 1 ]
  [ "$token_count" -lt 32000 ]
}

# ── Scenario 3: enable_thinking auf false ──────────────────────────────────────

@test "chat_template_kwargs: enable_thinking auf false gesetzt" {
  run grep -qE 'enable_thinking\s*:\s*false' "${REPO_ROOT}/${AUDIT_SCRIPT}"
  [ "$status" -eq 0 ]

  grep -q 'chat_template_kwargs.*enable_thinking' "${REPO_ROOT}/${AUDIT_SCRIPT}"
}

# ── Scenario 4: llm-proxy nicht erreichbar ─────────────────────────────────────

@test "proxy unreachable: Stufen 1+2 vollstaendig, Stufe 3 als ausgefallen, exit 0" {
  run timeout 15 node "${REPO_ROOT}/${AUDIT_SCRIPT}" \
    --brand mentolder \
    --routes / \
    --axe-fixture "${REPO_ROOT}/${FIXTURE_AXE}" \
    --lighthouse-fixture "${REPO_ROOT}/${FIXTURE_LH}" \
    --proxy-url "http://127.0.0.1:19999" \
    --proxy-timeout 1000
  [ "$status" -eq 0 ]

  echo "$output" | grep -q 'Stage 1'
  echo "$output" | grep -q 'Stage 2'
  echo "$output" | grep -q 'FAIL' || echo "$output" | grep -q 'unreachable'
}

# ── Scenario 5: axe fehlgeschlagen — semantische Pruefung laeuft dennoch ───────

@test "axe fehlgeschlagen: Exit-Code gemeldet, semantische Pruefung laeuft dennoch" {
  run timeout 15 node "${REPO_ROOT}/${AUDIT_SCRIPT}" \
    --brand mentolder \
    --routes / \
    --axe-exit-code 2 \
    --lighthouse-fixture "${REPO_ROOT}/${FIXTURE_LH}" \
    --proxy-url "http://127.0.0.1:19999" \
    --proxy-timeout 1000
  [ "$status" -eq 0 ]

  echo "$output" | grep -q 'Stage 1'
  echo "$output" | grep -q 'FAIL'
  echo "$output" | grep -q 'Stage 3'

  local date_str
  date_str=$(date '+%Y-%m-%d')
  local report_file="${REPO_ROOT}/tmp/claude-scratch/web-audit-mentolder-${date_str}.md"
  [ -f "$report_file" ]
  grep -q 'Simulated axe failure' "$report_file"
  grep -q 'FAILED' "$report_file"
}
