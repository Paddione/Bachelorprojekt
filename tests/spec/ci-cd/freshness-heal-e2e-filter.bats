#!/usr/bin/env bats
# tests/spec/ci-cd/freshness-heal-e2e-filter.bats
# SSOT: openspec/specs/ci-cd.md (Delta: openspec/changes/freshness-heal-on-pr/specs/ci-cd.md)
# T-PENDING: Der Heal-Commit aendert ausschliesslich Freshness-Artefakte und
# darf die teure Playwright-Kette (e2e-pr.yml) nicht erneut starten. Der
# bestehende Job-Level-Filter wird pro Datei verfeinert: Artefakt-Pfade loesen
# keine E2E aus, alle anderen components/website/-Aenderungen weiterhin.
# KEIN paths-ignore auf Trigger-Ebene: der Workflow ist Required Check und
# muss bei jedem PR reporten, sonst blockiert der Skip den Merge.
#
# Test mode: source verification (Workflow-YAML ist CI-Konfiguration, deren
# Verhalten sich ausschliesslich im Text manifestiert — dokumentierte Ausnahme
# in CLAUDE.md, T002448-M4).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  E2E_YML="$REPO_ROOT/.github/workflows/e2e-pr.yml"
}

# Nur den Filter-Step extrahieren (bis zum naechsten Step-Anfang), damit ein
# unverwandter Treffer woanders in der Datei den Guard nicht faerbt (T003104).
_filter_step() {
  awk '
    /Check if E2E-relevant files changed/ { capture=1; print; next }
    capture && /^      - (name|uses):/ { capture=0 }
    capture { print }
  ' "$E2E_YML"
}

@test "T-PENDING: e2e-pr.yml filter excludes freshness artifacts (heal commit skips E2E)" {
  [ -f "$E2E_YML" ] || { echo "MISSING e2e-pr.yml: $E2E_YML"; return 1; }
  step="$(_filter_step)"
  [ -n "$step" ] || { echo "MISSING filter step in e2e-pr.yml"; return 1; }
  echo "$step" | grep -qE 'test-inventory' \
    || { echo "MISSING artifact exclusion in e2e-pr.yml filter step"; return 1; }
}

@test "T-PENDING: e2e-pr.yml filter still runs for real website changes (control)" {
  [ -f "$E2E_YML" ] || { echo "MISSING e2e-pr.yml: $E2E_YML"; return 1; }
  step="$(_filter_step)"
  [ -n "$step" ] || { echo "MISSING filter step in e2e-pr.yml"; return 1; }
  echo "$step" | grep -qE 'components/website/' \
    || { echo "MISSING positive E2E match in e2e-pr.yml filter — guard over-suppressed!"; return 1; }
}
