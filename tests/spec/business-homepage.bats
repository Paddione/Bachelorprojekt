#!/usr/bin/env bats
# tests/spec/business-homepage.bats
#
# Guards for T901028: business-homepage (Massage-Homepage und Leistungsseiten,
# Brand massage, Richtung A "Ruhige Wärme"). Style: tests/spec/basic-invoices.bats.
# IDs T901028-1..6 feed components/website/src/data/test-inventory.json
# via scripts/build-test-inventory.sh.

ROOT="${BATS_TEST_DIRNAME}/../.."
BRAND_DIR="${ROOT}/components/website/public/brand/massage"
BRAND_CSS="${BRAND_DIR}/colors_and_type.css"
CONTENT_DIR="${ROOT}/components/website/content/massage"
PAGES_DIR="${ROOT}/components/website/src/pages"
PUBLIC_DIR="${ROOT}/components/website/public"
CONFIG_TS="${ROOT}/components/website/src/config/brands/massage.ts"

# The 7 slug pages of T901028 (kontakt.astro is a foreign slug, T901024).
SLUG_PAGES=(
  "${PAGES_DIR}/index.astro"
  "${PAGES_DIR}/leistungen.astro"
  "${PAGES_DIR}/faq.astro"
  "${PAGES_DIR}/ueber-mich.astro"
  "${PAGES_DIR}/404.astro"
  "${PAGES_DIR}/impressum.astro"
  "${PAGES_DIR}/datenschutz.astro"
)

# ── Case 1: massage brand folder ships tokens and favicon ────────────────────

@test "T901028-1: massage brand folder ships tokens and favicon" {
  [ -f "$BRAND_CSS" ] || { echo "missing brand tokens: $BRAND_CSS"; return 1; }
  [ -f "${BRAND_DIR}/favicon.svg" ] || { echo "missing favicon: ${BRAND_DIR}/favicon.svg"; return 1; }
  [ -s "$BRAND_CSS" ] || { echo "brand tokens file is empty: $BRAND_CSS"; return 1; }
  grep -q -- "--sage" "$BRAND_CSS" || { echo "color tokens missing from $BRAND_CSS (want --sage)"; return 1; }
  grep -q -- "--serif" "$BRAND_CSS" || { echo "typo tokens missing from $BRAND_CSS (want --serif)"; return 1; }
  grep -q -- "--sans" "$BRAND_CSS" || { echo "typo tokens missing from $BRAND_CSS (want --sans)"; return 1; }
}

# ── Case 2: homepage CTAs enter the T901024 journey via /kontakt ─────────────

@test "T901028-2: homepage CTAs point at the /kontakt journey entry" {
  [ -f "$CONFIG_TS" ] || { echo "missing brand config: $CONFIG_TS"; return 1; }
  grep -q "href: '/kontakt'" "$CONFIG_TS" || { echo "leistungenCta.href is not '/kontakt' in $CONFIG_TS"; return 1; }
  [ -f "${PAGES_DIR}/index.astro" ] || { echo "missing page: ${PAGES_DIR}/index.astro"; return 1; }
  [ -f "${PAGES_DIR}/leistungen.astro" ] || { echo "missing page: ${PAGES_DIR}/leistungen.astro"; return 1; }
  grep -q "/kontakt" "${PAGES_DIR}/index.astro" || { echo "no /kontakt CTA in index.astro"; return 1; }
  grep -q "service=" "${PAGES_DIR}/leistungen.astro" || { echo "no service-keyed journey link in leistungen.astro"; return 1; }
  hits=$(grep -n 'href="#"' "${PAGES_DIR}/index.astro" "${PAGES_DIR}/leistungen.astro" || true)
  [ -z "$hits" ] || { echo "placeholder href found at CTA position: $hits"; return 1; }
}

# ── Case 3: no dead internal links on the 7 slug pages ───────────────────────

@test "T901028-3: no dead internal links on the 7 slug pages" {
  for f in "${SLUG_PAGES[@]}" "${CONTENT_DIR}/navigation.json" "${CONTENT_DIR}/footer.json"; do
    [ -f "$f" ] || { echo "missing link source: $f"; return 1; }
  done
  tmp="$(mktemp)"
  grep -hoE 'href="/[^"]*"' "${SLUG_PAGES[@]}" "${CONTENT_DIR}/navigation.json" "${CONTENT_DIR}/footer.json" \
    | sed -E 's/^href="//; s/"$//' | sed -E 's/[?#].*$//' | sort -u > "$tmp"
  [ -s "$tmp" ] || { echo "no internal links found at all"; rm -f "$tmp"; return 1; }
  while IFS= read -r target; do
    case "$target" in
      "/") want="${PAGES_DIR}/index.astro" ;;
      # Static assets (brand CSS, favicons, downloads) resolve under public/.
      *.*) want="${PUBLIC_DIR}${target}" ;;
      *) want="${PAGES_DIR}${target}.astro" ;;
    esac
    if [ ! -f "$want" ]; then
      echo "dead internal link target: $target (want $want)"
      rm -f "$tmp"
      return 1
    fi
  done < "$tmp"
  rm -f "$tmp"
}

# ── Case 4: reduced-motion query disables animation or transition ─────────────

@test "T901028-4: reduced-motion query disables animation or transition" {
  for css in "$BRAND_CSS" "${ROOT}/components/website/src/styles/global.css"; do
    [ -f "$css" ] || continue
    grep -q "prefers-reduced-motion" "$css" || continue
    if grep -A10 "prefers-reduced-motion" "$css" | grep -qE "animation:[[:space:]]*none|transition:[[:space:]]*none"; then
      return 0
    fi
  done
  echo "no prefers-reduced-motion block with animation:none/transition:none in brand or global CSS"
  return 1
}

# ── Case 5: no Heilversprechen phrases in massage content and pages ───────────

@test "T901028-5: no Heilversprechen phrases in massage content and pages" {
  for f in "$CONFIG_TS" "${SLUG_PAGES[@]}"; do
    [ -f "$f" ] || { echo "missing spec file: $f"; return 1; }
  done
  [ -d "$CONTENT_DIR" ] || { echo "missing content dir: $CONTENT_DIR"; return 1; }
  while IFS= read -r phrase; do
    hits=$(grep -rniF -e "$phrase" "$CONFIG_TS" "$CONTENT_DIR" "${SLUG_PAGES[@]}" || true)
    [ -z "$hits" ] || { echo "verbotene Phrase '$phrase' gefunden: $hits"; return 1; }
  done <<'PHRASES'
heilt
Heilung
garantiert
schmerzfrei
beseitigt Schmerzen
medizinisch nachgewiesen
PHRASES
}

# ── Case 6: no full-cream body, gradient headlines, or slop grids ─────────────

@test "T901028-6: no full-cream body, gradient headlines, or slop grids" {
  [ -f "$BRAND_CSS" ] || { echo "missing brand tokens: $BRAND_CSS"; return 1; }
  for f in "${SLUG_PAGES[@]}"; do
    [ -f "$f" ] || { echo "missing slug page: $f"; return 1; }
  done
  body_bg=$(grep -A6 '^body' "$BRAND_CSS" | grep -oE '#[0-9A-Fa-f]{6}' | head -1)
  [ "$body_bg" = "#FDFCF9" ] || { echo "body background is '${body_bg:-?}', want #FDFCF9 (paper, not creme)"; return 1; }
  hits=$(grep -n 'linear-gradient' "$BRAND_CSS" "${SLUG_PAGES[@]}" || true)
  [ -z "$hits" ] || { echo "gradient headline pattern found: $hits"; return 1; }
  hits=$(grep -rniE 'bento|card-grid|features-grid|glass-card' "$BRAND_CSS" "${SLUG_PAGES[@]}" || true)
  [ -z "$hits" ] || { echo "slop grid pattern found: $hits"; return 1; }
}
