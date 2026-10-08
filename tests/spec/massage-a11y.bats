#!/usr/bin/env bats
# tests/spec/massage-a11y.bats
#
# Structural guards for T901312 (massage axe serious violations). Tuned color
# VALUES are covered behaviorally by FA-65 (axe suite); these guards lock the
# fix structure: on-brass token exists in both brands, brass-text usages read
# it, and empty mailto placeholders never render as links. IDs T901312-1..5
# feed components/website/src/data/test-inventory.json via
# scripts/build-test-inventory.sh.

MASSAGE_CSS="${BATS_TEST_DIRNAME}/../../components/website/public/brand/massage/colors_and_type.css"
MENTOLDER_CSS="${BATS_TEST_DIRNAME}/../../components/website/public/brand/mentolder/colors_and_type.css"
NAV_SVELTE="${BATS_TEST_DIRNAME}/../../components/website/src/components/Navigation.svelte"
CTA_SVELTE="${BATS_TEST_DIRNAME}/../../components/website/src/components/CallToAction.svelte"
FOOTER_ASTRO="${BATS_TEST_DIRNAME}/../../components/website/src/components/Footer.astro"
HUB_SVELTE="${BATS_TEST_DIRNAME}/../../components/website/src/components/ContactHub.svelte"

@test "T901312-1: on-brass text token exists in both brand stylesheets" {
  [ -f "$MASSAGE_CSS" ] || { echo "missing: $MASSAGE_CSS"; return 1; }
  [ -f "$MENTOLDER_CSS" ] || { echo "missing: $MENTOLDER_CSS"; return 1; }
  grep -q -- '--on-brass:' "$MASSAGE_CSS" || { echo "--on-brass missing from massage brand CSS"; return 1; }
  grep -q -- '--on-brass:' "$MENTOLDER_CSS" || { echo "--on-brass missing from mentolder brand CSS"; return 1; }
}

@test "T901312-2: nav-cta reads the on-brass token" {
  [ -f "$NAV_SVELTE" ] || { echo "missing: $NAV_SVELTE"; return 1; }
  cta_line=$(grep -n '\.nav-cta *{' "$NAV_SVELTE" | head -1 | cut -d: -f1)
  [ -n "$cta_line" ] || { echo ".nav-cta rule missing from Navigation.svelte"; return 1; }
  tail -n +"$cta_line" "$NAV_SVELTE" | head -n 16 | grep -q 'var(--on-brass)' \
    || { echo ".nav-cta must read var(--on-brass)"; return 1; }
}

@test "T901312-3: primary CTA button reads the on-brass token" {
  [ -f "$CTA_SVELTE" ] || { echo "missing: $CTA_SVELTE"; return 1; }
  btn_line=$(grep -n '\.btn-primary *{' "$CTA_SVELTE" | head -1 | cut -d: -f1)
  [ -n "$btn_line" ] || { echo ".btn-primary rule missing from CallToAction.svelte"; return 1; }
  tail -n +"$btn_line" "$CTA_SVELTE" | head -n 8 | grep -q 'var(--on-brass)' \
    || { echo ".btn-primary must read var(--on-brass)"; return 1; }
}

@test "T901312-4: footer renders mailto only with a non-empty address" {
  [ -f "$FOOTER_ASTRO" ] || { echo "missing: $FOOTER_ASTRO"; return 1; }
  mailto_line=$(grep -n 'mailto:' "$FOOTER_ASTRO" | head -1 | cut -d: -f1)
  [ -n "$mailto_line" ] || { echo "no mailto link in Footer.astro (unexpected)"; return 1; }
  head -n "$mailto_line" "$FOOTER_ASTRO" | tail -n 8 | grep -q '{footerEmail &&' \
    || { echo "footer mailto must be guarded by {footerEmail && ...} like the phone link"; return 1; }
}

@test "T901312-5: contact hub renders mailto only with a non-empty address" {
  [ -f "$HUB_SVELTE" ] || { echo "missing: $HUB_SVELTE"; return 1; }
  mailto_line=$(grep -n 'mailto:' "$HUB_SVELTE" | head -1 | cut -d: -f1)
  [ -n "$mailto_line" ] || { echo "no mailto link in ContactHub.svelte (unexpected)"; return 1; }
  head -n "$mailto_line" "$HUB_SVELTE" | tail -n 8 | grep -q '{#if email}' \
    || { echo "hub mailto must be guarded by {#if email} like the phone link"; return 1; }
}
