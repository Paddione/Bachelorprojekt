---
title: "lighthouse-perf-90 — Implementation Plan"
ticket_id: T001922
domains: [website, infra]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# lighthouse-perf-90 — Implementation Plan

_Ticket: T001922 — Lighthouse Performance Score public website 60 → ≥90._

The baseline (T001911, LHCI 3 runs) is score 60 with FCP 6.0s / LCP 7.5s but TBT 0ms
and CLS 0 — a pure delivery problem (transfer size + request chains), not JS/layout.
The four levers from the design spec are E1 edge compression + static-asset caching,
E2 hero LCP image, E3 single font path, E4 deferred hydration.

## File Structure

Changed files:

```
tests/spec/website-core.bats                              # + structure tests (RED → GREEN)
k3d/website.yaml                                           # E1: website-compress + website-static-cache Middlewares, IngressRoute binding + /_astro/ route
prod-fleet/website-mentolder/website-ingress-web.yaml      # E1: bind compress (all) + static-cache (/_astro/) on the prod HTTPS k8s Ingress
prod-fleet/website-korczewski/kustomization.yaml           # E1: append compress + static-cache to the IngressRoute middleware patch
website/src/config/brands/mentolder.ts                     # E2: avatarSrc /gerald.jpg → /gerald.webp
website/src/components/Portrait.svelte                     # E2: img eager + fetchpriority + width/height
website/src/styles/global.css                              # E3: drop Google-Fonts @import
website/src/layouts/Layout.astro                           # E4: CookieConsent + PortalSidekick client:load → client:idle
website/src/data/test-inventory.json                       # regenerated after test additions
```

S1 line budgets for the gated files touched (effective threshold − current `wc -l`;
all three are unbaselined, so threshold = static extension limit, and all edits are
attribute-only / one-liners well within budget):

| File | Ist | Budget |
| `website/src/layouts/Layout.astro` | 104 | 296 |
| `website/src/components/Portrait.svelte` | 272 | 228 |
| `website/src/config/brands/mentolder.ts` | 428 | 172 |

Ungated (no S1 budget): `k3d/website.yaml` (`.yaml`), `website/src/styles/global.css`
(`.css`), the two overlay files (`.yaml`), and `tests/spec/website-core.bats` (`.bats`).

Real anchors (from `intel.json`): `Portrait.svelte:31` `<img src={avatarSrc} … loading="lazy" />`;
`mentolder.ts:81` `avatarSrc: '/gerald.jpg'`; `Layout.astro:83` font `<link>` (kept) and
`Layout.astro:101-102` `<CookieConsent client:load />` / `<PortalSidekick client:load />`;
`global.css:2` Google-Fonts `@import`; `k3d/website.yaml:510-525` the `traefik.io/v1alpha1`
`IngressRoute` named `website` (single `web`-entryPoint route, no `middlewares:` list yet).
`gerald.webp` intrinsic size measured below is 600×600.

Middleware-namespace convention (verified in-repo): mentolder serves prod HTTPS through the
k8s `Ingress` `website-ingress-web` (namespace `website`) whose
`traefik.ingress.kubernetes.io/router.middlewares` annotation lists middlewares as
`<namespace>-<name>@kubernetescrd` (existing refs use `workspace-…@kubernetescrd`). korczewski
instead patches the base `IngressRoute` and references middlewares in-namespace
(`website-korczewski`, because its Traefik has `allowCrossNamespace=false`). E1 therefore wires
both mechanisms so compression is actually live for both brands, not just the dev HTTP route.

## Task 1 — RED: structure tests that prove the current state is wrong

`target_files`: `tests/spec/website-core.bats`

Append nine `@test` cases to the existing suite (SSOT `openspec/specs/website-core.md`),
matching only on structure — never on brand domains (S3). First add the file-path vars
next to the existing var block near the top of the file:

```bash
PERF_WEBSITE_YAML="$BATS_TEST_DIRNAME/../../k3d/website.yaml"
PERF_PORTRAIT="$BATS_TEST_DIRNAME/../../website/src/components/Portrait.svelte"
PERF_MENTOLDER_TS="$BATS_TEST_DIRNAME/../../website/src/config/brands/mentolder.ts"
PERF_GLOBAL_CSS="$BATS_TEST_DIRNAME/../../website/src/styles/global.css"
PERF_LAYOUT="$BATS_TEST_DIRNAME/../../website/src/layouts/Layout.astro"
PERF_MENTOLDER_ING="$BATS_TEST_DIRNAME/../../prod-fleet/website-mentolder/website-ingress-web.yaml"
PERF_KORCZEWSKI_KUST="$BATS_TEST_DIRNAME/../../prod-fleet/website-korczewski/kustomization.yaml"
```

Then the tests (each asserts the post-implementation shape, so they fail today):

```bash
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

@test "T001922 perf: Layout.astro hydrates CookieConsent + PortalSidekick client:idle" {
  run grep -q '<CookieConsent client:idle' "$PERF_LAYOUT"; [ "$status" -eq 0 ]
  run grep -q '<PortalSidekick client:idle' "$PERF_LAYOUT"; [ "$status" -eq 0 ]
  run grep -q '<CookieConsent client:load' "$PERF_LAYOUT"; [ "$status" -ne 0 ]
  run grep -q '<PortalSidekick client:load' "$PERF_LAYOUT"; [ "$status" -ne 0 ]
}

@test "T001922 perf: mentolder prod Ingress binds website-compress" {
  run grep -q 'website-compress' "$PERF_MENTOLDER_ING"; [ "$status" -eq 0 ]
}

@test "T001922 perf: korczewski overlay binds website-compress to the IngressRoute" {
  run grep -q 'website-compress' "$PERF_KORCZEWSKI_KUST"; [ "$status" -eq 0 ]
}
```

Run them and confirm red:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats
# expected: FAIL (red — none of E1–E4 are implemented yet)
```

Acceptance: the nine new tests all fail on the current branch; the pre-existing tests in
the file still pass.

## Task 2 — E1: Traefik compression + immutable static-cache, wired for both brands

`target_files`: `k3d/website.yaml`, `prod-fleet/website-mentolder/website-ingress-web.yaml`, `prod-fleet/website-korczewski/kustomization.yaml`

Step 2.1 — In `k3d/website.yaml`, replace the IngressRoute block (`intel.json` line ~510)
with two Middleware definitions plus the compress-bound route set. Keep the existing
`${WEBSITE_HOST}` / `${WEBSITE_PRIMARY_SERVICE}` / `${WEBSITE_NAMESPACE}` templating — no
literal hostnames (S3). Traefik's `compress` default excludes `text/event-stream`, so the
admin SSE endpoints stay unbuffered.

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: website-compress
  namespace: ${WEBSITE_NAMESPACE}
spec:
  compress: {}
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: website-static-cache
  namespace: ${WEBSITE_NAMESPACE}
spec:
  headers:
    customResponseHeaders:
      Cache-Control: "public, max-age=31536000, immutable"
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: website
  namespace: ${WEBSITE_NAMESPACE}
  labels:
    app: website
spec:
  entryPoints:
    - web
  routes:
    # Content-hashed assets: compress + one-year immutable cache (higher priority via longer rule)
    - kind: Rule
      match: Host(`${WEBSITE_HOST}`) && PathPrefix(`/_astro/`)
      middlewares:
        - name: website-compress
        - name: website-static-cache
      services:
        - name: ${WEBSITE_PRIMARY_SERVICE}
          port: 80
    # Everything else: compress only
    - kind: Rule
      match: Host(`${WEBSITE_HOST}`)
      middlewares:
        - name: website-compress
      services:
        - name: ${WEBSITE_PRIMARY_SERVICE}
          port: 80
```

Step 2.2 — In `prod-fleet/website-mentolder/website-ingress-web.yaml` (the prod HTTPS path),
add `website-website-compress@kubernetescrd` to the existing `router.middlewares` annotation
(namespace-prefixed form; the Middleware lives in the `website` namespace alongside the Ingress),
and add a second `Ingress` document scoped to `/_astro/` that also carries
`website-website-static-cache@kubernetescrd` so the immutable header stays off HTML. Append the
new annotation value after the existing `workspace-…@kubernetescrd` refs and add the doc:

```yaml
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: website-ingress-astro
  namespace: website
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: >-
      website-website-compress@kubernetescrd,website-website-static-cache@kubernetescrd
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - web.${PROD_DOMAIN}
      secretName: workspace-wildcard-tls
  rules:
    - host: web.${PROD_DOMAIN}
      http:
        paths:
          - path: /_astro/
            pathType: Prefix
            backend:
              service:
                name: website
                port:
                  number: 80
```

Step 2.3 — In `prod-fleet/website-korczewski/kustomization.yaml`, extend the existing
IngressRoute JSON6902 patch so both routes keep `website-security-headers` and gain the two
perf middlewares (all in the `website-korczewski` namespace, since `allowCrossNamespace=false`).
Because Step 2.1 makes route `0` the `/_astro/` route, set both routes explicitly:

```yaml
- op: replace
  path: /spec/routes/0/middlewares
  value:
    - name: website-compress
      namespace: website-korczewski
    - name: website-static-cache
      namespace: website-korczewski
    - name: website-security-headers
      namespace: website-korczewski
- op: add
  path: /spec/routes/1/middlewares
  value:
    - name: website-compress
      namespace: website-korczewski
    - name: website-security-headers
      namespace: website-korczewski
```

Acceptance: the three `k3d/website.yaml` middleware/route tests and the two overlay tests from
Task 1 pass; `task workspace:validate` builds both `prod-fleet/website-mentolder` and
`prod-fleet/website-korczewski` overlays without error.

## Task 3 — E2: repair the hero LCP image

`target_files`: `website/src/config/brands/mentolder.ts`, `website/src/components/Portrait.svelte`

Step 3.1 — Confirm the WebP intrinsic size to use for the attributes (do not guess):

```bash
node -e 'const b=require("fs").readFileSync("website/public/gerald.webp");console.log(b.readUInt16LE(26)&0x3fff, b.readUInt16LE(28)&0x3fff)'
# prints: 600 600
```

Step 3.2 — In `website/src/config/brands/mentolder.ts` line 81, point the avatar at the
17 KB WebP (the 176 KB JPEG is 10× larger):

```ts
avatarSrc: '/gerald.webp',
```

Step 3.3 — In `website/src/components/Portrait.svelte` line 31, make the above-the-fold LCP
image eager and prioritized with explicit dimensions (Portrait is only ever used in the hero):

```svelte
<img src={avatarSrc} alt={`${name}, ${role}`} loading="eager" fetchpriority="high" width="600" height="600" />
```

Acceptance: the `Portrait.svelte` and `mentolder.ts` tests from Task 1 pass.
<!-- vitest: kein neuer Test nötig — reine Attribut-/Config-Änderung, durch die BATS-Struktur-Tests abgedeckt -->

## Task 4 — E3 + E4: single font path and deferred hydration

`target_files`: `website/src/styles/global.css`, `website/src/layouts/Layout.astro`

Step 4.1 — In `website/src/styles/global.css`, delete the font-provider `@import` on line 2
(the `@import "tailwindcss";` on line 1 stays). The layout `<link>` at `Layout.astro:83`
(with its `preconnect` + `display=swap`) remains the single font source.

Step 4.2 — In `website/src/layouts/Layout.astro` lines 101–102, downgrade the two
non-render-critical islands from load- to idle-time hydration (`Navigation` and `Hero` keep
`client:load`):

```astro
<CookieConsent client:idle />
<PortalSidekick client:idle />
```

Acceptance: the `global.css` and `Layout.astro` tests from Task 1 pass.

## Task 5 — GREEN + final CI gates (pre-merge)

`target_files`: `tests/spec/website-core.bats`, `website/src/data/test-inventory.json`

Step 5.1 — Re-run the suite; the nine new tests must now be green:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats
# expected: PASS (green — E1–E4 implemented)
```

Step 5.2 — Validate the manifests (E1 touched the base + both prod overlays):

```bash
task workspace:validate
```

Step 5.3 — Regenerate the test inventory (a test file changed) and commit it alongside:

```bash
task test:inventory   # updates website/src/data/test-inventory.json
```

Step 5.4 — Run the three mandatory CI gates and confirm green before opening the PR:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Acceptance: `website-core.bats` fully green, `task workspace:validate` clean,
`test-inventory.json` regenerated and staged, and all three gate commands pass.

## Task 6 — Post-deploy: LHCI measurement + G-FE05 goal update (after merge)

`target_files`: `.claude/lib/goals.md`

This task runs after the PR merges to `main` and the push-based website build/deploy has rolled
out (~3–4 min per `website/CLAUDE.md`); the live score is not a CI gate. Measure with LHCI
against the public homepage (URL resolved from env/config, not hardcoded), targeting the
existing `lighthouserc.json` assertion of performance ≥ 0.9:

```bash
npx @lhci/cli autorun --collect.url="https://${WEBSITE_HOST}"
```

Confirm the compression opportunity is gone and LCP is well under the baseline 7.5s, then update
the G-FE05 line in `.claude/lib/goals.md` with the new measured score (replacing the recorded
baseline of 60) and the measurement date.

Acceptance: LHCI reports performance ≥ 0.9, the text-compression opportunity no longer appears,
and G-FE05 in `.claude/lib/goals.md` reflects the new score. If the score stays < 90, open a
follow-up ticket for the deferred levers (font self-hosting, unused-JS reduction) per the design
spec's Non-Ziele.
