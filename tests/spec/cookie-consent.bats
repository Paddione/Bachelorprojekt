#!/usr/bin/env bats
# tests/spec/cookie-consent.bats
#
# Structural guard for T901370 (cookie banner contrast 3.22 instead of 4.5).
# The banner renders on a dark ground; muted gray text fails WCAG AA there.
# The tuned replacement tone is covered behaviorally by FA-65 A1 (axe).
# ID T901370-1 feeds components/website/src/data/test-inventory.json via
# scripts/build-test-inventory.sh.

CONSENT_SVELTE="${BATS_TEST_DIRNAME}/../../components/website/src/components/CookieConsent.svelte"

@test "T901370-1: cookie banner uses no muted gray text on dark ground" {
  [ -f "$CONSENT_SVELTE" ] || { echo "missing: $CONSENT_SVELTE"; return 1; }
  if grep -q 'text-muted' "$CONSENT_SVELTE"; then
    echo "text-muted still present in CookieConsent.svelte (3.22 on dark, needs 4.5):"
    grep -n 'text-muted' "$CONSENT_SVELTE" | head -n 5
    return 1
  fi
}
