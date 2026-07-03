#!/usr/bin/env bats
# tests/spec/react-homepage-blocks.bats
#
# OpenSpec capability smoke for the react-homepage-blocks P1 implementation.
# Verifies structural contracts that don't need the live cluster:
#   - Block-Katalog: schema.ts covers all 7 catalog + 3 generic block types
#   - Seed-Schema-Kontrakt: seed.ts validates against the schema
#   - BlockRenderer fail-closed behaviour is implemented
#   - HomePage refactor: no inline homepage content, no homepage content.ts imports

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  export REPO
}

# ── Block catalog completeness ─────────────────────────────────

@test "schema covers all 7 catalog block type literals" {
  run grep -E "z\.literal\('(hero|stats|services|whyMe|process|faq|cta)'\)" \
    "$REPO/mentolder-web/src/blocks/schema.ts"
  [ "$status" -eq 0 ]
  for t in hero stats services whyMe process faq cta; do
    echo "$output" | grep -q "'$t'"
  done
}

@test "schema covers the 3 generic block type literals" {
  for t in richText image spacer; do
    run grep -E "z\.literal\('$t'\)" "$REPO/mentolder-web/src/blocks/schema.ts"
    [ "$status" -eq 0 ]
  done
}

@test "schema exports a single SCHEMA_VERSION constant" {
  run grep -cE "export const SCHEMA_VERSION" "$REPO/mentolder-web/src/blocks/schema.ts"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  # Must be a literal number (1)
  run grep -E "export const SCHEMA_VERSION = [0-9]+" "$REPO/mentolder-web/src/blocks/schema.ts"
  [ "$status" -eq 0 ]
}

@test "services.items[].icon is a closed enum of iconRegistry keys" {
  for key in fuehrung digitalisierung team strategie kommunikation resilienz; do
    run grep -E "'$key'" "$REPO/mentolder-web/src/blocks/schema.ts"
    [ "$status" -eq 0 ]
  done
}

@test "whyMe.props.intro is structured as prefix/emphasis/suffix" {
  for field in prefix emphasis suffix; do
    run grep -E "$field: z\.string\(\)" "$REPO/mentolder-web/src/blocks/schema.ts"
    [ "$status" -eq 0 ]
  done
}

# ── Seed contract ──────────────────────────────────────────────

@test "seed.ts contains all 7 catalog block type literals in order" {
  run bash -c "grep -oE \"type: '(hero|stats|services|whyMe|process|faq|cta)'\" '$REPO/mentolder-web/src/blocks/seed.ts'"
  [ "$status" -eq 0 ]
  echo "$output" | head -7 | tr '\n' ' ' | grep -q "type: 'hero'.*type: 'stats'.*type: 'services'.*type: 'whyMe'.*type: 'process'.*type: 'faq'.*type: 'cta'"
}

# T001575: seed.ts wurde in 7a0d1dde7 bewusst mit dem Live-Content von
# web.mentolder.de synchronisiert (Platzhalter "Dr. M. Albers" → echtes
# Zitat). Die Assertions prüfen weiterhin den Kontrakt (Testimonial mit
# quoteName/quoteRole, strukturiertes whyMe-Intro), aber gegen den
# aktuellen, absichtlich geänderten Content.
@test "seed.ts contains the inline testimonial (quoteName/quoteRole)" {
  run grep "quoteName: 'Gerald Korczewski'" "$REPO/mentolder-web/src/blocks/seed.ts"
  [ "$status" -eq 0 ]
  run grep "quoteRole: 'Coach und digitaler Begleiter'" "$REPO/mentolder-web/src/blocks/seed.ts"
  [ "$status" -eq 0 ]
}

@test "seed.ts uses structured whyMe intro with prefix/emphasis/suffix" {
  run grep "prefix: 'Ich kenne beide Welten: '" "$REPO/mentolder-web/src/blocks/seed.ts"
  [ "$status" -eq 0 ]
  run grep "emphasis: '40 Jahre etablierte Strukturen'" "$REPO/mentolder-web/src/blocks/seed.ts"
  [ "$status" -eq 0 ]
  run grep "suffix: ' UND modernste KI-Tools" "$REPO/mentolder-web/src/blocks/seed.ts"
  [ "$status" -eq 0 ]
}

# ── BlockRenderer contract ─────────────────────────────────────

@test "BlockRenderer validates the document with Zod" {
  run grep "HomepageBlocksDocument" "$REPO/mentolder-web/src/blocks/BlockRenderer.tsx"
  [ "$status" -eq 0 ]
  run grep "safeParse" "$REPO/mentolder-web/src/blocks/BlockRenderer.tsx"
  [ "$status" -eq 0 ]
}

@test "BlockRenderer falls back to seed on schemaVersion mismatch" {
  run grep "schemaVersion !== SCHEMA_VERSION" "$REPO/mentolder-web/src/blocks/BlockRenderer.tsx"
  [ "$status" -eq 0 ]
  run grep "homepageSeed" "$REPO/mentolder-web/src/blocks/BlockRenderer.tsx"
  [ "$status" -eq 0 ]
}

# ── HomePage refactor contract ─────────────────────────────────

@test "HomePage.tsx no longer renders inline homepage content (no <Hero direct import)" {
  ! grep -q "from '@/components/Hero'" "$REPO/mentolder-web/src/pages/HomePage.tsx"
}

@test "HomePage.tsx no longer imports homepage content fields from content.ts" {
  ! grep -qE "from '@/content'" "$REPO/mentolder-web/src/pages/HomePage.tsx" \
    || {
      # If content.ts is imported, only SITE.* (SEO metadata) is allowed
      grep -E "from '@/content'" "$REPO/mentolder-web/src/pages/HomePage.tsx" | grep -qE "\{ ?SITE ?\}" \
        && ! grep -E "from '@/content'" "$REPO/mentolder-web/src/pages/HomePage.tsx" | grep -qE "(heroContent|stats|services|faqItems|processSteps|whyMe)"
    }
}

@test "HomePage.tsx is reduced to <50 lines (Null-Diff refactor)" {
  lines=$(wc -l < "$REPO/mentolder-web/src/pages/HomePage.tsx")
  [ "$lines" -lt 50 ]
}

@test "no block component imports content.ts" {
  for f in $(find "$REPO/mentolder-web/src/blocks" -name "*.tsx" -not -name "*.test.tsx"); do
    if grep -qE "from '@/content'" "$f"; then
      echo "Block imports content.ts: $f"
      return 1
    fi
  done
}

# ── Test stack contract ────────────────────────────────────────

@test "vitest config has jsdom environment and @ alias" {
  run grep "jsdom" "$REPO/mentolder-web/vitest.config.ts"
  [ "$status" -eq 0 ]
  run grep "find: '@'" "$REPO/mentolder-web/vitest.config.ts"
  [ "$status" -eq 0 ]
}

@test "SVG ?react imports are stubbed in vitest config" {
  run grep -E "svg.*react" "$REPO/mentolder-web/vitest.config.ts"
  [ "$status" -eq 0 ]
  [ -f "$REPO/mentolder-web/src/test/svg-stub.tsx" ]
}
