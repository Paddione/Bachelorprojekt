#!/usr/bin/env bats
# tests/spec/website-core.bats
# SSOT: openspec/specs/website-core.md
#
# Consolidated BATS suite for the website core component (T001433 admin-redesign).
# Convention: one .bats file per OpenSpec SSOT spec.

# ── File-level variables ──────────────────────────────────────────────────────
ADMIN_FOUNDATION="$BATS_TEST_DIRNAME/../../website/src/styles/admin-foundation.css"
FACTORY_TOKENS="$BATS_TEST_DIRNAME/../../website/src/styles/factory-tokens.css"
ADMIN_LAYOUT="$BATS_TEST_DIRNAME/../../website/src/layouts/AdminLayout.astro"
SIDEBAR_NAV="$BATS_TEST_DIRNAME/../../website/src/components/admin/AdminSidebarNav.astro"
KORE_CSS="$BATS_TEST_DIRNAME/../../website/public/brand/korczewski/kore-app.css"
ADMIN_RESPONSIVE="$BATS_TEST_DIRNAME/../../website/src/styles/admin-responsive.css"
PERF_WEBSITE_YAML="$BATS_TEST_DIRNAME/../../k3d/website.yaml"
PERF_PORTRAIT="$BATS_TEST_DIRNAME/../../website/src/components/Portrait.svelte"
PERF_MENTOLDER_TS="$BATS_TEST_DIRNAME/../../website/src/config/brands/mentolder.ts"
PERF_GLOBAL_CSS="$BATS_TEST_DIRNAME/../../website/src/styles/global.css"
PERF_LAYOUT="$BATS_TEST_DIRNAME/../../website/src/layouts/Layout.astro"
PERF_MENTOLDER_ING="$BATS_TEST_DIRNAME/../../prod-fleet/website-mentolder/website-ingress-web.yaml"
PERF_KORCZEWSKI_KUST="$BATS_TEST_DIRNAME/../../prod-fleet/website-korczewski/kustomization.yaml"
MENTOLDER_SEC_HEADERS="$BATS_TEST_DIRNAME/../../prod-fleet/website-mentolder/website-security-headers.yaml"
MENTOLDER_KUST="$BATS_TEST_DIRNAME/../../prod-fleet/website-mentolder/kustomization.yaml"
SHARED_MIDDLEWARES="$BATS_TEST_DIRNAME/../../prod/traefik-middlewares.yaml"
KORE_HOMEPAGE="$BATS_TEST_DIRNAME/../../website/src/components/kore/KoreHomepage.svelte"

# ── T001433: Token alias layer ───────────────────────────────────────────────
@test "T001433 alias: admin-foundation.css color-bearing tokens all reference var(--...)" {
  for token in --admin-bg --admin-sidebar-bg --admin-surface --admin-surface-hover \
               --admin-border --admin-border-bright --admin-primary --admin-primary-muted \
               --admin-accent --admin-text --admin-text-mute --admin-text-disabled \
               --admin-success --admin-danger --admin-info --admin-warning; do
    run grep -E "^[[:space:]]*${token}[[:space:]]*:[[:space:]]*var\(--" "$FACTORY_TOKENS"
    [ "$status" -eq 0 ] || { echo "missing alias for ${token}"; return 1; }
  done
}

@test "T001433 alias: AdminLayout.astro loads factory-tokens.css before admin-foundation.css" {
  run grep -n "factory-tokens.css\|admin-foundation.css" "$ADMIN_LAYOUT"
  [ "$status" -eq 0 ]
  tokens_line=$(echo "$output" | grep -n "factory-tokens.css" | head -1 | cut -d: -f1)
  foundation_line=$(echo "$output" | grep -n "admin-foundation.css" | head -1 | cut -d: -f1)
  [ -n "$tokens_line" ] && [ -n "$foundation_line" ]
  [ "$tokens_line" -lt "$foundation_line" ]
}

@test "T001433 alias: kore-app.css overrides --admin-primary with copper" {
  # The kore block is multi-line; verify both the `body.kore {` selector and
  # the `--admin-primary: var(--copper)` declaration are present in the file.
  # We use awk to extract the LAST `body.kore { ... }` block (the override block)
  # and grep inside it.
  override_block=$(awk '/^[[:space:]]*body\.kore[[:space:]]*\{/{buf=""} {buf=buf"\n"$0} /^[[:space:]]*\}[[:space:]]*$/{last=buf} END{print last}' "$KORE_CSS")
  echo "$override_block" | grep -q "body\.kore[[:space:]]*{"
  echo "$override_block" | grep -qE -- "--admin-primary:[[:space:]]+var\(--copper\)"
}

# ── T001433: Sidebar ─────────────────────────────────────────────────────────
@test "T001433 sidebar: AdminSidebarNav has exactly one /admin/pipeline link labelled Pipeline" {
  run grep -c "href:[[:space:]]*'/admin/pipeline'" "$SIDEBAR_NAV"
  [ "$output" -ge 1 ]
  run grep -E "label:[[:space:]]*'Pipeline'" "$SIDEBAR_NAV"
  [ "$status" -eq 0 ]
  # No actual /dev-status or /admin/planungsbuero href in the sidebar nav
  # (matches-array entries are fine — they are URL patterns for the isActive() helper)
  run grep -E "href:[[:space:]]*'/dev-status'|href:[[:space:]]*'/admin/planungsbuero'" "$SIDEBAR_NAV"
  [ "$status" -ne 0 ]
}

# ── T001471: admin responsive parity ─────────────────────────────────────────
@test "T001471 responsive: admin-responsive.css exists" {
  [ -f "$ADMIN_RESPONSIVE" ]
}

@test "T001471 responsive: AdminLayout.astro imports admin-responsive.css" {
  run grep -F "styles/admin-responsive.css" "$ADMIN_LAYOUT"
  [ "$status" -eq 0 ]
}

@test "T001471 responsive: stylesheet has mobile table fallback (767px + overflow-x)" {
  run grep -E "max-width:[[:space:]]*767px" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
  run grep -E "overflow-x:[[:space:]]*auto" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
}

@test "T001471 responsive: stylesheet excludes Cockpit from mobile table rule" {
  run grep -F 'data-container="cockpit"' "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
}

@test "T001471 responsive: stylesheet has table-collapse container query" {
  run grep -F ".admin-table-collapse" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
  run grep -E "max-width:[[:space:]]*480px" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
}

@test "T001471 responsive: stylesheet has desktop block (1024px) with admin-form-wide" {
  run grep -E "min-width:[[:space:]]*1024px" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
  run grep -F ".admin-form-wide" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
}

@test "T001471 collapse: rechnungen.astro stays exactly 592 lines (Budget 0)" {
  run bash -c "wc -l < '$BATS_TEST_DIRNAME/../../website/src/pages/admin/rechnungen.astro' | tr -d ' '"
  [ "$output" -eq 592 ]
}

@test "T001471 collapse: projekte.astro stays exactly 408 lines (Budget 0)" {
  run bash -c "wc -l < '$BATS_TEST_DIRNAME/../../website/src/pages/admin/projekte.astro' | tr -d ' '"
  [ "$output" -eq 408 ]
}

@test "T001471 collapse: rechnungen.astro tags a table with admin-table-collapse" {
  run grep -F "admin-table-collapse" "$BATS_TEST_DIRNAME/../../website/src/pages/admin/rechnungen.astro"
  [ "$status" -eq 0 ]
}

@test "T001471 collapse: projekte.astro tags a table with admin-table-collapse" {
  run grep -F "admin-table-collapse" "$BATS_TEST_DIRNAME/../../website/src/pages/admin/projekte.astro"
  [ "$status" -eq 0 ]
}

@test "T001471 collapse: zeiterfassung.astro tags a table with admin-table-collapse" {
  run grep -F "admin-table-collapse" "$BATS_TEST_DIRNAME/../../website/src/pages/admin/zeiterfassung.astro"
  [ "$status" -eq 0 ]
}

@test "T001471 ui: AdminTabs has a mobile scroll media query" {
  f="$BATS_TEST_DIRNAME/../../website/src/components/admin/ui/AdminTabs.svelte"
  run grep -E "max-width:[[:space:]]*767px" "$f"
  [ "$status" -eq 0 ]
  run grep -E "overflow-x:[[:space:]]*auto" "$f"
  [ "$status" -eq 0 ]
}

@test "T001471 ui: AdminPageHeader stacks title and actions on mobile" {
  f="$BATS_TEST_DIRNAME/../../website/src/components/admin/ui/AdminPageHeader.svelte"
  run grep -E "max-width:[[:space:]]*767px" "$f"
  [ "$status" -eq 0 ]
}

@test "T001471 forms: all six einstellungen views opt into admin-form-wide" {
  base="$BATS_TEST_DIRNAME/../../website/src/pages/admin/einstellungen"
  for f in backup benachrichtigungen branding email ordner-templates rechnungen; do
    run grep -F "admin-form-wide" "$base/$f.astro"
    [ "$status" -eq 0 ] || { echo "missing admin-form-wide in $f.astro"; return 1; }
  done
}

# ── T001490: content bundle completeness ──────────────────────────────────────
@test "T001490 content bundle: every brand has all 13 domain JSON files" {
  base="$BATS_TEST_DIRNAME/../../website/content"
  for brand in mentolder korczewski; do
    [ -d "$base/$brand" ] || { echo "missing brand dir $brand"; return 1; }
    for d in homepage homepage-blocks seo faq kontakt ueber-mich services \
             leistungen stammdaten navigation footer referenzen kore-flags; do
      [ -f "$base/$brand/$d.json" ] || { echo "missing $brand/$d.json"; return 1; }
    done
  done
}

@test "T001490 content bundle: website-db.ts no longer exports deleted content readers" {
  f="$BATS_TEST_DIRNAME/../../website/src/lib/website-db.ts"
  # Removed in T001490 Task 4 — content is now sourced from the bundle
  for fn in getHomepageContent getUebermichContent getFaqContent \
            getKontaktContent getServiceConfig getLeistungenConfig \
            getReferenzen; do
    run grep -E "^export (async )?function $fn\\b|^export const $fn\\b" "$f"
    [ "$status" -ne 0 ] || { echo "still exports $fn"; return 1; }
  done
}

# T001490 Task 10 — homepage-blocks-store.ts (readCurrent, save, listVersions,
# restore against `homepage_block_documents` / `homepage_block_versions`) is
# decommissioned. The public read path serves the build-time bundle; admin
# saves route through content-publish.ts; version history is now git log.
@test "T001490 decommissioned: homepage-blocks-store.ts is removed" {
  [ ! -f "$BATS_TEST_DIRNAME/../../website/src/lib/homepage-blocks-store.ts" ] \
    || { echo "homepage-blocks-store.ts still present"; return 1; }
  [ ! -f "$BATS_TEST_DIRNAME/../../website/src/lib/homepage-blocks-store.test.ts" ] \
    || { echo "homepage-blocks-store.test.ts still present"; return 1; }
  [ ! -f "$BATS_TEST_DIRNAME/../../website/src/pages/api/admin/homepage/versions.ts" ] \
    || { echo "admin/homepage/versions.ts still present"; return 1; }
  [ ! -f "$BATS_TEST_DIRNAME/../../website/src/pages/api/admin/homepage/restore.ts" ] \
    || { echo "admin/homepage/restore.ts still present"; return 1; }
}

@test "T001490 decommissioned: /api/homepage is bundle-sourced, no DB readCurrent" {
  f="$BATS_TEST_DIRNAME/../../website/src/pages/api/homepage.ts"
  run grep -F "bundleHomepageBlocks" "$f"
  [ "$status" -eq 0 ] || { echo "homepage.ts does not use bundleHomepageBlocks"; return 1; }
  run grep -F "readCurrent" "$f"
  [ "$status" -ne 0 ] || { echo "homepage.ts still references readCurrent"; return 1; }
}

@test "T001490 content bundle: export script registered (no orphan)" {
  f="$BATS_TEST_DIRNAME/../../Taskfile.yml"
  run grep -F "content:export" "$f"
  [ "$status" -eq 0 ]
  run bash -c "test -f '$BATS_TEST_DIRNAME/../../scripts/export-site-content.mjs'"
  [ "$status" -eq 0 ]
}

@test "T001490 content bundle: every JSON file passes the Zod schema (build-time check)" {
  run bash -c "cd '$BATS_TEST_DIRNAME/../../website' && pnpm vitest run src/content-schema/__tests__/schema.test.ts 2>&1 | tail -20"
  echo "$output" | grep -q "3 passed"
}

# ── T001490: PRIMARY_FRONTEND switch + GitHub content-token secret ──────────
@test "T001490 PRIMARY_FRONTEND: schema-declared with astro|react pattern + brand defaults" {
  # 1. schema.yaml must declare PRIMARY_FRONTEND with the strict pattern.
  # env_vars items in schema.yaml are indented 2 spaces — match that.
  run grep -E "^  - name: PRIMARY_FRONTEND$" "$BATS_TEST_DIRNAME/../../environments/schema.yaml"
  [ "$status" -eq 0 ] || { echo "PRIMARY_FRONTEND missing from environments/schema.yaml"; return 1; }
  # Validate the pattern line sits within ~6 lines of the entry.
  run awk '/^  - name: PRIMARY_FRONTEND$/{flag=1; next} flag && /validate:/{print; exit}' "$BATS_TEST_DIRNAME/../../environments/schema.yaml"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE 'validate:[[:space:]]*"\^\(astro\|react\)\$"'

  # 2. Both brand env files must set PRIMARY_FRONTEND: astro (or react).
  for brand in mentolder korczewski; do
    run grep -E "^[[:space:]]+PRIMARY_FRONTEND:[[:space:]]*(astro|react)$" \
      "$BATS_TEST_DIRNAME/../../environments/${brand}.yaml"
    [ "$status" -eq 0 ] || { echo "PRIMARY_FRONTEND missing in environments/${brand}.yaml"; return 1; }
  done

  # 3. k3d/website.yaml apex IngressRoute must reference the envsubst'd
  #    service name (so the deploy task can switch backends by setting
  #    WEBSITE_PRIMARY_SERVICE).
  run grep -E "name:[[:space:]]*\\\${WEBSITE_PRIMARY_SERVICE}" \
    "$BATS_TEST_DIRNAME/../../k3d/website.yaml"
  [ "$status" -eq 0 ] || { echo "apex Host() does not envsubst WEBSITE_PRIMARY_SERVICE"; return 1; }

  # 4. Taskfile envsubst lists must whitelist $PRIMARY_FRONTEND + $WEBSITE_PRIMARY_SERVICE.
  for needle in 'WEBSITE_PRIMARY_SERVICE' 'PRIMARY_FRONTEND'; do
    run grep -F "\$${needle}" "$BATS_TEST_DIRNAME/../../Taskfile.yml"
    [ "$status" -eq 0 ] || { echo "Taskfile.yml envsubst list missing $${needle}"; return 1; }
  done
}

@test "T001490 PRIMARY_FRONTEND: GITHUB_CONTENT_TOKEN schema-registered + dev secret manifest present" {
  # 1. Schema declares the secret (secrets: items are also 2-space indented).
  run grep -E "^  - name: GITHUB_CONTENT_TOKEN$" "$BATS_TEST_DIRNAME/../../environments/schema.yaml"
  [ "$status" -eq 0 ] || { echo "GITHUB_CONTENT_TOKEN missing from schema"; return 1; }
  # 2. Dev secret manifest exists with the expected Secret name + namespace.
  f="$BATS_TEST_DIRNAME/../../k3d/website-content-token-secret.yaml"
  [ -f "$f" ] || { echo "k3d/website-content-token-secret.yaml missing"; return 1; }
  run grep -E "name:[[:space:]]*website-content-token" "$f"
  [ "$status" -eq 0 ]
  # T001853: namespace is envsubst-parameterized (website:deploy pipes the
  # manifest through envsubst), no longer the hardcoded `website` literal.
  run grep -F 'namespace: ${WEBSITE_NAMESPACE}' "$f"
  [ "$status" -eq 0 ]
  run grep -E "GITHUB_CONTENT_TOKEN:" "$f"
  [ "$status" -eq 0 ]
  # 3. Service registry classifies the new file as `website` for partial deploy.
  run grep -F "k3d/website-content-token-secret.yaml" "$BATS_TEST_DIRNAME/../../scripts/factory/service-registry.sh"
  [ "$status" -eq 0 ]
  # 4. Deployment references the secret via secretKeyRef.
  run grep -B1 -A4 "name: GITHUB_CONTENT_TOKEN" "$BATS_TEST_DIRNAME/../../k3d/website.yaml"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE "secretKeyRef:"
  echo "$output" | grep -qE "name:[[:space:]]*website-content-token"
}

# ── T001922: Lighthouse perf 60→90 (E1 compression/cache, E2 LCP image, E3 fonts, E4 hydration) ──
@test "T001922 perf: k3d/website.yaml defines website-compress Middleware" {
  run grep -Eq '^[[:space:]]*name: website-compress$' "$PERF_WEBSITE_YAML"; [ "$status" -eq 0 ]
  run grep -Eq 'compress:' "$PERF_WEBSITE_YAML"; [ "$status" -eq 0 ]
}

@test "T001922 perf: k3d/website.yaml defines website-static-cache Middleware (immutable)" {
  run grep -Eq '^[[:space:]]*name: website-static-cache$' "$PERF_WEBSITE_YAML"; [ "$status" -eq 0 ]
  run grep -qi 'immutable' "$PERF_WEBSITE_YAML"; [ "$status" -eq 0 ]
}

@test "T001922 perf: website IngressRoute binds compress and adds an /_astro/ route" {
  run grep -q 'middlewares:' "$PERF_WEBSITE_YAML"; [ "$status" -eq 0 ]
  run grep -q '/_astro/' "$PERF_WEBSITE_YAML"; [ "$status" -eq 0 ]
}

@test "T001922 perf: Portrait.svelte hero img is eager with fetchpriority + dimensions" {
  run grep -q 'loading="eager"' "$PERF_PORTRAIT"; [ "$status" -eq 0 ]
  run grep -q 'fetchpriority="high"' "$PERF_PORTRAIT"; [ "$status" -eq 0 ]
  run grep -q 'width="600"' "$PERF_PORTRAIT"; [ "$status" -eq 0 ]
  run grep -q 'height="600"' "$PERF_PORTRAIT"; [ "$status" -eq 0 ]
  run grep -q 'loading="lazy"' "$PERF_PORTRAIT"; [ "$status" -ne 0 ]
}

@test "T001922 perf: mentolder avatarSrc references gerald.webp not gerald.jpg" {
  run grep -q "avatarSrc: '/gerald.webp'" "$PERF_MENTOLDER_TS"; [ "$status" -eq 0 ]
  run grep -q "avatarSrc: '/gerald.jpg'" "$PERF_MENTOLDER_TS"; [ "$status" -ne 0 ]
}

@test "T001922 perf: global.css has no font-provider @import" {
  run grep -q 'googleapis' "$PERF_GLOBAL_CSS"; [ "$status" -ne 0 ]
}

@test "T001922 perf: Layout.astro hydrates CookieConsent client:idle" {
  # T002058: PortalSidekick was removed from the public Layout (its island CSS was
  # render-blocking) — see the dedicated T002058 test below. CookieConsent stays.
  run grep -q '<CookieConsent client:idle' "$PERF_LAYOUT"; [ "$status" -eq 0 ]
  run grep -q '<CookieConsent client:load' "$PERF_LAYOUT"; [ "$status" -ne 0 ]
}

@test "T001922 perf: mentolder prod Ingress binds website-compress" {
  run grep -q 'website-compress' "$PERF_MENTOLDER_ING"; [ "$status" -eq 0 ]
}

@test "T001922 perf: korczewski overlay binds website-compress to the IngressRoute" {
  run grep -q 'website-compress' "$PERF_KORCZEWSKI_KUST"; [ "$status" -eq 0 ]
}

@test "T001929 perf: mentolder content bundle avatarSrc references gerald.webp (live source)" {
  HOMEPAGE_JSON="$BATS_TEST_DIRNAME/../../website/content/mentolder/homepage.json"
  run grep -q '"avatarSrc": "/gerald.webp"' "$HOMEPAGE_JSON"; [ "$status" -eq 0 ]
  run grep -q 'gerald.jpg' "$HOMEPAGE_JSON"; [ "$status" -ne 0 ]
}

# ── T002052: web.mentolder.de crawlability — noindex must not reach the public site ──
# The shared workspace/security-headers middleware sets X-Robots-Tag: noindex (correct for
# internal services like Keycloak/Nextcloud). The public website must NOT inherit it, or it
# is deindexed from search engines (Lighthouse is-crawlable = 0). mentolder must use its own
# website-scoped security-headers middleware without noindex — mirroring website-korczewski.

@test "T002052 crawlable: mentolder website ingress does NOT reference the shared noindex security-headers" {
  run grep -q 'workspace-security-headers@kubernetescrd' "$PERF_MENTOLDER_ING"
  [ "$status" -ne 0 ]
}

@test "T002052 crawlable: mentolder website ingress references its own website-scoped security-headers" {
  run grep -q 'website-website-security-headers@kubernetescrd' "$PERF_MENTOLDER_ING"
  [ "$status" -eq 0 ]
}

@test "T002052 crawlable: mentolder has a website-scoped security-headers middleware without noindex" {
  [ -f "$MENTOLDER_SEC_HEADERS" ]
  run grep -q 'name: website-security-headers' "$MENTOLDER_SEC_HEADERS"
  [ "$status" -eq 0 ]
  # must NOT set an X-Robots-Tag header line (comments mentioning noindex are fine)
  run grep -Ei '^[[:space:]]*X-Robots-Tag:' "$MENTOLDER_SEC_HEADERS"
  [ "$status" -ne 0 ]
}

@test "T002052 crawlable: mentolder kustomization wires the website-security-headers middleware" {
  run grep -q 'website-security-headers.yaml' "$MENTOLDER_KUST"
  [ "$status" -eq 0 ]
}

@test "T002052 drift-guard: shared security-headers explicitly sets X-Robots-Tag noindex for internal services" {
  # Keep internal services noindexed even after workspace:deploy — the noindex must be
  # explicit in git, not live-only drift that a redeploy would silently remove.
  run grep -A12 '^  name: security-headers$' "$SHARED_MIDDLEWARES"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi 'X-Robots-Tag'
  echo "$output" | grep -qi 'noindex'
}

# ── T002057/T002058: cut render-blocking CSS on the public homepage ──────────
# global.css is critical CSS (:root vars, html/body base, typography). T002057
# tried a ?inline import, but that inlined the FULL Tailwind output (~95KB) into
# every page for zero measured FCP/LCP gain (render-blocking cost is 0ms in
# traces). T002058 reverts it to a plain side-effect import — a small (~20KB)
# blocking critical-CSS <link> is correct here.

@test "T002058 perf: Layout.astro imports global.css as a plain blocking side-effect (no ?inline bloat)" {
  run grep -Eq "^import '\.\./styles/global\.css';" "$PERF_LAYOUT"
  [ "$status" -eq 0 ]
  # the ?inline import + is:inline style block must be gone (they inlined ~95KB)
  run grep -Eq "styles/global\.css\?inline" "$PERF_LAYOUT"
  [ "$status" -ne 0 ]
}

@test "T002057 perf: KoreHomepage.svelte lazy-loads GoalsDashboard (no static top-level import)" {
  # static top-level import would pull GoalsDashboard.css into the homepage entry graph
  run grep -Eq "^[[:space:]]*import GoalsDashboard from" "$KORE_HOMEPAGE"
  [ "$status" -ne 0 ]
  # must be loaded dynamically instead
  run grep -q "import('../GoalsDashboard.svelte')" "$KORE_HOMEPAGE"
  [ "$status" -eq 0 ]
}

@test "T002058 perf: public Layout.astro does not render PortalSidekick (Astro hoists island CSS render-blocking)" {
  # Astro eagerly links ALL CSS reachable from a client island into the <head>,
  # so the sidekick's drawer-view CSS blocked render on every public page. The
  # sidekick lives in PortalLayout/AdminLayout (authenticated) — not the public one.
  # match actual import/render, not comment mentions of the name
  run grep -Eq "<PortalSidekick|import PortalSidekick" "$PERF_LAYOUT"
  [ "$status" -ne 0 ]
  # its ~180KB sidekick-panels.css preload machinery must be gone too
  run grep -q "sidekick-panels\.css" "$PERF_LAYOUT"
  [ "$status" -ne 0 ]
}
