#!/usr/bin/env bats
# Spec-Guards für T901032 (license-manifest): Reuse-Policy, Dritt-Lizenz-Manifest,
# NOTICE-Abdeckung, CI-Checker, Workflow, Asset-/Release-Dokumente.
# Stilvorlage: tests/spec/agent-skills/post-merge-finalize-safety.bats.

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
POLICY="$REPO_ROOT/docs/legal/reuse-policy.md"
MANIFEST="$REPO_ROOT/docs/legal/third-party-manifest.json"
NOTICE="$REPO_ROOT/docs/legal/NOTICE.md"
CHECKER="$REPO_ROOT/scripts/legal/license-check.sh"
WORKFLOW="$REPO_ROOT/.github/workflows/license-policy.yml"
ASSETS="$REPO_ROOT/docs/legal/asset-licensing.md"
RELEASE="$REPO_ROOT/docs/legal/release-attribution.md"

@test "T901032-1: Policy existiert und enthaelt alle Anker RP-1 bis RP-7" {
  [ -f "$POLICY" ]
  for anchor in RP-1 RP-2 RP-3 RP-4 RP-5 RP-6 RP-7; do
    count="$(grep -c -F "$anchor" "$POLICY")"
    [ "$count" -eq 1 ]
  done
}

@test "T901032-2: Manifest parst und jede Version ist exakt gepinnt" {
  [ -f "$MANIFEST" ]
  jq empty "$MANIFEST"
  run bash -c 'jq -r ".components[].version" "$1" | grep -E "\^|~|latest"' _ "$MANIFEST"
  [ "$status" -ne 0 ]
}

@test "T901032-3: Jeder Manifest-Name kommt in NOTICE vor" {
  [ -f "$NOTICE" ]
  names="$(jq -r '.components[].name' "$MANIFEST")"
  [ -n "$names" ]
  while IFS= read -r name; do
    [ -n "$name" ]
    grep -q -F "$name" "$NOTICE"
  done <<< "$names"
}

@test "T901032-4: Checker meldet PASS und erkennt Denylist-Verletzung" {
  [ -f "$CHECKER" ]
  run bash "$CHECKER"
  [ "$status" -eq 0 ]
  [[ "$output" == *"license-check: PASS"* ]]
  # Negativprobe: Manifest-Kopie mit AGPL-Eintrag muss fail-closed scheitern.
  poisoned="$BATS_TEST_TMPDIR/manifest-agpl.json"
  jq '(.components[0].license) = "AGPL-3.0-or-later"' "$MANIFEST" > "$poisoned"
  run env MANIFEST="$poisoned" bash "$CHECKER"
  [ "$status" -ne 0 ]
}

@test "T901032-5: Workflow existiert und referenziert den Checker-Pfad" {
  [ -f "$WORKFLOW" ]
  grep -q -F "scripts/legal/license-check.sh" "$WORKFLOW"
}

@test "T901032-6: Asset- und Release-Dokumente existieren mit Pflichtbegriffen" {
  [ -f "$ASSETS" ]
  [ -f "$RELEASE" ]
  grep -q -F "Quarantäne" "$ASSETS"
  grep -q -F "Attribution" "$RELEASE"
  grep -q -F "AGPL-Ausnahme" "$RELEASE"
}
