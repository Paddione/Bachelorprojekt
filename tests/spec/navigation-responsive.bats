#!/usr/bin/env bats
# tests/spec/navigation-responsive.bats
#
# Guards for T901310: the mobile header must fit narrow viewports (no
# horizontal overflow; menu toggle stays reachable). IDs T901310-1..2 feed
# components/website/src/data/test-inventory.json via scripts/build-test-inventory.sh.

NAV_SVELTE="${BATS_TEST_DIRNAME}/../../components/website/src/components/Navigation.svelte"

mobile_block() {
  awk '/@media \(max-width: 860px\)/,/^  \}$/' "$NAV_SVELTE"
}

@test "T901310-1: mobile breakpoint hides the header CTA pill" {
  [ -f "$NAV_SVELTE" ] || { echo "missing component: $NAV_SVELTE"; return 1; }
  block=$(mobile_block)
  [ -n "$block" ] || { echo "no @media (max-width: 860px) block in Navigation.svelte"; return 1; }
  cta_line=$(echo "$block" | grep -n '\.nav-cta *{' | head -1 | cut -d: -f1)
  [ -n "$cta_line" ] || { echo ".nav-cta rule missing from mobile block"; return 1; }
  echo "$block" | tail -n +"$cta_line" | head -n 5 | grep -q 'display: *none' \
    || { echo ".nav-cta is not hidden (display:none) in mobile block"; return 1; }
}

@test "T901310-2: mobile breakpoint lets the brand name shrink with ellipsis" {
  [ -f "$NAV_SVELTE" ] || { echo "missing component: $NAV_SVELTE"; return 1; }
  block=$(mobile_block)
  [ -n "$block" ] || { echo "no @media (max-width: 860px) block in Navigation.svelte"; return 1; }
  brand_line=$(echo "$block" | grep -n '\.brand *{' | head -1 | cut -d: -f1)
  [ -n "$brand_line" ] || { echo ".brand rule missing from mobile block"; return 1; }
  brand_snippet=$(echo "$block" | tail -n +"$brand_line" | head -n 6)
  echo "$brand_snippet" | grep -q 'flex-shrink: *1' \
    || { echo ".brand must allow shrinking (flex-shrink: 1) in mobile block"; return 1; }
  echo "$brand_snippet" | grep -q 'min-width: *0' \
    || { echo ".brand must set min-width: 0 in mobile block"; return 1; }
  name_line=$(echo "$block" | grep -n '\.brand-name *{' | head -1 | cut -d: -f1)
  [ -n "$name_line" ] || { echo ".brand-name rule missing from mobile block"; return 1; }
  name_snippet=$(echo "$block" | tail -n +"$name_line" | head -n 8)
  echo "$name_snippet" | grep -q 'white-space: *nowrap' \
    || { echo ".brand-name must not wrap in mobile block"; return 1; }
  echo "$name_snippet" | grep -q 'text-overflow: *ellipsis' \
    || { echo ".brand-name must ellipsis in mobile block"; return 1; }
}
