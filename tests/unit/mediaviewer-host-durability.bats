#!/usr/bin/env bats
# Regression: the Sidekick mediaviewer (mediaviewer.<domain>) must survive a prod deploy.
#
# Bug this guards against:
#   prod/configmap-domains.yaml carried no MEDIAVIEWER_HOST, so the strategic-merge
#   over base k3d/configmap-domains.yaml left the live domain-config (both the
#   workspace and website namespaces) with the dev value `mediaviewer.localhost`.
#   The website reads MEDIAVIEWER_HOST from domain-config (configMapKeyRef) and
#   passes it through PortalLayout (SSR) → PortalSidekick → MediaviewerPanel, which
#   builds `widgetOrigin = https://<MEDIAVIEWER_HOST>`. With the dev value the embed
#   iframe loaded https://mediaviewer.localhost/embed.html (dead in prod) and every
#   postMessage targeted the dev origin → console error on web.<domain> and a broken
#   mediaviewer panel. Mirrors the RECOVER_DOMAIN durability bug [T000398].

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  PROD_DOMAINS="$REPO_ROOT/prod/configmap-domains.yaml"
  BASE_DOMAINS="$REPO_ROOT/k3d/configmap-domains.yaml"
  TASKFILE="$REPO_ROOT/Taskfile.yml"
  WEBSITE="$REPO_ROOT/k3d/website.yaml"
}

@test "prod domain-config defines MEDIAVIEWER_HOST (else merge leaves dev mediaviewer.localhost)" {
  run grep -qE '^[[:space:]]+MEDIAVIEWER_HOST:' "$PROD_DOMAINS"
  [ "$status" -eq 0 ]
}

@test "prod MEDIAVIEWER_HOST derives from \${PROD_DOMAIN} (not a hardcoded host)" {
  run grep -qE '^[[:space:]]+MEDIAVIEWER_HOST:[[:space:]]*"mediaviewer\.\$\{PROD_DOMAIN\}"' "$PROD_DOMAINS"
  [ "$status" -eq 0 ]
}

@test "prod deploy envsubst list includes PROD_DOMAIN (fills MEDIAVIEWER_HOST placeholder)" {
  # The prod-overlay deploy pipes kustomize output through envsubst "$ENVSUBST_VARS";
  # PROD_DOMAIN must be in that list so MEDIAVIEWER_HOST: "mediaviewer.${PROD_DOMAIN}"
  # is substituted rather than reaching the cluster literally.
  run grep -qE 'ENVSUBST_VARS=.*PROD_DOMAIN' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "website Deployment still sources MEDIAVIEWER_HOST from domain-config" {
  # Non-regression: the consumer wiring the fix depends on must stay intact.
  run grep -qF 'key: MEDIAVIEWER_HOST' "$WEBSITE"
  [ "$status" -eq 0 ]
}

@test "base domain-config keeps the dev mediaviewer.localhost value (patch-only override)" {
  # The base is the dev SSOT; prod must override via the patch, not by editing base.
  run grep -qE '^[[:space:]]+MEDIAVIEWER_HOST:[[:space:]]*"mediaviewer\.localhost"' "$BASE_DOMAINS"
  [ "$status" -eq 0 ]
}
