#!/usr/bin/env bats
# tests/spec/openspec-ticket-links-evaluation.bats
# SSOT: openspec/changes/openspec-ticket-links-evaluation/evaluation.md (T002573)
#
# Covers: deterministisches Bewertungsverfahren fuer .ticket-lose OpenSpec-Changes.
# Kein .ticket-loser Change darf ohne begruendeten Vermerk in evaluation.md verbleiben.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  EVAL="$REPO/openspec/changes/openspec-ticket-links-evaluation/evaluation.md"
  # Der Plan-Ordner dieses Tickets selbst traegt kein .ticket und ist nicht Teil der 41.
  PLAN_SLUG="openspec-ticket-links-evaluation"
}

# ── Test 1: kein .ticket-loser Change ohne Vermerk ────────────────────

@test "jeder .ticket-lose Change ist in evaluation.md als offen/duplikat-entfernt vermerkt" {
  [ -f "$EVAL" ] || skip "evaluation.md fehlt — Bewertungsverfahren noch nicht ausgefuehrt"
  local missing=0
  for d in "$REPO"/openspec/changes/*/; do
    local slug
    slug="$(basename "$d")"
    [ "$slug" = "archive" ] && continue
    [ "$slug" = "$PLAN_SLUG" ] && continue
    if [ ! -f "$d/.ticket" ]; then
      # Muss in evaluation.md als offen (inkl. Rest-Vermerk) ODER duplikat-entfernt vermerkt sein
      # (archivierte Changes sind verschoben und tauchen hier nicht mehr auf).
      if ! grep -qE "^\| [0-9]+ \| ${slug} \| (offen|duplikat-entfernt)( \(Rest-Vermerk\))? \|" "$EVAL"; then
        echo "FEHLT: .ticket-loser Change '$slug' ohne offen/duplikat-entfernt-Vermerk in evaluation.md" >&3
        missing=1
      fi
    fi
  done
  [ "$missing" -eq 0 ]
}

# ── Test 2: evaluation.md deckt alle 41 Changes ab ────────────────────

@test "evaluation.md listet alle 41 Changes aus der Ticket-Beschreibung" {
  [ -f "$EVAL" ] || skip "evaluation.md fehlt"
  # Die 41 Slugs aus der T002573-Beschreibung
  local slugs=(
    admin-fundament-konsolidierung brain-ingest-pruefen coaching-studio-restore-or-remove
    e2e-hydration-timeout fix-e2e-auth-systemtest fix-e2e-kontaktformular
    fix-e2e-test-ticket-generation fix-fa-sf-20-pipeline-contract fix-llm-server-watchdog
    fix-mishap-subagent-ticket-mcp fix-secrets-diff fix-studio-server-envsubst
    fix-t001935-brett-admin-session fix-t001936-mishap-bundle fix-t001939-portal-sidekick-hydration
    fix-t001940-coaching-generate-502 fix-t001948-unused-indexes fix-t001949-container-cves
    fix-t001951-brain-ingest fix-t001953-mishap-bundle k3d-dev-llm-bridge mishap-10er-bundle
    mishap-agent-lock mishap-bundle-T002506 mishap-bundle-dev-flow mishap-devflow-queue-T002272
    mishap-t001969 mishap-t001972 mishap-t002408 mishap-t002424 mishap-test-repo-hygiene-T002347
    release-notes-erden remove-keycloak-sidecar renovate-app-token scout-llm-fallback-erden
    scout-prediction-quality sdlc-cockpit-design sdlc-cockpit-k2-daemon spec-bats-admin-ui
    unpinned-latest-images wakeup-dispatcher-bridge-wiring
  )
  local missing=0
  for slug in "${slugs[@]}"; do
    if ! grep -qE "^\| [0-9]+ \| ${slug} \|" "$EVAL"; then
      echo "FEHLT: Change '$slug' nicht in evaluation.md" >&3
      missing=1
    fi
  done
  [ "$missing" -eq 0 ]
}

# ── Test 3: openspec.sh validate ist gruen ────────────────────────────

@test "openspec.sh validate liefert Exit 0" {
  run bash "$REPO/scripts/openspec.sh" validate
  [ "$status" -eq 0 ]
}
